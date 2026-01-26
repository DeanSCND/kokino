import React, { useCallback, useRef, useState, useEffect } from 'react';
import { ReactFlow, MiniMap, Controls, Background, useNodesState, useEdgesState, addEdge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { AgentNode } from '../components/AgentNode';
import { ConnectionEdge } from '../components/ConnectionEdge';
import { ChatPanel } from '../components/ChatPanel';
import { AgentDashboard } from '../components/AgentDashboard';
import { CanvasHeader } from '../components/CanvasHeader';
import { PerformanceMetrics } from '../components/PerformanceMetrics';
import { TerminalModal } from '../components/TerminalModal';
import { AgentChatPanel } from '../components/AgentChatPanel';
import { TemplateLibrary } from '../components/TemplateLibrary';
import { TimelineViewer } from '../components/TimelineViewer';
import { LoopAlertManager } from '../components/LoopAlert';
import { LoopDetector } from '../utils/LoopDetector';
import { EscalationTracker } from '../utils/EscalationTracker';
import { GraphEnforcer } from '../utils/GraphEnforcer';
import { Plus, Play, Square, MessageSquare, Terminal as TerminalIcon, LayoutDashboard, Loader2, AlertCircle, Library, Clock, Github } from 'lucide-react';
import * as agentService from '../services/api/agentService';
import * as messageService from '../services/api/messageService';
import * as configService from '../services/api/configService';
import * as canvasStorage from '../services/storage/canvasStorage';
import { useUIStore } from '../stores/useUIStore';
import { useAgentStore } from '../stores/useAgentStore';
import { AgentLibraryPanel } from '../components/agents/AgentLibraryPanel';
import { TeamManager } from '../components/TeamManager';
import { GitHubIssues } from '../components/GitHubIssues';
import { CreatePRDialog } from '../components/CreatePRDialog';
import { BranchManager } from '../components/BranchManager';
import { CommitQueueViewer } from '../components/CommitQueueViewer';
import { StageCommitDialog } from '../components/StageCommitDialog';
import { generateTeamFromIssue } from '../utils/teamSpawner';
import statusSync from '../utils/statusSync';

// Register custom node and edge types - Reference: POC Canvas.jsx:9
const nodeTypes = { agent: AgentNode };
const edgeTypes = { orchestrated: ConnectionEdge };

const initialNodes = [];
const initialEdges = [];

export const Canvas = ({ setHeaderControls }) => {
    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
    const reactFlowWrapper = useRef(null);
    const contextMenuRef = useRef(null);
    const previousFocusRef = useRef(null);

    // Phase 4.2: UI state from Zustand store
    const {
        contextMenu,
        setContextMenu,
        closeContextMenu: closeContextMenuFromStore,
        activeView,
        setActiveView,
        showChatPanel,
        showTeamPanel,
        showAgentLibrary,
        showTemplateLibrary,
        showTimeline,
        showGitHubIssues,
        showBranchManager,
        showCommitQueue,
        showCreatePR,
        showStageCommit,
        prAgentName,
        stageCommitAgent,
        terminalAgent,
        chatAgent,
        setShowChatPanel,
        setShowTeamPanel,
        setShowAgentLibrary,
        setShowTemplateLibrary,
        setShowTimeline,
        setShowGitHubIssues,
        setShowBranchManager,
        setShowCommitQueue,
        setShowCreatePR,
        setShowStageCommit,
        setTerminalAgent,
        setChatAgent,
    } = useUIStore();

    // Phase 4.2: Agent state from Zustand store
    const {
        isOrchestrating,
        isPaused,
        stepMode,
        chatMessages,
        detectedLoops,
        isAddingAgent,
        isLoadingAgents,
        operationError,
        setIsOrchestrating,
        setIsPaused,
        setStepMode,
        setChatMessages,
        addChatMessage,
        setDetectedLoops,
        addDetectedLoop,
        removeDetectedLoop,
        setIsAddingAgent,
        setIsLoadingAgents,
        setOperationError,
    } = useAgentStore();

    // Phase 4: Workflow controls
    const currentStepRef = useRef(0); // Use ref to avoid effect re-triggering
    const advanceStepRef = useRef(false); // Signal to advance to next step

    // Timeout tracking for cleanup
    const timeoutRefs = useRef([]);

    // Track seen ticket IDs to avoid duplicates (outside chat state)
    const seenTicketIds = useRef(new Set());

    // Phase 8: Loop detection state
    const loopDetectorRef = useRef(null);

    // Initialize loop detector
    if (!loopDetectorRef.current) {
        loopDetectorRef.current = new LoopDetector({
            maxPathLength: 10,
            loopThreshold: 5,  // Increased from 3 to reduce false positives
            windowSize: 50
        });

        // Listen for loop detection events
        loopDetectorRef.current.onLoopDetected((loop) => {
            console.warn('[LoopDetector] Loop detected:', loop);
            addDetectedLoop(loop);
        });
    }

    // Phase 8: Escalation tracking state
    const escalationTrackerRef = useRef(null);

    // Initialize escalation tracker
    if (!escalationTrackerRef.current) {
        escalationTrackerRef.current = new EscalationTracker();

        // Listen for escalation changes
        escalationTrackerRef.current.onChange((agent, escalation) => {
            console.log('[EscalationTracker] Escalation change:', agent, escalation);

            // Update node data with escalation
            setNodes(nds => nds.map(node => {
                if (node.data.name === agent) {
                    return {
                        ...node,
                        data: {
                            ...node.data,
                            escalation: escalation
                        }
                    };
                }
                return node;
            }));
        });
    }

    // Phase 8: Graph enforcement state
    const graphEnforcerRef = useRef(null);

    // Initialize graph enforcer
    if (!graphEnforcerRef.current) {
        graphEnforcerRef.current = new GraphEnforcer(nodes, edges);

        // Listen for graph violations
        graphEnforcerRef.current.onViolation((violation) => {
            console.warn('[GraphEnforcer] Communication violation:', violation);

            // Show violation in chat
            addChatMessage({
                from: 'System',
                content: `⚠️ Communication blocked: ${violation.from} cannot send to ${violation.to}. ${violation.reason}`,
                timestamp: violation.timestamp
            });
        });
    }

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
                    data: { purpose: 'message', active: false, onDelete: handleDeleteEdge },
                    style: { stroke: 'var(--color-border)' }
                }, eds)
            );
        },
        [edges, setEdges]
    );

    // Add agent node to canvas - Phase 2: Instantiate from config ID
    const addNode = async (configId) => {
        setIsAddingAgent(true);
        setOperationError(null);

        try {
            // Use browser's crypto API with fallback for older environments
            const id = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

            // Fetch config to get agent details
            const config = await configService.getAgentConfig(configId);

            // Generate agent name with duplicate checking
            const existingNames = nodes.map(n => n.data.name);
            let name = config.name;
            let counter = 2;
            while (existingNames.includes(name)) {
                name = `${config.name}-${counter}`;
                counter++;
            }

            if (name !== config.name) {
                console.log(`[canvas] Agent name ${config.name} already exists, using ${name} instead`);
            }

            // Grid positioning to avoid overlaps
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
                    agentId: name, // Phase 3: Add agentId for bootstrap/compaction status
                    role: config.role,
                    status: 'registering',
                    task: 'Instantiating from config...',
                    onDelete: handleDeleteAgent
                }
            };

            // Optimistic UI update
            setNodes((nds) => nds.concat(newNode));

            // Instantiate agent from config
            console.log(`[canvas] Instantiating agent ${name} from config ${config.id}...`);
            const result = await configService.instantiateAgent(config.id, name);
            console.log(`[canvas] ✓ Instantiated agent ${name}:`, result);

            // Update node status after successful registration
            setNodes(nds => nds.map(n =>
                n.id === id
                    ? { ...n, data: { ...n.data, status: 'idle', task: 'Waiting for orchestration...', metadata: result.metadata } }
                    : n
            ));

        } catch (error) {
            console.error(`[canvas] ✗ Failed to instantiate agent:`, error);
            setOperationError(`Failed to add agent: ${error.message}`);

            // Remove the failed node after a delay
            setTimeout(() => {
                setNodes(nds => nds.slice(0, -1));
            }, 2000);
        } finally {
            setIsAddingAgent(false);
        }
    };

    // Delete agent from canvas
    const handleDeleteAgent = async (nodeId, agentName) => {
        console.log(`[canvas] Deleting agent: ${agentName} (${nodeId})`);
        try {
            // Remove node and edges from canvas
            setNodes((nds) => {
                const filtered = nds.filter((n) => n.id !== nodeId);
                console.log(`[canvas] Nodes before delete: ${nds.length}, after: ${filtered.length}`);
                return filtered;
            });
            setEdges((eds) => {
                const filtered = eds.filter((e) => e.source !== nodeId && e.target !== nodeId);
                console.log(`[canvas] Edges before delete: ${eds.length}, after: ${filtered.length}`);
                return filtered;
            });

            // Stop agent first (sets status to offline)
            try {
                await agentService.stopAgent(agentName);
                console.log(`[canvas] ✓ Stopped agent ${agentName}`);
            } catch (error) {
                console.error(`[canvas] Failed to stop ${agentName}:`, error);
                // Continue anyway
            }

            // Delete agent from registry
            try {
                await agentService.deleteAgent(agentName);
                console.log(`[canvas] ✓ Deleted agent ${agentName} from registry`);
            } catch (error) {
                console.error(`[canvas] Failed to delete ${agentName}:`, error);
                // Continue anyway - node is already removed from UI
            }

            // Kill tmux session if it exists
            try {
                await agentService.killTmuxSession(agentName);
                console.log(`[canvas] ✓ Killed tmux session for ${agentName}`);
            } catch (error) {
                console.error(`[canvas] Failed to kill tmux session for ${agentName}:`, error);
                // Continue anyway - session might not exist
            }
        } catch (error) {
            console.error(`[canvas] Failed to delete agent:`, error);
            setOperationError(`Failed to delete agent: ${error.message}`);
        }
    };

    // Delete edge from canvas
    const handleDeleteEdge = (edgeId) => {
        setEdges((eds) => eds.filter((e) => e.id !== edgeId));
        console.log(`[canvas] ✓ Deleted edge ${edgeId}`);
    };

    // Phase 7: Spawn team from template
    const spawnTemplate = async (template) => {
        setIsAddingAgent(true);
        setOperationError(null);

        try {
            console.log(`[canvas] Spawning template: ${template.name}`);

            // Create mapping from role to generated node ID
            const roleToNodeId = {};
            const newNodes = [];

            // Create nodes for each agent in template
            for (const agentDef of template.agents) {
                const id = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                roleToNodeId[agentDef.role] = id;

                const newNode = {
                    id,
                    type: 'agent',
                    position: agentDef.position,
                    data: {
                        name: agentDef.role,
                        role: agentDef.role,
                        status: 'registering',
                        task: 'Registering with apiClient...',
                        onDelete: handleDeleteAgent
                    }
                };

                newNodes.push(newNode);

                // Register with broker
                try {
                    await agentService.registerAgent(agentDef.role, {
                        type: agentDef.type || 'claude-code',
                        metadata: agentDef.metadata || {}
                    });
                    console.log(`[canvas] ✓ Registered ${agentDef.role}`);
                } catch (error) {
                    console.error(`[canvas] Failed to register ${agentDef.role}:`, error);
                }
            }

            // Add all nodes to canvas
            setNodes((nds) => [...nds, ...newNodes]);

            // Create edges for connections
            const newEdges = template.connections.map((conn, i) => ({
                id: `template-edge-${i}`,
                source: roleToNodeId[conn.source],
                target: roleToNodeId[conn.target],
                type: 'orchestrated',
                animated: true,
                className: 'react-flow__edge',
                data: { purpose: conn.purpose || 'message', active: false, onDelete: handleDeleteEdge },
                style: { stroke: 'var(--color-border)' }
            }));

            // Add all edges to canvas
            setEdges((eds) => [...eds, ...newEdges]);

            console.log(`[canvas] ✓ Spawned template with ${newNodes.length} agents and ${newEdges.length} connections`);

        } catch (error) {
            console.error(`[canvas] Template spawn failed:`, error);
            setOperationError(error.message || 'Failed to spawn template');
        } finally {
            setIsAddingAgent(false);
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
        closeContextMenuFromStore();
        // Return focus to previously focused element
        if (previousFocusRef.current) {
            previousFocusRef.current.focus();
        }
    }, [closeContextMenuFromStore]);

    const onPaneClick = useCallback(() => closeContextMenu(), [closeContextMenu]);

    // Node double-click handler - Open chat for headless, terminal for tmux
    const onNodeDoubleClick = useCallback((event, node) => {
        const agent = node.data;
        const commMode = agent.metadata?.commMode || agent.commMode || 'tmux';

        if (commMode === 'headless') {
            // Phase 3: agentId now included in node.data
            setChatAgent({ ...agent, agentId: agent.agentId || agent.name });
        } else {
            setTerminalAgent(agent.name);
        }
    }, []);

    // Lifecycle handlers - Phase 5
    const handleConnect = () => {
        if (!contextMenu?.data?.name) return;
        // Phase 6: Open terminal modal for agent
        setTerminalAgent(contextMenu.data.name);
        closeContextMenu();
    };

    const handleStop = async () => {
        if (!contextMenu?.data?.name) return;
        const agentName = contextMenu.data.name;

        // Optimistic UI update
        setNodes((nds) => nds.map((n) => {
            if (n.data.name === agentName) {
                return { ...n, data: { ...n.data, status: 'stopping', task: 'Stopping agent...' } };
            }
            return n;
        }));

        try {
            await agentService.stopAgent(agentName);
            console.log(`[lifecycle] Stopped agent: ${agentName}`);

            // Update to final state
            setNodes((nds) => nds.map((n) => {
                if (n.data.name === agentName) {
                    return { ...n, data: { ...n.data, status: 'offline', task: 'Agent stopped' } };
                }
                return n;
            }));
        } catch (error) {
            console.error(`[lifecycle] Failed to stop ${agentName}:`, error);
            setOperationError(`Failed to stop agent: ${error.message}`);

            // Rollback to previous state
            setNodes((nds) => nds.map((n) => {
                if (n.data.name === agentName) {
                    return { ...n, data: { ...n.data, status: 'idle', task: 'Failed to stop' } };
                }
                return n;
            }));
        }

        closeContextMenu();
    };

    const handleStart = async () => {
        if (!contextMenu?.data?.name) return;
        const agentName = contextMenu.data.name;

        // Optimistic UI update
        setNodes((nds) => nds.map((n) => {
            if (n.data.name === agentName) {
                return { ...n, data: { ...n.data, status: 'starting', task: 'Starting agent...' } };
            }
            return n;
        }));

        try {
            const result = await agentService.startAgent(agentName);
            console.log(`[lifecycle] Started agent: ${agentName}`, result);

            // Issue #110: Update to ready state after successful bootstrap
            setNodes((nds) => nds.map((n) => {
                if (n.data.name === agentName) {
                    return { ...n, data: { ...n.data, status: 'ready', task: 'Waiting for orchestration...' } };
                }
                return n;
            }));
        } catch (error) {
            console.error(`[lifecycle] Failed to start ${agentName}:`, error);
            setOperationError(`Failed to start agent: ${error.message}`);

            // Issue #110: Set error state on failure
            setNodes((nds) => nds.map((n) => {
                if (n.data.name === agentName) {
                    return { ...n, data: { ...n.data, status: 'error', task: `Failed to start: ${error.message}` } };
                }
                return n;
            }));
        }

        closeContextMenu();
    };

    const handleRestart = async () => {
        if (!contextMenu?.data?.name) return;
        const agentName = contextMenu.data.name;

        // Optimistic UI update
        setNodes((nds) => nds.map((n) => {
            if (n.data.name === agentName) {
                return { ...n, data: { ...n.data, status: 'restarting', task: 'Restarting agent...' } };
            }
            return n;
        }));

        try {
            await agentService.restartAgent(agentName);
            console.log(`[lifecycle] Restarted agent: ${agentName}`);

            // Update to final state after a brief delay (restart takes ~100ms)
            setTimeout(() => {
                setNodes((nds) => nds.map((n) => {
                    if (n.data.name === agentName) {
                        return { ...n, data: { ...n.data, status: 'online', task: 'Waiting for orchestration...' } };
                    }
                    return n;
                }));
            }, 150);
        } catch (error) {
            console.error(`[lifecycle] Failed to restart ${agentName}:`, error);
            setOperationError(`Failed to restart agent: ${error.message}`);

            // Rollback
            setNodes((nds) => nds.map((n) => {
                if (n.data.name === agentName) {
                    return { ...n, data: { ...n.data, status: 'offline', task: 'Failed to restart' } };
                }
                return n;
            }));
        }

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

    // Phase 8: Loop detection handlers
    const handleBreakLoop = (loop) => {
        console.log('[LoopDetector] Breaking loop:', loop);

        // Stop orchestration to break the loop
        setIsOrchestrating(false);
        setIsPaused(false);
        setStepMode(false);

        // Reset loop detector
        if (loopDetectorRef.current) {
            loopDetectorRef.current.reset();
        }

        // Clear detected loops
        setDetectedLoops([]);

        // Notify user
        addChatMessage({
            from: 'System',
            content: `⚠️ Loop detected and broken: ${loop.pattern.join(' → ')}`,
            timestamp: Date.now()
        });
    };

    const handleDismissLoop = (loopIndex) => {
        removeDetectedLoop(loopIndex);
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
        const savedState = canvasStorage.loadCanvasState();
        if (savedState) {
            const { nodes: savedNodes, edges: savedEdges } = savedState;
            if (savedNodes && savedNodes.length > 0) {
                const agentNames = savedNodes.map(n => n.data.name).join(', ');
                console.log(`[localStorage] Loading ${savedNodes.length} nodes (${agentNames}) and ${savedEdges?.length || 0} edges`);

                // Inject onDelete callback into loaded nodes
                const nodesWithCallbacks = savedNodes.map(node => ({
                    ...node,
                    data: {
                        ...node.data,
                        onDelete: handleDeleteAgent
                    }
                }));
                // Inject onDelete callback into loaded edges
                const edgesWithCallbacks = (savedEdges || []).map(edge => ({
                    ...edge,
                    data: {
                        ...edge.data,
                        onDelete: handleDeleteEdge
                    }
                }));
                setNodes(nodesWithCallbacks);
                setEdges(edgesWithCallbacks);
            } else {
                console.log('[localStorage] No saved team found or empty');
            }
        } else {
            console.log('[localStorage] No saved data');
        }
    }, [setNodes, setEdges]);

    // Phase 3: Save team to localStorage whenever nodes/edges change
    useEffect(() => {
        if (nodes.length > 0 || edges.length > 0) {
            const agentNames = nodes.map(n => n.data.name).join(', ');
            console.log(`[localStorage] Saving ${nodes.length} nodes (${agentNames}) and ${edges.length} edges`);
            canvasStorage.saveCanvasState({ nodes, edges });
        } else {
            console.log('[localStorage] Clearing - canvas is empty');
            // Clear localStorage when canvas is empty
            canvasStorage.clearCanvasState();
        }
    }, [nodes, edges]);

    // Phase 8: Update graph enforcer when topology changes
    useEffect(() => {
        if (graphEnforcerRef.current) {
            graphEnforcerRef.current.updateGraph(nodes, edges);
        }
    }, [nodes, edges]);

    // Phase 4: Real Broker Orchestration Flow with Step Controls
    useEffect(() => {
        if (!isOrchestrating || nodes.length === 0) return;

        // Real conversation flow through apiClient
        const orchestrateTeam = async () => {
            // Get agent names from current nodes
            const agentNames = nodes.map(n => n.data.name);

            if (agentNames.length < 2) {
                console.warn('[orchestration] Need at least 2 agents to orchestrate');
                setIsOrchestrating(false);
                return;
            }

            // Reset loop detector for fresh orchestration run
            if (loopDetectorRef.current) {
                loopDetectorRef.current.reset();
            }

            // Clear any existing detected loops
            setDetectedLoops([]);

            // Generate dynamic conversation based on agents present
            const [agent1, agent2, ...rest] = agentNames;
            const conversations = [
                { from: agent1, to: agent2, content: `Hi ${agent2}, can you help with this task?` },
                { from: agent2, to: agent1, content: `Sure ${agent1}, I'm on it!` },
                { from: agent2, content: '✓ Task completed successfully' },
                { from: agent1, content: 'Great work team!' }
            ];

            console.log(`[orchestration] Starting with agents: ${agentNames.join(', ')}`);

            // Phase 5: Multi-agent teams use Teams API, single agents use direct start
            if (agentNames.length >= 2) {
                console.log(`[orchestration] Detected team scenario (${agentNames.length} agents), using Teams API...`);

                try {
                    // Fetch agent configs to get their IDs
                    const agentConfigsResponse = await fetch('http://127.0.0.1:5050/api/agents');
                    const allConfigs = await agentConfigsResponse.json();

                    // Map agent names to config IDs
                    const agentConfigIds = agentNames.map(name => {
                        const config = allConfigs.find(c => c.name === name);
                        if (!config) {
                            throw new Error(`Agent config not found: ${name}`);
                        }
                        return config.id;
                    });

                    // Create ephemeral team for this orchestration
                    const teamName = `Canvas-${Date.now()}`;
                    console.log(`[orchestration] Creating team: ${teamName}`);

                    const createResponse = await fetch('http://127.0.0.1:5050/api/teams', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            name: teamName,
                            description: 'Ephemeral team created by Canvas orchestration',
                            agents: agentConfigIds
                        })
                    });

                    if (!createResponse.ok) {
                        const error = await createResponse.json();
                        throw new Error(error.error || 'Failed to create team');
                    }

                    const { team } = await createResponse.json();
                    console.log(`[orchestration] ✓ Team created: ${team.id}`);

                    // Start the team
                    console.log(`[orchestration] Starting team...`);
                    const startResponse = await fetch(`http://127.0.0.1:5050/api/teams/${team.id}/start`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' }
                    });

                    if (!startResponse.ok) {
                        const error = await startResponse.json();
                        throw new Error(error.error || 'Failed to start team');
                    }

                    const startResult = await startResponse.json();
                    console.log(`[orchestration] ✓ Team started: ${startResult.agentCount} agents running`);

                    // Store team ID for cleanup
                    window.__currentTeamId = team.id;

                } catch (error) {
                    console.error(`[orchestration] ✗ Team startup failed:`, error.message);
                    setIsOrchestrating(false);
                    return;
                }
            } else {
                // Single agent: use legacy direct start
                console.log(`[orchestration] Single agent mode, using direct start...`);
                const agentName = agentNames[0];
                try {
                    const result = await agentService.startAgent(agentName);
                    console.log(`[orchestration] ✓ Started ${agentName} in session ${result.tmux}`);
                } catch (error) {
                    console.error(`[orchestration] ✗ Failed to start ${agentName}:`, error.message);
                    setIsOrchestrating(false);
                    return;
                }
            }

            // Give agents a moment to register and start polling
            await new Promise(resolve => setTimeout(resolve, 2000));
            console.log(`[orchestration] Agents ready, beginning message flow...`);

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

                // Send message through apiClient
                if (msg.to) {
                    // Phase 8: Validate communication path before sending
                    if (graphEnforcerRef.current) {
                        const validation = graphEnforcerRef.current.validateMessage(msg.from, msg.to);
                        if (!validation.valid) {
                            console.warn(`[orchestration] Blocked: ${msg.from} → ${msg.to} - ${validation.reason}`);
                            continue; // Skip this message
                        }
                    }

                    try {
                        const result = await messageService.sendMessage(msg.to, {
                            payload: msg.content,
                            metadata: { origin: msg.from, timestamp: Date.now() }
                        });

                        console.log(`[orchestration] Sent message ${result.ticketId}: ${msg.from} → ${msg.to}`);

                        // Add to chat display
                        addChatMessage({ ...msg, timestamp: Date.now(), ticketId: result.ticketId });

                        // Phase 8: Track message for loop detection
                        if (loopDetectorRef.current) {
                            loopDetectorRef.current.addMessage(msg.from, msg.to, Date.now());
                        }

                        // Phase 8: Track message for escalation detection
                        if (escalationTrackerRef.current) {
                            escalationTrackerRef.current.trackMessageSent(msg.to, msg.from, Date.now());
                            // Simulate receiving message after a delay (in real scenario, agent would report back)
                            setTimeout(() => {
                                if (escalationTrackerRef.current) {
                                    escalationTrackerRef.current.trackMessageReceived(msg.to);
                                }
                            }, 2000);
                        }

                        // Phase 8: Trigger message flow animation
                        const fromNode = nodes.find(n => n.data.name === msg.from);
                        const toNode = nodes.find(n => n.data.name === msg.to);
                        if (fromNode && toNode) {
                            const edge = edges.find(e =>
                                (e.source === fromNode.id && e.target === toNode.id) ||
                                (e.source === toNode.id && e.target === fromNode.id) // bidirectional
                            );
                            if (edge) {
                                window.dispatchEvent(new CustomEvent('messageFlow', {
                                    detail: { edgeId: edge.id, from: msg.from, to: msg.to }
                                }));
                            }
                        }

                    } catch (error) {
                        console.error('[orchestration] Failed to send message:', error);
                    }
                } else {
                    // Broadcast message
                    addChatMessage({ ...msg, timestamp: Date.now() });
                }

                // Simulate realistic timing between messages (skip in step mode)
                if (!stepMode) {
                    await new Promise(resolve => setTimeout(resolve, 3000));
                }
            }

            // Orchestration complete - cleanup team if it was created
            if (window.__currentTeamId && agentNames.length >= 2) {
                console.log(`[orchestration] Stopping team ${window.__currentTeamId}...`);
                try {
                    await fetch(`http://127.0.0.1:5050/api/teams/${window.__currentTeamId}/stop`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' }
                    });
                    console.log(`[orchestration] ✓ Team stopped`);
                    window.__currentTeamId = null;
                } catch (error) {
                    console.error(`[orchestration] Failed to stop team:`, error.message);
                }
            }

            setIsOrchestrating(false);
            setStepMode(false);
            currentStepRef.current = 0;
        };

        orchestrateTeam();

        // Cleanup on unmount or stop
        return () => {
            // Stop team if orchestration is interrupted
            if (window.__currentTeamId) {
                fetch(`http://127.0.0.1:5050/api/teams/${window.__currentTeamId}/stop`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                }).catch(err => console.error('[orchestration] Cleanup failed:', err));
                window.__currentTeamId = null;
            }
        };
    }, [isOrchestrating, nodes, edges, isPaused, stepMode, setChatMessages, setNodes]);

    // Poll broker for agent status updates (continuous, not just during orchestration)
    useEffect(() => {
        const interval = setInterval(async () => {
            try {
                const agents = await agentService.listAgents({ status: 'online' });

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
                    const pending = await messageService.getPendingTickets(agentName);

                    if (pending.length > 0) {
                        console.log(`[ticket-poll] ${agentName} has ${pending.length} pending tickets`);

                        // Add pending tickets to chat (check seenTicketIds ref, not state)
                        for (const ticket of pending) {
                            if (!seenTicketIds.current.has(ticket.ticketId)) {
                                seenTicketIds.current.add(ticket.ticketId);

                                addChatMessage({
                                    from: ticket.originAgent,
                                    to: agentName,
                                    content: ticket.payload,
                                    timestamp: new Date(ticket.createdAt).getTime(),
                                    ticketId: ticket.ticketId,
                                    status: ticket.status
                                });
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
        // This effect is now replaced by real apiClient orchestration above
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
                addChatMessage({ ...mockConversations[messageIndex], timestamp: Date.now() });
                messageIndex++;
            }

            // Terminal output removed (legacy code)
            if (terminalIndex < mockTerminalCommands.length) {
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

    // Update header controls whenever relevant state changes
    useEffect(() => {
        if (setHeaderControls) {
            setHeaderControls(
                <CanvasHeader
                    isOrchestrating={isOrchestrating}
                    onStartStop={() => {
                        if (isOrchestrating) {
                            setIsOrchestrating(false);
                            setIsPaused(false);
                            setStepMode(false);
                            currentStepRef.current = 0;
                        } else {
                            // Reset and start orchestration
                            setChatMessages([]);
                            seenTicketIds.current.clear();
                            currentStepRef.current = 0;
                            setIsOrchestrating(true);
                        }
                    }}
                    canStartTeam={canStartTeam}
                    showChatPanel={showChatPanel}
                    onToggleChat={() => setShowChatPanel(!showChatPanel)}
                    showTeamPanel={showTeamPanel}
                    onToggleTeam={() => setShowTeamPanel(!showTeamPanel)}
                />
            );
        }
    }, [isOrchestrating, canStartTeam, showChatPanel, showTeamPanel, setHeaderControls]);

    return (
        <div className="w-full h-full flex" ref={reactFlowWrapper}>
            {/* Left Panel: Communication */}
            {showChatPanel && (
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
                    <ChatPanel messages={chatMessages} />
                ) : (
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {/* Phase 8: Performance Metrics Dashboard */}
                        <PerformanceMetrics
                            messageHistory={chatMessages}
                            activeAgents={nodes.filter(n => n.data.status === 'online').length}
                            loopDetector={loopDetectorRef.current}
                            escalationTracker={escalationTrackerRef.current}
                        />
                        <AgentDashboard />
                    </div>
                )}
                </aside>
            )}

            {/* Right Panel: Canvas */}
            <div className="flex-1 h-full relative bg-background">
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    onNodeContextMenu={onNodeContextMenu}
                    onNodeDoubleClick={onNodeDoubleClick}
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
                {showTeamPanel && (
                    <div className="absolute top-6 left-6 z-10">
                        <div className="flex flex-col bg-surface/80 backdrop-blur border border-border rounded-xl shadow-xl w-64 max-h-[calc(100vh-8rem)]">
                        {/* Fixed Header */}
                        <div className="p-4 pb-2 border-b border-border flex-shrink-0">
                            <h3 className="text-sm font-medium text-text-primary flex items-center justify-between">
                                Team Composition
                                {isAddingAgent && <Loader2 size={14} className="animate-spin text-accent-purple" />}
                            </h3>
                        </div>

                        {/* Scrollable Content */}
                        <div className="overflow-y-auto p-4 pt-2 flex flex-col gap-2 flex-1">
                            {/* Error Message */}
                            {operationError && (
                                <div className="px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-2">
                                    <AlertCircle size={14} className="text-red-500 mt-0.5 flex-shrink-0" />
                                    <p className="text-xs text-red-400">{operationError}</p>
                                </div>
                            )}

                            {/* Phase 7: Templates Button */}
                        <button
                            onClick={() => setShowTemplateLibrary(true)}
                            className="w-full px-3 py-2 bg-accent-purple hover:bg-purple-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 mb-2"
                            disabled={isAddingAgent}
                        >
                            <Library size={16} />
                            Team Templates
                        </button>

                        {/* Phase 8: Timeline Button */}
                        <button
                            onClick={() => setShowTimeline(true)}
                            className="w-full px-3 py-2 bg-accent-blue hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 mb-2"
                        >
                            <Clock size={16} />
                            Message Timeline
                        </button>

                        {/* Phase 9: GitHub Issues Button */}
                        <button
                            onClick={() => setShowGitHubIssues(true)}
                            className="w-full px-3 py-2 bg-accent-green hover:bg-green-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 mb-2"
                        >
                            <Github size={16} />
                            GitHub Issues
                        </button>

                        {/* Phase 9: Branch Manager Button */}
                        <button
                            onClick={() => setShowBranchManager(true)}
                            className="w-full px-3 py-2 bg-surface-hover hover:bg-surface border border-border text-text-primary rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 mb-2"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="6" y1="3" x2="6" y2="15"></line>
                                <circle cx="18" cy="6" r="3"></circle>
                                <circle cx="6" cy="18" r="3"></circle>
                                <path d="M18 9a9 9 0 0 1-9 9"></path>
                            </svg>
                            Branches
                        </button>

                        {/* Phase 9: Commit Queue Button */}
                        <button
                            onClick={() => setShowCommitQueue(true)}
                            className="w-full px-3 py-2 bg-surface-hover hover:bg-surface border border-border text-text-primary rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 mb-2"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="3"></circle>
                                <path d="M3 12h6m6 0h6M12 3v6m0 6v6"></path>
                            </svg>
                            Commit Queue
                        </button>

                        {/* Phase 2: Agent Library Button */}
                        <button
                            onClick={() => setShowAgentLibrary(true)}
                            className="w-full px-4 py-3 bg-accent-purple hover:bg-purple-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                        >
                            <Library size={18} />
                            Open Agent Library
                        </button>

                        {/* Agent count badge */}
                        <div className="bg-surface/60 border border-border p-3 rounded-lg text-center mt-2">
                            <div className="text-2xl font-bold text-text-primary">{nodes.length}</div>
                            <div className="text-xs text-text-secondary">Agents</div>
                        </div>
                        </div>
                    </div>
                    </div>
                )}

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
                                {/* Conditional menu option based on commMode */}
                                {(contextMenu.data.metadata?.commMode === 'headless' || contextMenu.data.commMode === 'headless') ? (
                                    <button
                                        onClick={() => {
                                            setChatAgent({ ...contextMenu.data, agentId: contextMenu.data.name });
                                            closeContextMenu();
                                        }}
                                        className="w-full text-left px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors flex items-center gap-2"
                                        role="menuitem"
                                    >
                                        <MessageSquare size={14} className="text-accent-purple" />
                                        Open Chat
                                    </button>
                                ) : (
                                    <button
                                        onClick={handleConnect}
                                        className="w-full text-left px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors flex items-center gap-2"
                                        role="menuitem"
                                    >
                                        <TerminalIcon size={14} className="text-green-500" />
                                        Connect Terminal
                                    </button>
                                )}
                                <button
                                    onClick={handleStart}
                                    className="w-full text-left px-4 py-2 text-sm text-green-400 hover:bg-zinc-800 hover:text-green-300 transition-colors flex items-center gap-2"
                                    role="menuitem"
                                >
                                    <span className="w-2 h-2 rounded-full bg-green-500"></span>
                                    Start Agent
                                </button>
                                <button
                                    onClick={handleStop}
                                    className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-zinc-800 hover:text-red-300 transition-colors flex items-center gap-2"
                                    role="menuitem"
                                >
                                    <span className="w-2 h-2 rounded-full bg-red-500"></span>
                                    Stop Agent
                                </button>
                                <button
                                    onClick={handleRestart}
                                    className="w-full text-left px-4 py-2 text-sm text-yellow-400 hover:bg-zinc-800 hover:text-yellow-300 transition-colors flex items-center gap-2"
                                    role="menuitem"
                                >
                                    <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                                    Restart Agent
                                </button>
                                <div className="border-t border-zinc-800 my-1"></div>
                                <button
                                    onClick={() => {
                                        setShowStageCommit(true, contextMenu.data.name);
                                        closeContextMenu();
                                    }}
                                    className="w-full text-left px-4 py-2 text-sm text-blue-400 hover:bg-zinc-800 transition-colors flex items-center gap-2"
                                    role="menuitem"
                                >
                                    <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                                    Stage Commit
                                </button>
                                <button
                                    onClick={() => {
                                        setShowCreatePR(true, contextMenu.data.name);
                                        closeContextMenu();
                                    }}
                                    className="w-full text-left px-4 py-2 text-sm text-accent-purple hover:bg-zinc-800 transition-colors flex items-center gap-2"
                                    role="menuitem"
                                >
                                    <span className="w-2 h-2 rounded-full bg-accent-purple"></span>
                                    Create Pull Request
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

                {/* Phase 6: Terminal Modal */}
                {terminalAgent && (
                    <TerminalModal
                        agentId={terminalAgent}
                        onClose={() => setTerminalAgent(null)}
                    />
                )}

                {/* Headless: Chat Modal */}
                {chatAgent && (
                    <AgentChatPanel
                        agent={chatAgent}
                        onClose={() => setChatAgent(null)}
                    />
                )}

                {/* Phase 7: Template Library Modal */}
                {showTemplateLibrary && (
                    <TemplateLibrary
                        onClose={() => setShowTemplateLibrary(false)}
                        onSelectTemplate={spawnTemplate}
                    />
                )}

                {/* Phase 8: Timeline Viewer Modal */}
                {showTimeline && (
                    <TimelineViewer
                        onClose={() => setShowTimeline(false)}
                    />
                )}

                {/* Phase 9: GitHub Issues Modal */}
                {showGitHubIssues && (
                    <GitHubIssues
                        onClose={() => setShowGitHubIssues(false)}
                        onSpawnTeam={async (issue) => {
                            console.log('[Canvas] Spawning team from issue:', issue);

                            // Generate team template from issue labels
                            const teamTemplate = generateTeamFromIssue(issue);
                            console.log('[Canvas] Generated team template:', teamTemplate);

                            // Close GitHub issues modal
                            setShowGitHubIssues(false);

                            // Spawn the team using existing spawnTemplate function
                            await spawnTemplate(teamTemplate);

                            // Enable status sync for this issue
                            const repoUrl = issue.repository_url;
                            const [owner, repo] = repoUrl.split('/').slice(-2);
                            statusSync.enable(owner, repo, issue.number);

                            // Notify GitHub of team spawn
                            await statusSync.notifyTeamSpawned(
                                teamTemplate.name,
                                teamTemplate.agents,
                                issue.number
                            );

                            // Add label to issue
                            await statusSync.updateIssueLabel('in-progress');

                            // Add system message to chat
                            addChatMessage({
                                from: 'System',
                                content: `🚀 Spawned team for GitHub issue #${issue.number}: "${issue.title}" (status sync enabled)`,
                                timestamp: Date.now()
                            });
                        }}
                    />
                )}

                {/* Phase 9: Create PR Dialog */}
                {showCreatePR && (
                    <CreatePRDialog
                        onClose={() => {
                            setShowCreatePR(false, null);
                        }}
                        agentName={prAgentName}
                    />
                )}

                {/* Phase 9: Branch Manager */}
                {showBranchManager && (
                    <BranchManager
                        onClose={() => setShowBranchManager(false)}
                    />
                )}

                {/* Phase 9: Commit Queue Viewer */}
                {showCommitQueue && (
                    <CommitQueueViewer
                        onClose={() => setShowCommitQueue(false)}
                    />
                )}

                {/* Phase 9: Stage Commit Dialog */}
                {showStageCommit && (
                    <StageCommitDialog
                        onClose={() => {
                            setShowStageCommit(false, null);
                        }}
                        agentName={stageCommitAgent}
                    />
                )}

                {/* Phase 2: Agent Library Panel */}
                {showAgentLibrary && (
                    <AgentLibraryPanel
                        onClose={() => setShowAgentLibrary(false)}
                        onAddAgent={(configId) => addNode(configId)}
                    />
                )}

                {/* Phase 5: Team Manager Panel */}
                {showTeamPanel && (
                    <div className="fixed inset-y-0 right-0 w-96 bg-white dark:bg-gray-900 shadow-xl z-50 overflow-y-auto">
                        <div className="flex justify-between items-center p-4 border-b">
                            <h2 className="text-lg font-semibold">Team Management</h2>
                            <button
                                onClick={() => setShowTeamPanel(false)}
                                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
                            >
                                ×
                            </button>
                        </div>
                        <div className="p-4">
                            <TeamManager projectId={null} />
                        </div>
                    </div>
                )}

                {/* Phase 8: Loop Detection Alerts */}
                <LoopAlertManager
                    loops={detectedLoops}
                    onDismiss={handleDismissLoop}
                    onBreakLoop={handleBreakLoop}
                />
            </div>
        </div>
    );
};
