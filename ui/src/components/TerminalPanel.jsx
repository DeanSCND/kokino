import React, { useRef, useEffect } from 'react';
import { Terminal, X } from 'lucide-react';

export const TerminalPanel = ({ agentName, output = [] }) => {
    const outputRef = useRef(null);

    // Auto-scroll to bottom when new output arrives
    useEffect(() => {
        if (outputRef.current) {
            outputRef.current.scrollTop = outputRef.current.scrollHeight;
        }
    }, [output]);

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
                {output.length === 0 ? (
                    <div className="text-zinc-500">
                        No terminal output yet. Agent is idle.
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
            <div className="h-8 bg-zinc-800 border-t border-zinc-700 px-4 flex items-center text-xs text-zinc-500">
                {output.length} line{output.length !== 1 ? 's' : ''} | Mock terminal (Phase 3)
            </div>
        </div>
    );
};
