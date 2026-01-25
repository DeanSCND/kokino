import React, { useState, useEffect } from 'react';
import { Activity, Clock, MessageSquare, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import apiClient from '../services/api-client';

export const AgentDashboard = () => {
    const [agents, setAgents] = useState([]);
    const [tickets, setTickets] = useState([]);
    const [selectedAgent, setSelectedAgent] = useState(null);

    // Poll agents every 2 seconds
    useEffect(() => {
        const fetchAgents = async () => {
            try {
                const agentList = await apiClient.listAgents();
                setAgents(agentList);
            } catch (error) {
                console.error('[dashboard] Failed to fetch agents:', error);
            }
        };

        fetchAgents();
        const interval = setInterval(fetchAgents, 2000);
        return () => clearInterval(interval);
    }, []);

    // Poll tickets for selected agent
    useEffect(() => {
        if (!selectedAgent) return;

        const fetchTickets = async () => {
            try {
                const pending = await broker.getPendingTickets(selectedAgent);
                setTickets(pending);
            } catch (error) {
                console.error('[dashboard] Failed to fetch tickets:', error);
            }
        };

        fetchTickets();
        const interval = setInterval(fetchTickets, 3000);
        return () => clearInterval(interval);
    }, [selectedAgent]);

    const getStatusIcon = (status) => {
        switch (status) {
            case 'online':
                return <Activity size={14} className="text-green-500" />;
            case 'busy':
                return <Loader2 size={14} className="text-yellow-500 animate-spin" />;
            case 'offline':
                return <XCircle size={14} className="text-red-500" />;
            default:
                return <Clock size={14} className="text-gray-500" />;
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'online':
                return 'bg-green-500';
            case 'busy':
                return 'bg-yellow-500';
            case 'offline':
                return 'bg-red-500';
            default:
                return 'bg-gray-500';
        }
    };

    const getTicketStatusBadge = (status) => {
        switch (status) {
            case 'pending':
                return <span className="px-2 py-1 text-xs rounded bg-yellow-500/20 text-yellow-400">Pending</span>;
            case 'responded':
                return <span className="px-2 py-1 text-xs rounded bg-green-500/20 text-green-400">Responded</span>;
            case 'timeout':
                return <span className="px-2 py-1 text-xs rounded bg-red-500/20 text-red-400">Timeout</span>;
            default:
                return <span className="px-2 py-1 text-xs rounded bg-gray-500/20 text-gray-400">{status}</span>;
        }
    };

    return (
        <div className="flex-1 bg-surface border-b border-border flex">
            {/* Agent List */}
            <div className="w-64 border-r border-border flex flex-col">
                <div className="h-10 bg-surface-hover flex items-center px-4 border-b border-border">
                    <Activity size={14} className="text-accent-purple mr-2" />
                    <span className="text-xs font-medium text-text-primary uppercase tracking-wider">
                        Agents ({agents.length})
                    </span>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {agents.length === 0 ? (
                        <div className="p-4 text-center text-text-muted text-sm">
                            No agents registered
                        </div>
                    ) : (
                        <div className="p-2 space-y-1">
                            {agents.map((agent) => (
                                <button
                                    key={agent.agentId}
                                    onClick={() => setSelectedAgent(agent.agentId)}
                                    className={`w-full text-left p-3 rounded-lg transition-colors ${
                                        selectedAgent === agent.agentId
                                            ? 'bg-accent-purple/20 border border-accent-purple'
                                            : 'bg-surface-hover hover:bg-surface border border-transparent'
                                    }`}
                                >
                                    <div className="flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-2">
                                            <div className={`w-2 h-2 rounded-full ${getStatusColor(agent.status)}`} />
                                            <span className="text-sm font-medium text-text-primary">
                                                {agent.agentId}
                                            </span>
                                        </div>
                                        {getStatusIcon(agent.status)}
                                    </div>
                                    <div className="text-xs text-text-muted">
                                        {agent.type || 'unknown'}
                                    </div>
                                    {agent.metadata?.role && (
                                        <div className="text-xs text-text-secondary mt-1">
                                            {agent.metadata.role}
                                        </div>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Ticket Details */}
            <div className="flex-1 flex flex-col">
                {selectedAgent ? (
                    <>
                        <div className="h-10 bg-surface-hover flex items-center px-4 border-b border-border">
                            <MessageSquare size={14} className="text-accent-blue mr-2" />
                            <span className="text-xs font-medium text-text-primary uppercase tracking-wider">
                                Tickets for {selectedAgent} ({tickets.length})
                            </span>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4">
                            {tickets.length === 0 ? (
                                <div className="flex items-center justify-center h-full text-text-muted text-sm">
                                    No pending tickets
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {tickets.map((ticket) => (
                                        <div
                                            key={ticket.ticketId}
                                            className="bg-surface-hover border border-border rounded-lg p-4"
                                        >
                                            <div className="flex items-start justify-between mb-2">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-sm font-semibold text-text-primary">
                                                            From: {ticket.originAgent}
                                                        </span>
                                                        <span className="text-xs text-text-muted">→</span>
                                                        <span className="text-sm text-text-secondary">
                                                            To: {ticket.agentId}
                                                        </span>
                                                    </div>
                                                    <div className="text-xs text-text-muted">
                                                        {new Date(ticket.createdAt).toLocaleString()}
                                                    </div>
                                                </div>
                                                {getTicketStatusBadge(ticket.status)}
                                            </div>

                                            <div className="bg-background border border-border rounded p-3 mb-2">
                                                <div className="text-sm text-text-primary whitespace-pre-wrap">
                                                    {ticket.payload}
                                                </div>
                                            </div>

                                            <div className="flex items-center justify-between text-xs">
                                                <span className="text-text-muted">
                                                    ID: {ticket.ticketId.substring(0, 8)}...
                                                </span>
                                                {ticket.latencyMs && (
                                                    <span className="text-text-muted">
                                                        Latency: {ticket.latencyMs}ms
                                                    </span>
                                                )}
                                            </div>

                                            {ticket.response && (
                                                <div className="mt-3 pt-3 border-t border-border">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <CheckCircle2 size={14} className="text-green-500" />
                                                        <span className="text-xs font-medium text-text-secondary">
                                                            Response
                                                        </span>
                                                    </div>
                                                    <div className="bg-green-500/10 border border-green-500/20 rounded p-3">
                                                        <div className="text-sm text-text-primary whitespace-pre-wrap">
                                                            {ticket.response.payload}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="flex items-center justify-center h-full text-text-muted text-sm">
                        Select an agent to view tickets
                    </div>
                )}
            </div>
        </div>
    );
};
