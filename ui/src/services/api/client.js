/**
 * Base API Client with Retry Logic
 * Phase 4a: Service Layer Foundation
 */

class APIClient {
  constructor(baseURL = import.meta.env.VITE_BROKER_URL || 'http://127.0.0.1:5050') {
    this.baseURL = baseURL;
    this.timeout = 30000;
    this.retryCount = 3;
    this.retryDelay = 1000; // Base delay in ms
  }

  /**
   * Make HTTP request with retry logic and timeout
   */
  async request(path, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    let lastError;
    for (let attempt = 0; attempt < this.retryCount; attempt++) {
      try {
        const response = await fetch(`${this.baseURL}${path}`, {
          ...options,
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            ...options.headers
          }
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({
            error: response.statusText
          }));
          throw new APIError(
            errorData.error || `HTTP ${response.status}`,
            response.status
          );
        }

        // Handle 204 No Content
        if (response.status === 204) {
          return null;
        }

        return response.json();
      } catch (error) {
        lastError = error;

        // Don't retry on abort or client errors
        if (error.name === 'AbortError' ||
            (error instanceof APIError && error.status < 500)) {
          throw error;
        }

        // Retry on network errors or 5xx
        if (attempt < this.retryCount - 1) {
          const delay = this.retryDelay * Math.pow(2, attempt); // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    clearTimeout(timeoutId);
    throw lastError;
  }

  get(path, options = {}) {
    const params = options.params
      ? '?' + new URLSearchParams(options.params).toString()
      : '';
    return this.request(path + params, { ...options, method: 'GET' });
  }

  post(path, data, options = {}) {
    return this.request(path, {
      ...options,
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  put(path, data, options = {}) {
    return this.request(path, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  patch(path, data, options = {}) {
    return this.request(path, {
      ...options,
      method: 'PATCH',
      body: JSON.stringify(data)
    });
  }

  delete(path, options = {}) {
    return this.request(path, { ...options, method: 'DELETE' });
  }
}

/**
 * Custom API Error class
 */
export class APIError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'APIError';
    this.status = status;
  }
}

// Export singleton instance
export default new APIClient();
