import React from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath } from '@xyflow/react';

// Custom edge component with labels and visual states
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

    return (
        <>
            <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />
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
