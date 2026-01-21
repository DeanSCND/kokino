import React, { useState, useEffect } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath } from '@xyflow/react';

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
    const [messageBubbles, setMessageBubbles] = useState([]);

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

            {purpose && (
                <EdgeLabelRenderer>
                    <div
                        style={{
                            position: 'absolute',
                            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
                            fontSize: 11,
                            pointerEvents: 'all',
                        }}
                        className="nodrag nopan bg-surface px-2 py-1 rounded text-text-secondary border border-border text-xs"
                    >
                        {purpose}
                    </div>
                </EdgeLabelRenderer>
            )}
        </>
    );
};
