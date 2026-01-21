import React, { useRef, useEffect, useState } from 'react';
import { Terminal, X } from 'lucide-react';

export const TerminalPanel = ({ agentName, output = [] }) => {
    const outputRef = useRef(null);
    const wsRef = useRef(null);
    const [wsConnected, setWsConnected] = useState(false);
    const [wsOutput, setWsOutput] = useState([]);

    // Auto-scroll to bottom when new output arrives
    useEffect(() => {
        if (outputRef.current) {
            outputRef.current.scrollTop = outputRef.current.scrollHeight;
        }
    }, [output, wsOutput]);

    // Phase 4: Connect to terminal WebSocket
    useEffect(() => {
        if (!agentName) return;

        const wsUrl = `ws://127.0.0.1:5050/ws/terminal/${agentName}`;
        console.log(`[terminal] Connecting to ${wsUrl}...`);

        try {
            const ws = new WebSocket(wsUrl);

            ws.onopen = () => {
                console.log(`[terminal] Connected to ${agentName} terminal`);
                setWsConnected(true);
                setWsOutput(prev => [...prev, {
                    type: 'info',
                    content: `✓ Connected to broker terminal for ${agentName}`
                }]);
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    console.log(`[terminal] Received:`, data);

                    setWsOutput(prev => [...prev, {
                        type: data.type || 'output',
                        content: data.message || data.content || JSON.stringify(data)
                    }]);
                } catch (error) {
                    setWsOutput(prev => [...prev, {
                        type: 'output',
                        content: event.data
                    }]);
                }
            };

            ws.onerror = (error) => {
                console.error(`[terminal] WebSocket error:`, error);
                setWsOutput(prev => [...prev, {
                    type: 'error',
                    content: `✗ WebSocket error for ${agentName}`
                }]);
            };

            ws.onclose = () => {
                console.log(`[terminal] Disconnected from ${agentName} terminal`);
                setWsConnected(false);
                setWsOutput(prev => [...prev, {
                    type: 'info',
                    content: `✗ Disconnected from broker terminal`
                }]);
            };

            wsRef.current = ws;

            return () => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.close();
                }
            };
        } catch (error) {
            console.error(`[terminal] Failed to create WebSocket:`, error);
            setWsOutput(prev => [...prev, {
                type: 'error',
                content: `✗ Failed to connect: ${error.message}`
            }]);
        }
    }, [agentName]);

    return (
        <div className="flex-1 bg-[#18181b] flex flex-col">
            {/* Header */}
            <div className="h-10 bg-zinc-800 flex items-center px-4 border-b border-zinc-700">
                <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                    <span className="ml-2 text-xs font-mono text-zinc-400 uppercase tracking-wider">
                        {agentName ? `${agentName.toLowerCase()}-terminal` : 'Terminal'}
                    </span>
                </div>
            </div>

            {/* Terminal Output */}
            <div
                ref={outputRef}
                className="flex-1 overflow-y-auto p-3 font-mono text-sm bg-[#18181b] text-zinc-100"
            >
                {/* Show WebSocket output if connected, otherwise show mock output */}
                {agentName && wsOutput.length > 0 ? (
                    wsOutput.map((line, idx) => (
                        <div key={idx} className="leading-relaxed">
                            {line.type === 'command' && (
                                <span className="text-zinc-400">$ </span>
                            )}
                            <span
                                className={
                                    line.type === 'error' ? 'text-red-400' :
                                    line.type === 'success' ? 'text-green-400' :
                                    line.type === 'info' ? 'text-blue-400' :
                                    line.type === 'command' ? 'text-zinc-100' :
                                    'text-zinc-300'
                                }
                            >
                                {line.content}
                            </span>
                        </div>
                    ))
                ) : output.length === 0 ? (
                    <div className="text-zinc-500">
                        {agentName
                            ? 'Connecting to broker terminal...'
                            : 'No agent selected. Right-click an agent and select "Connect Terminal".'}
                    </div>
                ) : (
                    output.map((line, idx) => (
                        <div key={idx} className="leading-relaxed">
                            {line.type === 'command' && (
                                <span className="text-zinc-400">$ </span>
                            )}
                            <span
                                className={
                                    line.type === 'error' ? 'text-red-400' :
                                    line.type === 'success' ? 'text-green-400' :
                                    line.type === 'info' ? 'text-blue-400' :
                                    line.type === 'command' ? 'text-zinc-100' :
                                    'text-zinc-300'
                                }
                            >
                                {line.content}
                            </span>
                        </div>
                    ))
                )}
            </div>

            {/* Footer */}
            <div className="h-8 bg-zinc-800 border-t border-zinc-700 px-4 flex items-center justify-between text-xs text-zinc-500">
                <span>
                    {(wsOutput.length || output.length)} line{(wsOutput.length || output.length) !== 1 ? 's' : ''}
                </span>
                {agentName && (
                    <span className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                        {wsConnected ? 'Connected to broker' : 'Disconnected'}
                    </span>
                )}
            </div>
        </div>
    );
};
