/**
 * CanvasContextMenu - Right-click context menu
 * Phase 4c: Component Extraction
 */

import React, { useEffect, useRef } from 'react';
import useStore from '../../state/store.js';

export default function CanvasContextMenu() {
  const contextMenu = useStore(state => state.contextMenu);
  const closeContextMenu = useStore(state => state.closeContextMenu);
  const setChatAgent = useStore(state => state.setChatAgent);
  const setTerminalAgent = useStore(state => state.setTerminalAgent);
  const deleteNode = useStore(state => state.deleteNode);
  const deleteEdge = useStore(state => state.deleteEdge);

  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        closeContextMenu();
      }
    };

    if (contextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [contextMenu, closeContextMenu]);

  if (!contextMenu) return null;

  const { x, y, type, nodeId, edgeId } = contextMenu;

  const handleChatWithAgent = () => {
    if (nodeId) {
      setChatAgent(nodeId);
    }
    closeContextMenu();
  };

  const handleOpenTerminal = () => {
    if (nodeId) {
      setTerminalAgent(nodeId);
    }
    closeContextMenu();
  };

  const handleDeleteNode = () => {
    if (nodeId) {
      deleteNode(nodeId);
    }
    closeContextMenu();
  };

  const handleDeleteEdge = () => {
    if (edgeId) {
      deleteEdge(edgeId);
    }
    closeContextMenu();
  };

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{ top: y, left: x }}
    >
      {type === 'node' && (
        <>
          <button onClick={handleChatWithAgent}>
            💬 Chat with Agent
          </button>
          <button onClick={handleOpenTerminal}>
            🖥️ Open Terminal
          </button>
          <div className="menu-divider" />
          <button onClick={handleDeleteNode} className="menu-danger">
            🗑️ Delete Agent
          </button>
        </>
      )}

      {type === 'edge' && (
        <button onClick={handleDeleteEdge} className="menu-danger">
          🗑️ Delete Connection
        </button>
      )}

      {type === 'canvas' && (
        <button onClick={closeContextMenu}>
          Cancel
        </button>
      )}
    </div>
  );
}
