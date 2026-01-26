import React, { useState, useEffect } from 'react';
import { Handle, Position } from '@xyflow/react';
import { User, Activity, PauseCircle, WifiOff, AlertTriangle, Clock, XCircle, HelpCircle, Trash2, RefreshCw, CheckCircle, FileText } from 'lucide-react';
import apiClient from '../services/api-client';

// Status styling map - from POC ui-observatory/src/components/AgentNode.jsx:6-11
// Proven visual states with dual-cue system (color + icon)
// Issue #110: Agent lifecycle states (idle → starting → ready → busy → ready)
const statusStyles = {
    idle: { color: 'text-text-secondary', border: 'border-text-muted', icon: PauseCircle, label: 'Idle' },
    starting: { color: 'text-accent-purple', border: 'border-accent-purple', icon: Clock, label: 'Starting' },
    ready: { color: 'text-accent-green', border: 'border-accent-green', icon: Activity, label: 'Ready' },
    busy: { color: 'text-accent-orange', border: 'border-accent-orange', icon: Activity, label: 'Busy' },
    error: { color: 'text-accent-red', border: 'border-accent-red', icon: XCircle, label: 'Error' },
    offline: { color: 'text-text-muted', border: 'border-border', icon: WifiOff, label: 'Offline' },
    // Legacy alias for backward compatibility
    active: { color: 'text-accent-green', border: 'border-accent-green', icon: Activity, label: 'Active' }
};

// Phase 8: Escalation indicator styles
const escalationStyles = {
    blocked: {
        icon: Clock,
        color: 'bg-accent-orange text-white',
        label: 'Blocked',
        pulse: true
    },
    urgent: {
        icon: AlertTriangle,
        color: 'bg-accent-red text-white',
        label: 'Urgent',
        pulse: true
    },
    error: {
        icon: XCircle,
        color: 'bg-red-600 text-white',
        label: 'Error',
        pulse: false
    },
    needsHelp: {
        icon: HelpCircle,
        color: 'bg-accent-purple text-white',
        label: 'Needs Help',
        pulse: true
    }
};

export const AgentNode = ({ data, id }) => {
    const { role, name, status = 'idle', task, escalation, onDelete, agentId: providedAgentId } = data;
    // Fallback to name if agentId not provided (backwards compatibility)
    const agentId = providedAgentId || name;

    const style = statusStyles[status] || statusStyles.idle;
    const StatusIcon = style.icon;
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [bootstrapStatus, setBootstrapStatus] = useState(null);
    const [compactionStatus, setCompactionStatus] = useState(null);
    const [isReloading, setIsReloading] = useState(false);

    // Phase 8: Escalation state
    const escalationState = escalation ? escalationStyles[escalation.type] : null;
    const EscalationIcon = escalationState?.icon;

    // Phase 3: Fetch bootstrap and compaction status
    useEffect(() => {
        if (!agentId) return;

        const fetchStatus = async () => {
            try {
                const [bootstrap, compaction] = await Promise.all([
                    apiClient.getBootstrapStatus(agentId).catch(() => null),
                    apiClient.getCompactionStatus(agentId).catch(() => null)
                ]);
                setBootstrapStatus(bootstrap);
                setCompactionStatus(compaction);
            } catch (error) {
                console.error('[AgentNode] Failed to fetch status:', error);
            }
        };

        fetchStatus();
        // Refresh every 30 seconds
        const interval = setInterval(fetchStatus, 30000);
        return () => clearInterval(interval);
    }, [agentId]);

    const handleDeleteClick = (e) => {
        e.stopPropagation();
        setShowDeleteConfirm(true);
    };

    const handleConfirmDelete = (e) => {
        e.stopPropagation();
        if (onDelete) {
            onDelete(id, name);
        }
        setShowDeleteConfirm(false);
    };

    const handleCancelDelete = (e) => {
        e.stopPropagation();
        setShowDeleteConfirm(false);
    };

    const handleReloadContext = async (e) => {
        e.stopPropagation();
        if (!agentId) return;

        setIsReloading(true);
        try {
            await apiClient.reloadBootstrap(agentId);
            // Refresh status immediately after reload
            const [bootstrap, compaction] = await Promise.all([
                apiClient.getBootstrapStatus(agentId).catch(() => null),
                apiClient.getCompactionStatus(agentId).catch(() => null)
            ]);
            setBootstrapStatus(bootstrap);
            setCompactionStatus(compaction);
        } catch (error) {
            console.error('[AgentNode] Failed to reload bootstrap:', error);
        } finally {
            setIsReloading(false);
        }
    };

    return (
        <div className={`w-[280px] bg-surface rounded-xl border ${status === 'ready' || status === 'busy' || status === 'active' ? style.border : 'border-border'} hover:border-text-secondary transition-all shadow-lg relative`}>
            {/* Phase 8: Escalation Badge */}
            {escalationState && (
                <div
                    className={`absolute -top-2 -right-2 z-10 ${escalationState.color} rounded-full px-2 py-1 flex items-center gap-1 shadow-lg border-2 border-background ${escalationState.pulse ? 'animate-pulse' : ''}`}
                    title={escalation.reason || escalationState.label}
                >
                    <EscalationIcon size={12} />
                    <span className="text-[10px] font-bold uppercase tracking-wide">
                        {escalationState.label}
                    </span>
                </div>
            )}

            {/* Header */}
            <div className="p-4 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-3">
                    {/* Agent avatar */}
                    <div className={`w-10 h-10 rounded-full bg-surface-hover flex items-center justify-center ${style.color}`}>
                        <User size={20} />
                    </div>
                    <div>
                        <h3 className="text-text-primary font-medium text-sm">{name}</h3>
                        <p className="text-xs text-text-secondary">{role}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {/* Status Indicator - visual dual-cue (color + icon) */}
                    <div className={`flex items-center gap-1.5 px-2 py-1 rounded bg-surface-hover/50 border border-transparent`}>
                        <StatusIcon size={12} className={style.color} />
                        <span className={`text-[10px] font-medium ${style.color} uppercase`}>{style.label}</span>
                    </div>
                    {/* Delete button */}
                    <button
                        onClick={handleDeleteClick}
                        className="p-1.5 rounded hover:bg-red-500/10 text-text-muted hover:text-red-500 transition-colors"
                        title="Delete agent"
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            </div>

            {/* Body - Current task display */}
            <div className="p-4 space-y-3">
                <div>
                    <p className="text-xs text-text-muted mb-1 uppercase tracking-wider">Current Task</p>
                    <div className="text-sm text-text-primary line-clamp-2">
                        {task || "Awaiting task..."}
                    </div>
                </div>

                {/* Phase 3: Bootstrap & Compaction Status */}
                {agentId && (
                    <div className="pt-2 border-t border-border space-y-2">
                        {/* Bootstrap Status */}
                        {bootstrapStatus && (
                            <div className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-1.5">
                                    <FileText size={12} className="text-text-secondary" />
                                    <span className="text-text-secondary">
                                        Context: {bootstrapStatus.history?.[0]?.filesLoaded?.length || 0} files
                                    </span>
                                </div>
                                <button
                                    onClick={handleReloadContext}
                                    disabled={isReloading}
                                    className="flex items-center gap-1 px-2 py-1 rounded hover:bg-surface-hover text-text-secondary hover:text-accent-purple transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="Reload context"
                                >
                                    <RefreshCw size={12} className={isReloading ? 'animate-spin' : ''} />
                                    <span>Reload</span>
                                </button>
                            </div>
                        )}

                        {/* Compaction Status */}
                        {compactionStatus && compactionStatus.conversationTurns > 0 && (
                            <div className="flex items-center gap-1.5 text-xs">
                                {compactionStatus.compactionStatus.severity === 'normal' && (
                                    <>
                                        <CheckCircle size={12} className="text-accent-green" />
                                        <span className="text-text-secondary">
                                            {compactionStatus.conversationTurns} turns
                                        </span>
                                    </>
                                )}
                                {compactionStatus.compactionStatus.severity === 'warning' && (
                                    <>
                                        <AlertTriangle size={12} className="text-accent-orange" />
                                        <span className="text-accent-orange">
                                            {compactionStatus.conversationTurns} turns - Consider restart
                                        </span>
                                    </>
                                )}
                                {compactionStatus.compactionStatus.severity === 'critical' && (
                                    <>
                                        <XCircle size={12} className="text-accent-red" />
                                        <span className="text-accent-red font-medium">
                                            {compactionStatus.conversationTurns} turns - Restart needed
                                        </span>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Connection Handles - 4-way connectivity proven optimal */}
            {/* Reference: POC AgentNode.jsx:47-50 */}
            <Handle type="target" position={Position.Top} className="w-3 h-3 bg-text-muted border-2 border-background !top-[-6px]" />
            <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-text-muted border-2 border-background !bottom-[-6px]" />
            <Handle type="target" position={Position.Left} className="w-3 h-3 bg-text-muted border-2 border-background !left-[-6px]" />
            <Handle type="source" position={Position.Right} className="w-3 h-3 bg-text-muted border-2 border-background !right-[-6px]" />

            {/* Delete Confirmation Dialog */}
            {showDeleteConfirm && (
                <div className="absolute inset-0 bg-background/95 backdrop-blur-sm rounded-xl flex items-center justify-center z-50">
                    <div className="bg-surface border border-border rounded-lg p-4 shadow-xl max-w-[240px]">
                        <h4 className="text-sm font-semibold text-text-primary mb-2">Delete Agent?</h4>
                        <p className="text-xs text-text-secondary mb-4">
                            Remove <span className="font-medium text-text-primary">{name}</span> from the team?
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={handleCancelDelete}
                                className="flex-1 px-3 py-1.5 text-xs rounded bg-surface-hover hover:bg-surface-active text-text-primary transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirmDelete}
                                className="flex-1 px-3 py-1.5 text-xs rounded bg-red-500 hover:bg-red-600 text-white transition-colors"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
