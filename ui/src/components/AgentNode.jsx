import React, { useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { User, Activity, PauseCircle, WifiOff, AlertTriangle, Clock, XCircle, HelpCircle, Trash2 } from 'lucide-react';

// Status styling map - from POC ui-observatory/src/components/AgentNode.jsx:6-11
// Proven visual states with dual-cue system (color + icon)
const statusStyles = {
    active: { color: 'text-accent-green', border: 'border-accent-green', icon: Activity, label: 'Active' },
    idle: { color: 'text-text-secondary', border: 'border-text-muted', icon: PauseCircle, label: 'Idle' },
    busy: { color: 'text-accent-orange', border: 'border-accent-orange', icon: Activity, label: 'Busy' },
    offline: { color: 'text-text-muted', border: 'border-border', icon: WifiOff, label: 'Offline' }
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
    const { role, name, status = 'idle', task, escalation, onDelete } = data;
    const style = statusStyles[status] || statusStyles.idle;
    const StatusIcon = style.icon;
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    // Phase 8: Escalation state
    const escalationState = escalation ? escalationStyles[escalation.type] : null;
    const EscalationIcon = escalationState?.icon;

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

    return (
        <div className={`w-[280px] bg-surface rounded-xl border ${status === 'active' || status === 'busy' ? style.border : 'border-border'} hover:border-text-secondary transition-all shadow-lg relative`}>
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
            <div className="p-4">
                <p className="text-xs text-text-muted mb-1 uppercase tracking-wider">Current Task</p>
                <div className="text-sm text-text-primary line-clamp-2">
                    {task || "Awaiting task..."}
                </div>
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
