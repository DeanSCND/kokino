import React from 'react';
import { Play, Square, MessageSquare, Users, Trash2 } from 'lucide-react';
import { BrokerStatus } from './BrokerStatus';

export const CanvasHeader = ({
    isOrchestrating,
    onStartStop,
    canStartTeam,
    showChatPanel,
    onToggleChat,
    showTeamPanel,
    onToggleTeam
}) => {
    return (
        <div className="flex items-center gap-3">
            {/* Broker Status */}
            <BrokerStatus />

            {/* Divider */}
            <div className="w-px h-6 bg-border" />

            {/* Start/Stop Team Button */}
            <button
                onClick={onStartStop}
                className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                    isOrchestrating
                        ? 'bg-red-500 hover:bg-red-600 text-white'
                        : canStartTeam
                        ? 'bg-accent-purple hover:bg-purple-600 text-white'
                        : 'bg-surface-hover text-text-muted cursor-not-allowed'
                }`}
                disabled={!canStartTeam && !isOrchestrating}
                title={!canStartTeam && !isOrchestrating ? 'Add at least 2 agents and 1 connection' : ''}
            >
                {isOrchestrating ? (
                    <>
                        <Square size={16} fill="currentColor" />
                        Stop Team
                    </>
                ) : (
                    <>
                        <Play size={16} fill="currentColor" />
                        Start Team
                    </>
                )}
            </button>

            {/* Divider */}
            <div className="w-px h-6 bg-border" />

            {/* Chat Toggle */}
            <button
                onClick={onToggleChat}
                className={`p-2 rounded-lg transition-colors flex items-center gap-2 ${
                    showChatPanel
                        ? 'bg-accent-blue text-white'
                        : 'bg-surface-hover hover:bg-surface-active text-text-secondary hover:text-text-primary'
                }`}
                title="Toggle Chat Panel"
            >
                <MessageSquare size={18} />
                <span className="text-sm font-medium">Chat</span>
            </button>

            {/* Team Toggle */}
            <button
                onClick={onToggleTeam}
                className={`p-2 rounded-lg transition-colors flex items-center gap-2 ${
                    showTeamPanel
                        ? 'bg-accent-purple text-white'
                        : 'bg-surface-hover hover:bg-surface-active text-text-secondary hover:text-text-primary'
                }`}
                title="Toggle Team Panel"
            >
                <Users size={18} />
                <span className="text-sm font-medium">Team</span>
            </button>

            {/* Divider */}
            <div className="w-px h-6 bg-border" />

            {/* Clear Cache Button */}
            <button
                onClick={() => {
                    if (confirm('Clear all saved canvas data and reload?')) {
                        localStorage.removeItem('kokino-team-v1');
                        window.location.reload();
                    }
                }}
                className="p-2 rounded-lg bg-surface-hover hover:bg-red-500/20 text-text-secondary hover:text-red-500 transition-colors"
                title="Clear Canvas Cache"
            >
                <Trash2 size={18} />
            </button>
        </div>
    );
};
