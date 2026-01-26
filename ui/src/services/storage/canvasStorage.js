/**
 * Canvas Storage Service
 *
 * Handles localStorage operations for Canvas state persistence.
 * Provides semantic API for save/load/clear operations.
 */

const STORAGE_KEY = 'kokino-team-v1';

/**
 * Load saved canvas state from localStorage
 * @returns {Object|null} Saved state with nodes and edges, or null if not found
 */
export function loadCanvasState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;

    return JSON.parse(saved);
  } catch (error) {
    console.error('[canvasStorage] Failed to load state:', error);
    return null;
  }
}

/**
 * Save canvas state to localStorage
 * @param {Object} state - State object with nodes and edges
 * @param {Array} state.nodes - Canvas nodes
 * @param {Array} state.edges - Canvas edges
 */
export function saveCanvasState({ nodes, edges }) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ nodes, edges }));
    return true;
  } catch (error) {
    console.error('[canvasStorage] Failed to save state:', error);
    return false;
  }
}

/**
 * Clear saved canvas state
 */
export function clearCanvasState() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch (error) {
    console.error('[canvasStorage] Failed to clear state:', error);
    return false;
  }
}

/**
 * Check if there is saved canvas state
 * @returns {boolean}
 */
export function hasSavedState() {
  return localStorage.getItem(STORAGE_KEY) !== null;
}
