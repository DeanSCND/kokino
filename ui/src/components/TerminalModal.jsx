import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { X } from 'lucide-react';

export const TerminalModal = ({ agentId, onClose }) => {
  const terminalRef = useRef(null);
  const termRef = useRef(null);
  const wsRef = useRef(null);
  const fitAddonRef = useRef(null);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const inputRef = useRef(null);
  const modalRef = useRef(null);

  useEffect(() => {
    let isMounted = true;

    // Auto-focus input field when modal opens
    setTimeout(() => inputRef.current?.focus(), 100);

    // Create terminal instance
    const term = new Terminal({
      cursorBlink: true,
      theme: {
        background: '#18181b',    // Zinc-900 - matches dark theme
        foreground: '#f4f4f5',    // Zinc-100
        cursor: '#a855f7',        // Accent purple
      },
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 14,
      rows: 24,
      cols: 80
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    fitAddon.fit();

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // Force 127.0.0.1 to avoid localhost IPv6 issues
    const wsUrl = `ws://127.0.0.1:5050/ws/terminal/${agentId}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!isMounted) return;
      setConnectionStatus('connected');
      term.writeln(`\x1b[32m✔ Connected to agent ${agentId}\x1b[0m\r\n`);
    };

    ws.onmessage = (event) => {
      if (!isMounted) return;
      term.write(event.data);
    };

    ws.onclose = () => {
      if (!isMounted) return;
      setConnectionStatus('disconnected');
      term.writeln('\r\n\x1b[33m⚠ Connection closed\x1b[0m');
    };

    ws.onerror = (err) => {
      if (!isMounted) return;
      // CRITICAL: Ignore errors during cleanup
      if (ws.readyState === WebSocket.CLOSED ||
          ws.readyState === WebSocket.CLOSING) return;

      setConnectionStatus('error');
      term.writeln('\r\n\x1b[31mConnection error\x1b[0m');
    };

    // Send keyboard input to WebSocket
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    // Handle window resize
    const handleResize = () => fitAddon.fit();
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      isMounted = false;
      // Only close WebSocket if not already closing/closed to prevent error handler from firing
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
      term.dispose();
      window.removeEventListener('resize', handleResize);
    };
  }, [agentId]);

  // Focus trap: prevent tab from leaving modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Tab') {
        const focusableElements = modalRef.current?.querySelectorAll(
          'button, input, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusableElements || focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }

      // Close modal on Escape
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Handle command input - write text to terminal
  const handleWrite = () => {
    const input = inputRef.current;
    if (!input || !input.value) return;

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(input.value);
      input.value = '';
      input.focus();
    }
  };

  // Execute command: send text + carriage return
  const handleExecute = () => {
    const input = inputRef.current;
    if (!input || !input.value) return;

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(input.value + '\r');
      input.value = '';
      input.focus();
    }
  };

  // Send carriage return only (for executing after Write)
  const handleEnter = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send('\r');
    }
  };

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return 'bg-green-500';
      case 'connecting': return 'bg-yellow-500';
      case 'disconnected': return 'bg-gray-500';
      case 'error': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusText = () => {
    switch (connectionStatus) {
      case 'connected': return 'Connected';
      case 'connecting': return 'Connecting...';
      case 'disconnected': return 'Disconnected';
      case 'error': return 'Error';
      default: return 'Unknown';
    }
  };

  return (
    // Backdrop with blur
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="terminal-modal-title"
    >
      {/* Terminal window */}
      <div
        ref={modalRef}
        className="w-[800px] h-[600px] bg-[#18181b] rounded-xl shadow-2xl border border-zinc-700 flex flex-col animate-in fade-in zoom-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* macOS-style window chrome */}
        <div className="h-10 bg-zinc-800 flex items-center justify-between px-4 rounded-t-xl">
          <div className="flex items-center gap-2">
            {/* Traffic light buttons */}
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <div className="w-3 h-3 rounded-full bg-yellow-500" />
            <div className="w-3 h-3 rounded-full bg-green-500" />

            {/* Session name and status */}
            <span id="terminal-modal-title" className="ml-2 text-xs font-mono text-zinc-400">
              dev-{agentId}
            </span>
            <div className="flex items-center gap-1.5 ml-2">
              <div className={`w-2 h-2 rounded-full ${getStatusColor()}`} />
              <span className="text-xs text-zinc-500">{getStatusText()}</span>
            </div>
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Terminal container */}
        <div className="flex-1 p-1 overflow-hidden relative bg-[#18181b]">
          <div ref={terminalRef} className="w-full h-full" />
        </div>

        {/* Custom control bar */}
        <div className="h-14 bg-zinc-800 border-t border-zinc-700 p-3 flex gap-2 rounded-b-xl">
          {/* Command input field */}
          <input
            ref={inputRef}
            type="text"
            placeholder="Type command here..."
            className="flex-1 bg-zinc-900 text-zinc-100 px-3 py-2 rounded border border-zinc-700 focus:border-accent-purple focus:outline-none text-sm font-mono"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleExecute();
              } else if (e.key === 'Escape') {
                e.target.blur();
              }
            }}
          />

          {/* Write button - inject without executing */}
          <button
            onClick={handleWrite}
            className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-100 rounded text-sm font-medium transition-colors"
            title="Send input text without executing (for building multi-line commands)"
          >
            Write
          </button>

          {/* Execute button - send text + execute */}
          <button
            onClick={handleExecute}
            className="px-4 py-2 bg-accent-purple hover:bg-purple-600 text-white rounded text-sm font-medium transition-colors"
            title="Send input text and execute (Enter key also works)"
          >
            Execute
          </button>

          {/* Enter button - execute what's already in terminal */}
          <button
            onClick={handleEnter}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded text-sm font-medium transition-colors"
            title="Execute current line in terminal (use after Write button)"
          >
            ↵
          </button>
        </div>
      </div>
    </div>
  );
};
