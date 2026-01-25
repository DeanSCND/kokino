// HTTP response helpers

export function jsonResponse(res, statusCode, body) {
  const payload = body ? JSON.stringify(body) : '';

  // Set status code and headers individually to allow middleware to add more headers
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Length', Buffer.byteLength(payload));
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  res.end(payload);
}

export function parseJson(req, includeRaw = false) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      try {
        const rawBuffer = Buffer.concat(chunks);
        const raw = rawBuffer.toString('utf8') || '{}';
        const data = JSON.parse(raw);

        if (includeRaw) {
          resolve({ data, raw, rawBuffer });
        } else {
          resolve(data);
        }
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

export function handleCors(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400');
    res.end();
    return true;
  }
  return false;
}
