import React, { useCallback } from 'react';
import { ReactFlow, MiniMap, Controls, Background, useNodesState, useEdgesState, addEdge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { AgentNode } from '../components/AgentNode';
import { Plus } from 'lucide-react';

// Register custom node types - Reference: POC Canvas.jsx:9
const nodeTypes = { agent: AgentNode };

const initialNodes = [];
const initialEdges = [];

export const Canvas = () => {
    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

    // Connection handler with animated edges - Reference: POC Canvas.jsx:22
    const onConnect = useCallback(
        (params) => setEdges((eds) =>
            addEdge({
                ...params,
                animated: true,
                // Use Tailwind border color variable instead of hard-coded literal
                className: 'stroke-border'
            }, eds)
        ),
        [setEdges]
    );

    // Add agent node to canvas - Reference: POC Canvas.jsx:24-45
    // Smart naming for multi-model support
    const addNode = (role) => {
        // Use browser's crypto API with fallback for older environments
        const id = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // Smart agent naming - supports multi-model orchestration
        // Reference: POC Canvas.jsx:26-31
        const name = role === 'Product Manager' ? 'Alice' :
            role === 'Tech Lead' ? 'Bob' :
            role === 'Backend' ? 'Jerry' :
            role === 'Droid' ? 'Steve' :    // Factory Droid
            role === 'Gemini' ? 'Gemma' :   // Google Gemini
            `Agent-${id.substring(0, 4)}`;

        // Grid positioning to avoid overlaps
        // Improvement over POC's random positioning
        const gridSpacing = 350; // Node width + margin
        const col = nodes.length % 3;
        const row = Math.floor(nodes.length / 3);

        const newNode = {
            id,
            type: 'agent',
            position: {
                x: 100 + (col * gridSpacing),
                y: 100 + (row * gridSpacing)
            },
            data: {
                name: name,
                role: role,
                status: 'idle',
                task: 'Waiting for orchestration...'
            }
        };

        setNodes((nds) => nds.concat(newNode));
    };

    return (
        <div className="w-full h-full flex">
            {/* React Flow Canvas */}
            <div className="flex-1 h-full relative bg-background">
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    nodeTypes={nodeTypes}
                    fitView
                    colorMode="dark"
                >
                    {/* Background grid - Use CSS variable from Tailwind config */}
                    <Background color="var(--color-border)" gap={20} size={1} />

                    {/* Controls for pan/zoom */}
                    <Controls className="!bg-surface !border-border !fill-text-secondary" />

                    {/* MiniMap for overview - Use CSS variables */}
                    <MiniMap
                        className="!bg-surface !border-border"
                        nodeColor="var(--color-text-muted)"
                        maskColor="rgba(18, 18, 20, 0.8)"
                    />
                </ReactFlow>

                {/* Floating Agent Library Panel - Reference: POC Canvas.jsx:223-242 */}
                <div className="absolute top-6 left-6 flex flex-col gap-4 z-10">
                    <div className="flex flex-col gap-2 bg-surface/80 backdrop-blur border border-border p-4 rounded-xl shadow-xl w-64">
                        <h3 className="text-sm font-medium text-text-primary mb-2">Team Composition</h3>
                        <div className="grid grid-cols-2 gap-2">
                            {['Product Manager', 'Tech Lead', 'Frontend', 'Backend', 'QA', 'Droid', 'Gemini'].map((role) => (
                                <button
                                    key={role}
                                    onClick={() => addNode(role)}
                                    className="flex flex-col items-center justify-center p-3 rounded-lg border border-border bg-background hover:border-text-secondary transition-colors group cursor-pointer"
                                >
                                    <div className="w-8 h-8 rounded-full bg-surface mb-2 flex items-center justify-center group-hover:bg-accent-purple/20 transition-colors">
                                        <Plus size={16} className="text-text-secondary group-hover:text-accent-purple" />
                                    </div>
                                    <span className="text-[10px] text-text-secondary uppercase tracking-wide font-medium text-center">
                                        {role}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Agent count badge */}
                    <div className="bg-surface/80 backdrop-blur border border-border p-3 rounded-xl text-center">
                        <div className="text-2xl font-bold text-text-primary">{nodes.length}</div>
                        <div className="text-xs text-text-secondary">Agents</div>
                    </div>
                </div>
            </div>
        </div>
    );
};
