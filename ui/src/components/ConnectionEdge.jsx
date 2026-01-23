import React, { useState, useEffect } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath } from '@xyflow/react';
import { X } from 'lucide-react';

// Custom edge component with labels, visual states, and message flow animation (Phase 8)
// Reference: Phase 2 spec for connection configuration
export const ConnectionEdge = ({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style = {},
    markerEnd,
    data
}) => {
    const [edgePath, labelX, labelY] = getBezierPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
    });

    const purpose = data?.purpose || null;
    const onDelete = data?.onDelete;
    const [messageBubbles, setMessageBubbles] = useState([]);
    const [isHovered, setIsHovered] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    // Phase 8: Listen for message flow events
    useEffect(() => {
        const handleMessageFlow = (event) => {
            if (event.detail.edgeId === id) {
                const bubbleId = `${id}-${Date.now()}`;
                setMessageBubbles(prev => [...prev, { id: bubbleId, progress: 0 }]);

                // Remove bubble after animation completes (2 seconds)
                setTimeout(() => {
                    setMessageBubbles(prev => prev.filter(b => b.id !== bubbleId));
                }, 2000);
            }
        };

        window.addEventListener('messageFlow', handleMessageFlow);
        return () => window.removeEventListener('messageFlow', handleMessageFlow);
    }, [id]);

    // Animate bubbles
    useEffect(() => {
        if (messageBubbles.length === 0) return;

        const interval = setInterval(() => {
            setMessageBubbles(prev =>
                prev.map(bubble => ({
                    ...bubble,
                    progress: Math.min(bubble.progress + 0.05, 1)
                }))
            );
        }, 50);

        return () => clearInterval(interval);
    }, [messageBubbles.length]);

    // Get point along path for animation
    const getPointAtLength = (progress) => {
        const pathElement = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        pathElement.setAttribute('d', edgePath);
        const length = pathElement.getTotalLength();
        const point = pathElement.getPointAtLength(length * progress);
        return point;
    };

    const handleDeleteClick = (e) => {
        e.stopPropagation();
        setShowDeleteConfirm(true);
    };

    const handleConfirmDelete = (e) => {
        e.stopPropagation();
        if (onDelete) {
            onDelete(id);
        }
        setShowDeleteConfirm(false);
    };

    const handleCancelDelete = (e) => {
        e.stopPropagation();
        setShowDeleteConfirm(false);
    };

    return (
        <>
            <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />

            {/* Phase 8: Animated message bubbles */}
            {messageBubbles.map(bubble => {
                const point = getPointAtLength(bubble.progress);
                return (
                    <circle
                        key={bubble.id}
                        cx={point.x}
                        cy={point.y}
                        r="6"
                        fill="#a855f7"
                        opacity={1 - bubble.progress}
                        className="pointer-events-none"
                    />
                );
            })}

            <EdgeLabelRenderer>
                <div
                    style={{
                        position: 'absolute',
                        transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
                        pointerEvents: 'all',
                    }}
                    className="nodrag nopan"
                    onMouseEnter={() => setIsHovered(true)}
                    onMouseLeave={() => setIsHovered(false)}
                >
                    {!showDeleteConfirm ? (
                        <div className="flex items-center gap-1 bg-surface px-2 py-1 rounded border border-border">
                            {purpose && (
                                <span className="text-text-secondary text-xs">
                                    {purpose}
                                </span>
                            )}
                            {(isHovered || !purpose) && (
                                <button
                                    onClick={handleDeleteClick}
                                    className="p-0.5 rounded hover:bg-red-500/10 text-text-muted hover:text-red-500 transition-colors"
                                    title="Delete connection"
                                >
                                    <X size={12} />
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="bg-surface border border-border rounded-lg p-2 shadow-xl min-w-[180px]">
                            <p className="text-xs text-text-secondary mb-2">
                                Delete connection?
                            </p>
                            <div className="flex gap-2">
                                <button
                                    onClick={handleCancelDelete}
                                    className="flex-1 px-2 py-1 text-xs rounded bg-surface-hover hover:bg-surface-active text-text-primary transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleConfirmDelete}
                                    className="flex-1 px-2 py-1 text-xs rounded bg-red-500 hover:bg-red-600 text-white transition-colors"
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </EdgeLabelRenderer>
        </>
    );
};
