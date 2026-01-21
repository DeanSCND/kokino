import React, { useCallback, useRef, useState, useEffect } from 'react';
import { ReactFlow, MiniMap, Controls, Background, useNodesState, useEdgesState, addEdge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { AgentNode } from '../components/AgentNode';
import { ConnectionEdge } from '../components/ConnectionEdge';
import { Plus } from 'lucide-react';

// Register custom node and edge types - Reference: POC Canvas.jsx:9
const nodeTypes = { agent: AgentNode };
const edgeTypes = { orchestrated: ConnectionEdge };

const initialNodes = [];
const initialEdges = [];

export const Canvas = () => {
    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
    const reactFlowWrapper = useRef(null);
    const [contextMenu, setContextMenu] = useState(null);

    // Connection handler with validation - Reference: POC Canvas.jsx:22
    const onConnect = useCallback(
        (params) => {
            // Prevent self-loops
            if (params.source === params.target) {
                console.warn('Cannot connect node to itself');
                return;
            }

            // Check for duplicate connections
            const isDuplicate = edges.some(
                edge => edge.source === params.source && edge.target === params.target
            );

            if (isDuplicate) {
                console.warn('Connection already exists');
                return;
            }

            setEdges((eds) =>
                addEdge({
                    ...params,
                    type: 'orchestrated',
                    animated: true,
                    className: 'react-flow__edge',
                    data: { purpose: 'message', active: false },
                    style: { stroke: 'var(--color-border)' }
                }, eds)
            );
        },
        [edges, setEdges]
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

    // Context Menu Handlers - Reference: POC Canvas.jsx:153-199
    const onNodeContextMenu = useCallback(
        (event, node) => {
            event.preventDefault();
            const pane = reactFlowWrapper.current.getBoundingClientRect();

            setContextMenu({
                type: 'node',
                id: node.id,
                top: event.clientY - pane.top,
                left: event.clientX - pane.left,
                data: node.data
            });
        },
        []
    );

    const onEdgeContextMenu = useCallback(
        (event, edge) => {
            event.preventDefault();
            const pane = reactFlowWrapper.current.getBoundingClientRect();

            setContextMenu({
                type: 'edge',
                id: edge.id,
                top: event.clientY - pane.top,
                left: event.clientX - pane.left,
                data: edge.data
            });
        },
        []
    );

    const onPaneClick = useCallback(() => setContextMenu(null), []);

    // Mock handlers for Phase 2 - Real implementation in Phase 6 (terminals) and Phase 5 (backend)
    const handleConnect = () => {
        if (!contextMenu?.data?.name) return;
        // Phase 6 will implement: setTerminalAgent(contextMenu.data.name);
        alert(`Terminal connection for ${contextMenu.data.name} will be implemented in Phase 6`);
        setContextMenu(null);
    };

    const handleStop = () => {
        if (!contextMenu?.data?.name) return;
        const agentName = contextMenu.data.name;

        // Mock stop - update visual state only
        setNodes((nds) => nds.map((n) => {
            if (n.data.name === agentName) {
                return { ...n, data: { ...n.data, status: 'offline', task: 'Stopped (mock)' } };
            }
            return n;
        }));

        setContextMenu(null);
    };

    const handleSetPurpose = (purpose) => {
        if (contextMenu?.type !== 'edge') return;

        setEdges((eds) => eds.map((e) => {
            if (e.id === contextMenu.id) {
                return { ...e, data: { ...e.data, purpose } };
            }
            return e;
        }));

        setContextMenu(null);
    };

    const handleDeleteConnection = () => {
        if (contextMenu?.type !== 'edge') return;

        setEdges((eds) => eds.filter((e) => e.id !== contextMenu.id));
        setContextMenu(null);
    };

    // Simulation Loop - Phase 2 requirement for "simulated agent responses"
    useEffect(() => {
        if (nodes.length === 0 || edges.length === 0) return;

        const interval = setInterval(() => {
            // Random agent status changes
            const randomNode = nodes[Math.floor(Math.random() * nodes.length)];
            const statuses = ['idle', 'active', 'busy'];
            const tasks = [
                'Analyzing requirements...',
                'Reviewing code...',
                'Running tests...',
                'Writing implementation...',
                'Waiting for input...'
            ];

            setNodes((nds) => nds.map((n) => {
                if (n.id === randomNode.id && n.data.status !== 'offline') {
                    const newStatus = statuses[Math.floor(Math.random() * statuses.length)];
                    const newTask = tasks[Math.floor(Math.random() * tasks.length)];
                    return { ...n, data: { ...n.data, status: newStatus, task: newTask } };
                }
                return n;
            }));

            // Random edge activation (message flow simulation)
            const randomEdge = edges[Math.floor(Math.random() * edges.length)];
            setEdges((eds) => eds.map((e) => {
                if (e.id === randomEdge.id) {
                    // Activate for 2 seconds then deactivate
                    setTimeout(() => {
                        setEdges((eds2) => eds2.map((e2) =>
                            e2.id === e.id ? { ...e2, className: 'react-flow__edge' } : e2
                        ));
                    }, 2000);
                    return { ...e, className: 'react-flow__edge active' };
                }
                return e;
            }));
        }, 3000); // Run every 3 seconds

        return () => clearInterval(interval);
    }, [nodes, edges, setNodes, setEdges]);

    return (
        <div className="w-full h-full flex" ref={reactFlowWrapper}>
            {/* React Flow Canvas */}
            <div className="flex-1 h-full relative bg-background">
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    onNodeContextMenu={onNodeContextMenu}
                    onEdgeContextMenu={onEdgeContextMenu}
                    onPaneClick={onPaneClick}
                    nodeTypes={nodeTypes}
                    edgeTypes={edgeTypes}
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

                {/* Context Menu - Reference: POC Canvas.jsx:269-287 */}
                {contextMenu && (
                    <div
                        className="absolute z-50 bg-[#18181b] border border-zinc-700 rounded-lg shadow-xl py-1 w-48 animate-in fade-in zoom-in duration-100 origin-top-left"
                        style={{ top: contextMenu.top, left: contextMenu.left }}
                        role="menu"
                        onKeyDown={(e) => e.key === 'Escape' && setContextMenu(null)}
                    >
                        {contextMenu.type === 'node' ? (
                            <>
                                <div className="px-3 py-2 border-b border-zinc-800 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                                    {contextMenu.data.role}
                                </div>
                                <button
                                    onClick={handleConnect}
                                    className="w-full text-left px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors flex items-center gap-2"
                                    role="menuitem"
                                >
                                    <span className="w-2 h-2 rounded-full bg-green-500"></span>
                                    Connect Terminal
                                </button>
                                <button
                                    onClick={handleStop}
                                    className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-zinc-800 hover:text-red-300 transition-colors flex items-center gap-2"
                                    role="menuitem"
                                >
                                    <span className="w-2 h-2 rounded-full bg-red-500"></span>
                                    Stop Agent
                                </button>
                            </>
                        ) : (
                            <>
                                <div className="px-3 py-2 border-b border-zinc-800 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                                    Connection
                                </div>
                                <button
                                    onClick={() => handleSetPurpose('requirements')}
                                    className="w-full text-left px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
                                    role="menuitem"
                                >
                                    📋 Requirements
                                </button>
                                <button
                                    onClick={() => handleSetPurpose('code-review')}
                                    className="w-full text-left px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
                                    role="menuitem"
                                >
                                    🔍 Code Review
                                </button>
                                <button
                                    onClick={() => handleSetPurpose('implementation')}
                                    className="w-full text-left px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
                                    role="menuitem"
                                >
                                    ⚙️ Implementation
                                </button>
                                <button
                                    onClick={() => handleSetPurpose('testing')}
                                    className="w-full text-left px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
                                    role="menuitem"
                                >
                                    🧪 Testing
                                </button>
                                <div className="border-t border-zinc-800 my-1"></div>
                                <button
                                    onClick={handleDeleteConnection}
                                    className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-zinc-800 hover:text-red-300 transition-colors"
                                    role="menuitem"
                                >
                                    🗑️ Delete Connection
                                </button>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
