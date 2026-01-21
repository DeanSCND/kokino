import React, { useCallback, useRef, useState, useEffect } from 'react';
import { ReactFlow, MiniMap, Controls, Background, useNodesState, useEdgesState, addEdge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { AgentNode } from '../components/AgentNode';
import { ConnectionEdge } from '../components/ConnectionEdge';
import { ChatPanel } from '../components/ChatPanel';
import { TerminalPanel } from '../components/TerminalPanel';
import { AgentDashboard } from '../components/AgentDashboard';
import { BrokerStatus } from '../components/BrokerStatus';
import { Plus, Play, Square, MessageSquare, Terminal as TerminalIcon, LayoutDashboard } from 'lucide-react';
import broker from '../services/broker';

// Register custom node and edge types - Reference: POC Canvas.jsx:9
const nodeTypes = { agent: AgentNode };
const edgeTypes = { orchestrated: ConnectionEdge };

const initialNodes = [];
const initialEdges = [];

export const Canvas = () => {
    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
    const reactFlowWrapper = useRef(null);
    const contextMenuRef = useRef(null);
    const previousFocusRef = useRef(null);
    const [contextMenu, setContextMenu] = useState(null);

    // Phase 3: Orchestration state
    const [isOrchestrating, setIsOrchestrating] = useState(false);
    const [chatMessages, setChatMessages] = useState([]);
    const [terminalOutput, setTerminalOutput] = useState([]);
    const [selectedAgent, setSelectedAgent] = useState(null);

    // Phase 4: Dashboard view toggle
    const [activeView, setActiveView] = useState('chat'); // 'chat' or 'dashboard'

    // Phase 4: Workflow controls
    const [isPaused, setIsPaused] = useState(false);
    const [stepMode, setStepMode] = useState(false);
    const currentStepRef = useRef(0); // Use ref to avoid effect re-triggering
    const advanceStepRef = useRef(false); // Signal to advance to next step

    // Timeout tracking for cleanup
    const timeoutRefs = useRef([]);

    // Track seen ticket IDs to avoid duplicates (outside chat state)
    const seenTicketIds = useRef(new Set());

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
    const addNode = async (role) => {
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

        // Phase 4: Register agent with broker
        console.log(`[canvas] Attempting to register agent ${name} with broker...`);

        try {
            const result = await broker.registerAgent(name, {
                type: 'ui-agent',
                metadata: { role, nodeId: id },
                heartbeatIntervalMs: 30000
            });
            console.log(`[canvas] ✓ Registered agent ${name} with broker:`, result);
        } catch (error) {
            console.error(`[canvas] ✗ Failed to register agent ${name}:`, error);
        }
    };

    // Context Menu Handlers - Reference: POC Canvas.jsx:153-199
    const onNodeContextMenu = useCallback(
        (event, node) => {
            event.preventDefault();
            // Store currently focused element to return focus later
            previousFocusRef.current = document.activeElement;

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
            // Store currently focused element to return focus later
            previousFocusRef.current = document.activeElement;

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

    const closeContextMenu = useCallback(() => {
        setContextMenu(null);
        // Return focus to previously focused element
        if (previousFocusRef.current) {
            previousFocusRef.current.focus();
        }
    }, []);

    const onPaneClick = useCallback(() => closeContextMenu(), [closeContextMenu]);

    // Mock handlers for Phase 2 - Real implementation in Phase 6 (terminals) and Phase 5 (backend)
    const handleConnect = () => {
        if (!contextMenu?.data?.name) return;
        // Phase 3: Set selected agent for terminal view
        setSelectedAgent(contextMenu.data.name);
        closeContextMenu();
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

        closeContextMenu();
    };

    const handleSetPurpose = (purpose) => {
        if (contextMenu?.type !== 'edge') return;

        setEdges((eds) => eds.map((e) => {
            if (e.id === contextMenu.id) {
                return { ...e, data: { ...e.data, purpose } };
            }
            return e;
        }));

        closeContextMenu();
    };

    const handleDeleteConnection = () => {
        if (contextMenu?.type !== 'edge') return;

        setEdges((eds) => eds.filter((e) => e.id !== contextMenu.id));
        closeContextMenu();
    };

    // Focus management - Move focus into context menu when it opens
    useEffect(() => {
        if (contextMenu && contextMenuRef.current) {
            const firstButton = contextMenuRef.current.querySelector('button');
            if (firstButton) {
                firstButton.focus();
            }
        }
    }, [contextMenu]);

    // Phase 3: Load team from localStorage on mount
    useEffect(() => {
        const savedTeam = localStorage.getItem('kokino-team-v1');
        if (savedTeam) {
            try {
                const { nodes: savedNodes, edges: savedEdges } = JSON.parse(savedTeam);
                if (savedNodes && savedNodes.length > 0) {
                    setNodes(savedNodes);
                    setEdges(savedEdges || []);
                }
            } catch (err) {
                console.error('Failed to load saved team:', err);
                localStorage.removeItem('kokino-team-v1');
            }
        }
    }, [setNodes, setEdges]);

    // Phase 3: Save team to localStorage whenever nodes/edges change
    useEffect(() => {
        if (nodes.length > 0 || edges.length > 0) {
            localStorage.setItem('kokino-team-v1', JSON.stringify({ nodes, edges }));
        } else {
            // Clear localStorage when canvas is empty
            localStorage.removeItem('kokino-team-v1');
        }
    }, [nodes, edges]);

    // Phase 4: Real Broker Orchestration Flow with Step Controls
    useEffect(() => {
        if (!isOrchestrating || nodes.length === 0) return;

        // Real conversation flow through broker
        const orchestrateTeam = async () => {
            const conversations = [
                { from: 'Alice', to: 'Bob', content: 'Can you review the authentication module?' },
                { from: 'Bob', to: 'Jerry', content: 'Jerry, please implement the user login endpoint' },
                { from: 'Jerry', to: 'Bob', content: 'Endpoint implemented. Running tests...' },
                { from: 'Jerry', content: '✓ All tests passed' },
                { from: 'Bob', to: 'Alice', content: 'Authentication module is ready for review' },
                { from: 'Alice', content: 'Great work team! Moving to QA phase.' }
            ];

            for (let i = 0; i < conversations.length; i++) {
                if (!isOrchestrating) break; // Stop if orchestration cancelled

                // Step mode: wait for manual advance
                if (stepMode) {
                    currentStepRef.current = i;
                    advanceStepRef.current = false;

                    // Wait until advanceStepRef is set to true
                    while (stepMode && !advanceStepRef.current && isOrchestrating) {
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                    if (!isOrchestrating) break;
                }

                // Pause mode: wait until resumed
                while (isPaused && isOrchestrating) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
                if (!isOrchestrating) break;

                const msg = conversations[i];

                // Send message through broker
                if (msg.to) {
                    try {
                        const result = await broker.sendMessage(msg.to, {
                            payload: msg.content,
                            metadata: { origin: msg.from, timestamp: Date.now() }
                        });

                        console.log(`[orchestration] Sent message ${result.ticketId}: ${msg.from} → ${msg.to}`);

                        // Add to chat display
                        setChatMessages(prev => [...prev, { ...msg, timestamp: Date.now(), ticketId: result.ticketId }]);

                    } catch (error) {
                        console.error('[orchestration] Failed to send message:', error);
                    }
                } else {
                    // Broadcast message
                    setChatMessages(prev => [...prev, { ...msg, timestamp: Date.now() }]);
                }

                // Simulate realistic timing between messages (skip in step mode)
                if (!stepMode) {
                    await new Promise(resolve => setTimeout(resolve, 3000));
                }
            }

            // Orchestration complete
            setIsOrchestrating(false);
            setStepMode(false);
            currentStepRef.current = 0;
        };

        orchestrateTeam();

        // Cleanup on unmount or stop
        return () => {
            // Future: cancel pending broker requests
        };
    }, [isOrchestrating, nodes.length, isPaused, stepMode]);

    // Poll broker for agent status updates (continuous, not just during orchestration)
    useEffect(() => {
        const interval = setInterval(async () => {
            try {
                const agents = await broker.listAgents({ status: 'online' });

                // Update node statuses from broker data
                setNodes(nds => nds.map(node => {
                    const agentData = agents.find(a => a.agentId === node.data.name);
                    if (agentData) {
                        return {
                            ...node,
                            data: {
                                ...node.data,
                                status: agentData.status,
                                task: agentData.metadata?.currentTask || node.data.task
                            }
                        };
                    }
                    return node;
                }));

            } catch (error) {
                console.error('[status-poll] Failed to fetch agent statuses:', error);
            }
        }, 2000);

        return () => clearInterval(interval);
    }, [setNodes]);

    // Poll broker for pending tickets (inbound messages)
    useEffect(() => {
        if (nodes.length === 0) return;

        const interval = setInterval(async () => {
            // Poll each agent for pending tickets
            for (const node of nodes) {
                const agentName = node.data.name;
                try {
                    const pending = await broker.getPendingTickets(agentName);

                    if (pending.length > 0) {
                        console.log(`[ticket-poll] ${agentName} has ${pending.length} pending tickets`);

                        // Add pending tickets to chat (check seenTicketIds ref, not state)
                        for (const ticket of pending) {
                            if (!seenTicketIds.current.has(ticket.ticketId)) {
                                seenTicketIds.current.add(ticket.ticketId);

                                setChatMessages(prev => [...prev, {
                                    from: ticket.originAgent,
                                    to: agentName,
                                    content: ticket.payload,
                                    timestamp: new Date(ticket.createdAt).getTime(),
                                    ticketId: ticket.ticketId,
                                    status: ticket.status
                                }]);
                            }
                        }
                    }
                } catch (error) {
                    console.error(`[ticket-poll] Failed to fetch tickets for ${agentName}:`, error);
                }
            }
        }, 3000); // Poll every 3 seconds

        return () => clearInterval(interval);
    }, [nodes]);

    // Legacy mock conversations for fallback
    useEffect(() => {
        // This effect is now replaced by real broker orchestration above
        return;

        const mockConversations = [
            { from: 'Alice', to: 'Bob', content: 'Can you review the authentication module?' },
            { from: 'Bob', to: 'Jerry', content: 'Jerry, please implement the user login endpoint' },
            { from: 'Jerry', to: 'Bob', content: 'Endpoint implemented. Running tests...' },
            { from: 'Jerry', content: '✓ All tests passed' },
            { from: 'Bob', to: 'Alice', content: 'Authentication module is ready for review' },
            { from: 'Alice', content: 'Great work team! Moving to QA phase.' }
        ];

        const mockTerminalCommands = [
            { type: 'command', content: 'npm install express' },
            { type: 'output', content: 'added 50 packages in 3.2s' },
            { type: 'command', content: 'npm run test' },
            { type: 'success', content: '✓ auth.test.js (5 tests)' },
            { type: 'success', content: '✓ user.test.js (3 tests)' },
            { type: 'info', content: 'Test Suites: 2 passed, 2 total' }
        ];

        let messageIndex = 0;
        let terminalIndex = 0;

        const interval = setInterval(() => {
            // Add chat message
            if (messageIndex < mockConversations.length) {
                setChatMessages((prev) => [
                    ...prev,
                    { ...mockConversations[messageIndex], timestamp: Date.now() }
                ]);
                messageIndex++;
            }

            // Add terminal output
            if (terminalIndex < mockTerminalCommands.length) {
                setTerminalOutput((prev) => [...prev, mockTerminalCommands[terminalIndex]]);
                terminalIndex++;
            }

            // Update node states based on conversation
            setNodes((nds) => nds.map((n) => {
                const name = n.data.name;
                const statusCycle = ['idle', 'active', 'busy'];
                const taskMessages = [
                    'Reviewing requirements',
                    'Writing code',
                    'Running tests',
                    'Waiting for feedback'
                ];

                if (n.data.status === 'offline') return n;

                return {
                    ...n,
                    data: {
                        ...n.data,
                        status: statusCycle[Math.floor(Math.random() * statusCycle.length)],
                        task: taskMessages[Math.floor(Math.random() * taskMessages.length)]
                    }
                };
            }));

            // Activate random edge (message flow)
            if (edges.length > 0) {
                const randomEdge = edges[Math.floor(Math.random() * edges.length)];
                setEdges((eds) => eds.map((e) => {
                    if (e.id === randomEdge.id) {
                        const timeoutId = setTimeout(() => {
                            setEdges((eds2) => eds2.map((e2) =>
                                e2.id === e.id ? { ...e2, className: 'react-flow__edge' } : e2
                            ));
                        }, 2000);
                        timeoutRefs.current.push(timeoutId);
                        return { ...e, className: 'react-flow__edge active' };
                    }
                    return e;
                }));
            }

            // Stop after all messages sent
            if (messageIndex >= mockConversations.length && terminalIndex >= mockTerminalCommands.length) {
                setIsOrchestrating(false);
            }
        }, 3000);

        return () => {
            clearInterval(interval);
            // Clear all pending timeouts
            timeoutRefs.current.forEach(clearTimeout);
            timeoutRefs.current = [];
        };
    }, [isOrchestrating, nodes, edges, setNodes, setEdges]);

    // Simulation Loop - Phase 2 requirement (now only runs when NOT orchestrating)
    useEffect(() => {
        if (isOrchestrating || nodes.length === 0 || edges.length === 0) return;

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
                    const timeoutId = setTimeout(() => {
                        setEdges((eds2) => eds2.map((e2) =>
                            e2.id === e.id ? { ...e2, className: 'react-flow__edge' } : e2
                        ));
                    }, 2000);
                    timeoutRefs.current.push(timeoutId);
                    return { ...e, className: 'react-flow__edge active' };
                }
                return e;
            }));
        }, 3000); // Run every 3 seconds

        return () => {
            clearInterval(interval);
            timeoutRefs.current.forEach(clearTimeout);
            timeoutRefs.current = [];
        };
    }, [isOrchestrating, nodes, edges, setNodes, setEdges]);

    // Topology validation for Start Team button
    const canStartTeam = nodes.length >= 2 && edges.length >= 1;

    return (
        <div className="w-full h-full flex" ref={reactFlowWrapper}>
            {/* Left Panel: Communication */}
            <aside className="w-96 h-full border-r border-border flex flex-col bg-background">
                {/* View Toggle Tabs */}
                <div className="flex border-b border-border bg-surface">
                    <button
                        onClick={() => setActiveView('chat')}
                        className={`flex-1 px-4 py-2 text-xs font-medium uppercase tracking-wider transition-colors ${
                            activeView === 'chat'
                                ? 'bg-surface-hover text-text-primary border-b-2 border-accent-purple'
                                : 'text-text-muted hover:text-text-secondary'
                        }`}
                    >
                        <div className="flex items-center justify-center gap-2">
                            <MessageSquare size={14} />
                            Chat
                        </div>
                    </button>
                    <button
                        onClick={() => setActiveView('dashboard')}
                        className={`flex-1 px-4 py-2 text-xs font-medium uppercase tracking-wider transition-colors ${
                            activeView === 'dashboard'
                                ? 'bg-surface-hover text-text-primary border-b-2 border-accent-purple'
                                : 'text-text-muted hover:text-text-secondary'
                        }`}
                    >
                        <div className="flex items-center justify-center gap-2">
                            <LayoutDashboard size={14} />
                            Dashboard
                        </div>
                    </button>
                </div>

                {/* Active View */}
                {activeView === 'chat' ? (
                    <>
                        <ChatPanel messages={chatMessages} />
                        <TerminalPanel agentName={selectedAgent} output={terminalOutput} />
                    </>
                ) : (
                    <AgentDashboard />
                )}
            </aside>

            {/* Right Panel: Canvas */}
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

                {/* Top-right Controls - Phase 4: Workflow Controls */}
                <div className="absolute top-6 right-6 z-10 flex flex-col gap-2">
                    {/* Primary Control: Start/Stop */}
                    <button
                        onClick={() => {
                            if (isOrchestrating) {
                                setIsOrchestrating(false);
                                setIsPaused(false);
                                setStepMode(false);
                                currentStepRef.current = 0;
                            } else {
                                // Reset and start orchestration
                                setChatMessages([]);
                                setTerminalOutput([]);
                                seenTicketIds.current.clear();
                                currentStepRef.current = 0;
                                setIsOrchestrating(true);
                            }
                        }}
                        className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                            isOrchestrating
                                ? 'bg-red-500 hover:bg-red-600 text-white'
                                : canStartTeam
                                ? 'bg-accent-purple hover:bg-purple-600 text-white'
                                : 'bg-surface-hover text-text-muted cursor-not-allowed'
                        }`}
                        disabled={!canStartTeam}
                        title={!canStartTeam ? 'Add at least 2 agents and 1 connection' : ''}
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

                    {/* Secondary Controls: Pause/Resume/Step (only visible during orchestration) */}
                    {isOrchestrating && (
                        <div className="flex gap-2">
                            <button
                                onClick={() => setIsPaused(!isPaused)}
                                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                                    isPaused
                                        ? 'bg-green-500 hover:bg-green-600 text-white'
                                        : 'bg-yellow-500 hover:bg-yellow-600 text-white'
                                }`}
                                title={isPaused ? 'Resume' : 'Pause'}
                            >
                                {isPaused ? 'Resume' : 'Pause'}
                            </button>

                            <button
                                onClick={() => {
                                    setStepMode(true);
                                    setIsPaused(false);
                                }}
                                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                                    stepMode
                                        ? 'bg-accent-blue text-white'
                                        : 'bg-surface-hover hover:bg-surface text-text-primary border border-border'
                                }`}
                                title="Step Mode"
                            >
                                Step Mode
                            </button>

                            {stepMode && (
                                <button
                                    onClick={() => { advanceStepRef.current = true; }}
                                    className="px-3 py-2 rounded-lg text-sm font-medium bg-accent-purple hover:bg-purple-600 text-white transition-colors"
                                    title="Next Step"
                                >
                                    Next →
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Floating Agent Library Panel - Reference: POC Canvas.jsx:223-242 */}
                <div className="absolute top-6 left-6 flex flex-col gap-4 z-10">
                    {/* Broker Connection Status */}
                    <BrokerStatus />

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
                        ref={contextMenuRef}
                        className="absolute z-50 bg-[#18181b] border border-zinc-700 rounded-lg shadow-xl py-1 w-48 animate-in fade-in zoom-in duration-100 origin-top-left"
                        style={{ top: contextMenu.top, left: contextMenu.left }}
                        role="menu"
                        onKeyDown={(e) => e.key === 'Escape' && closeContextMenu()}
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
