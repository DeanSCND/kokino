/**
 * TeamManager Component
 * Phase 5: Team Lifecycle Management UI
 *
 * Provides UI for managing teams - create, start, stop, delete
 */

import React, { useState, useEffect } from 'react';
import {
  Play,
  Square,
  Trash2,
  Plus,
  Users,
  Clock,
  AlertCircle,
  RefreshCw,
  Edit,
  History,
  X,
  CheckCircle2,
} from 'lucide-react';
import apiClient from '../services/api-client';
import client from '../services/api/client';

export function TeamManager({ projectId = null }) {
  const [teams, setTeams] = useState([]);
  const [teamStatus, setTeamStatus] = useState({});
  const [availableAgents, setAvailableAgents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState(null);
  const [selectedTeamRuns, setSelectedTeamRuns] = useState(null);
  const [runsDialogOpen, setRunsDialogOpen] = useState(false);
  const [error, setError] = useState(null);

  // New team form state
  const [newTeam, setNewTeam] = useState({
    name: '',
    description: '',
    agents: [],
  });

  // Load teams and agent configs
  useEffect(() => {
    loadTeams();
    loadAvailableAgents();
  }, [projectId]);

  // Refresh team status every 5 seconds when teams change
  useEffect(() => {
    if (teams.length === 0) return;

    const interval = setInterval(() => {
      refreshTeamStatus();
    }, 5000);

    return () => clearInterval(interval);
  }, [teams]);

  const loadTeams = async () => {
    try {
      const params = new URLSearchParams(projectId ? { projectId, withStatus: 'true' } : { withStatus: 'true' });
      const data = await client.get(`/api/teams?${params}`);

      setTeams(data.teams || []);

      // Extract status from teams
      const statusMap = {};
      (data.teams || []).forEach(team => {
        if (team.status) {
          statusMap[team.id] = team.status;
        }
      });
      setTeamStatus(statusMap);
    } catch (error) {
      console.error('Failed to load teams:', error);
      showError('Failed to load teams');
    }
  };

  const loadAvailableAgents = async () => {
    try {
      const params = new URLSearchParams(projectId ? { projectId } : {});
      const data = await client.get(`/api/agents?${params}`);

      // /api/agents returns { configs: [...] }
      setAvailableAgents(data.configs || []);
    } catch (error) {
      console.error('Failed to load agent configs:', error);
    }
  };

  const refreshTeamStatus = async () => {
    if (teams.length === 0) return;

    try {
      const statusPromises = teams.map(team =>
        client.get(`/api/teams/${team.id}/status`)
          .then(status => ({ id: team.id, status }))
          .catch(() => ({ id: team.id, status: { status: 'error' } }))
      );

      const statuses = await Promise.all(statusPromises);
      const statusMap = {};
      statuses.forEach(({ id, status }) => {
        statusMap[id] = status;
      });
      setTeamStatus(statusMap);
    } catch (error) {
      console.error('Failed to refresh team status:', error);
    }
  };

  const showError = (message) => {
    setError(message);
    setTimeout(() => setError(null), 5000);
  };

  const showSuccess = (message) => {
    // Use a simple success state or console log for now
    console.log('Success:', message);
  };

  const createTeam = async () => {
    if (!newTeam.name || newTeam.agents.length === 0) {
      showError('Team name and at least one agent are required');
      return;
    }

    setLoading(true);
    try {
      const teamData = {
        ...newTeam,
        projectId,
      };

      const data = await client.post('/api/teams', teamData);

      showSuccess(`Team "${data.team.name}" created successfully`);

      setCreateDialogOpen(false);
      setNewTeam({ name: '', description: '', agents: [] });
      await loadTeams();
    } catch (error) {
      showError(error.message || 'Failed to create team');
    } finally {
      setLoading(false);
    }
  };

  const updateTeam = async () => {
    if (!editingTeam || !editingTeam.name || editingTeam.agents.length === 0) {
      showError('Team name and at least one agent are required');
      return;
    }

    setLoading(true);
    try {
      const data = await client.put(`/api/teams/${editingTeam.id}`, {
        name: editingTeam.name,
        description: editingTeam.description,
        agents: editingTeam.agents,
      });

      showSuccess(`Team "${data.team.name}" updated successfully`);

      setEditingTeam(null);
      await loadTeams();
    } catch (error) {
      showError(error.message || 'Failed to update team');
    } finally {
      setLoading(false);
    }
  };

  const startTeam = async (teamId) => {
    setLoading(true);
    try {
      const data = await client.post(`/api/teams/${teamId}/start`);

      showSuccess(data.message);

      await loadTeams();
    } catch (error) {
      showError(error.message || 'Failed to start team');
    } finally {
      setLoading(false);
    }
  };

  const stopTeam = async (teamId) => {
    setLoading(true);
    try {
      const data = await client.post(`/api/teams/${teamId}/stop`);

      showSuccess(data.message);

      await loadTeams();
    } catch (error) {
      showError(error.message || 'Failed to stop team');
    } finally {
      setLoading(false);
    }
  };

  const deleteTeam = async (teamId, teamName) => {
    if (!window.confirm(`Are you sure you want to delete team "${teamName}"?`)) {
      return;
    }

    setLoading(true);
    try {
      await client.delete(`/api/teams/${teamId}`);

      showSuccess(`Team "${teamName}" deleted successfully`);

      await loadTeams();
    } catch (error) {
      showError(error.message || 'Failed to delete team');
    } finally {
      setLoading(false);
    }
  };

  const loadTeamRuns = async (teamId) => {
    try {
      const data = await client.get(`/api/teams/${teamId}/runs`);

      setSelectedTeamRuns(data);
      setRunsDialogOpen(true);
    } catch (error) {
      showError('Failed to load team runs');
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'running':
        return '#10b981'; // green
      case 'stopped':
        return '#6b7280'; // gray
      case 'error':
        return '#ef4444'; // red
      case 'never_run':
        return '#3b82f6'; // blue
      default:
        return '#9ca3af'; // gray-400
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'running':
        return <Play className="w-4 h-4" />;
      case 'stopped':
        return <Square className="w-4 h-4" />;
      case 'error':
        return <AlertCircle className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Users className="w-5 h-5" />
          Team Management
        </h2>
        <button
          onClick={() => setCreateDialogOpen(true)}
          disabled={loading}
          className="px-3 py-1.5 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          New Team
        </button>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      {/* Teams Grid */}
      {teams.length === 0 ? (
        <div className="border rounded-lg p-8 text-center">
          <Users className="w-12 h-12 mx-auto mb-4 text-gray-400" />
          <p className="text-gray-500 mb-4">No teams configured yet</p>
          <button
            onClick={() => setCreateDialogOpen(true)}
            className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Create Your First Team
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {teams.map((team) => {
            const status = teamStatus[team.id] || { status: 'unknown' };
            const isRunning = status.status === 'running';

            return (
              <div key={team.id} className="border rounded-lg shadow-sm bg-white">
                <div className="p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="font-semibold text-lg">{team.name}</h3>
                      <p className="text-sm text-gray-600 mt-1">
                        {team.description || 'No description'}
                      </p>
                    </div>
                    <span
                      className="px-2 py-1 text-xs font-medium rounded-full text-white flex items-center gap-1"
                      style={{ backgroundColor: getStatusColor(status.status) }}
                    >
                      {getStatusIcon(status.status)}
                      <span>{status.status}</span>
                    </span>
                  </div>

                  <div className="text-sm text-gray-500 mb-3">
                    <p>{team.agents?.length || 0} agents configured</p>
                    {status.startedAt && (
                      <p className="mt-1">
                        Started: {new Date(status.startedAt).toLocaleString()}
                      </p>
                    )}
                    {status.errorMessage && (
                      <p className="mt-1 text-red-500">
                        Error: {status.errorMessage}
                      </p>
                    )}
                  </div>

                  <div className="flex gap-2">
                    {isRunning ? (
                      <button
                        onClick={() => stopTeam(team.id)}
                        disabled={loading}
                        className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50 flex items-center gap-1"
                      >
                        <Square className="w-4 h-4" />
                        Stop
                      </button>
                    ) : (
                      <button
                        onClick={() => startTeam(team.id)}
                        disabled={loading}
                        className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50 flex items-center gap-1"
                      >
                        <Play className="w-4 h-4" />
                        Start
                      </button>
                    )}

                    <button
                      onClick={() => setEditingTeam(team)}
                      disabled={loading || isRunning}
                      className="px-3 py-1 border rounded hover:bg-gray-50 disabled:opacity-50"
                    >
                      <Edit className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => loadTeamRuns(team.id)}
                      disabled={loading}
                      className="px-3 py-1 border rounded hover:bg-gray-50 disabled:opacity-50"
                    >
                      <History className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => deleteTeam(team.id, team.name)}
                      disabled={loading || isRunning}
                      className="px-3 py-1 border border-red-200 text-red-600 rounded hover:bg-red-50 disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Team Dialog */}
      {(createDialogOpen || editingTeam) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">
                  {editingTeam ? 'Edit Team' : 'Create New Team'}
                </h2>
                <button
                  onClick={() => {
                    setCreateDialogOpen(false);
                    setEditingTeam(null);
                    setNewTeam({ name: '', description: '', agents: [] });
                  }}
                  className="p-1 hover:bg-gray-100 rounded"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Team Name
                  </label>
                  <input
                    type="text"
                    value={editingTeam?.name || newTeam.name}
                    onChange={(e) => {
                      if (editingTeam) {
                        setEditingTeam({ ...editingTeam, name: e.target.value });
                      } else {
                        setNewTeam({ ...newTeam, name: e.target.value });
                      }
                    }}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., Development Team"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description (Optional)
                  </label>
                  <textarea
                    value={editingTeam?.description || newTeam.description}
                    onChange={(e) => {
                      if (editingTeam) {
                        setEditingTeam({ ...editingTeam, description: e.target.value });
                      } else {
                        setNewTeam({ ...newTeam, description: e.target.value });
                      }
                    }}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Describe the team's purpose..."
                    rows={3}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Select Agents
                  </label>
                  <p className="text-sm text-gray-500 mb-2">
                    Choose which agent configurations to include in this team
                  </p>
                  <div className="border rounded-md max-h-48 overflow-y-auto p-2">
                    {availableAgents.map((agent) => (
                      <label
                        key={agent.id}
                        className="flex items-start space-x-2 p-2 hover:bg-gray-50 rounded cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={
                            editingTeam
                              ? editingTeam.agents?.includes(agent.id)
                              : newTeam.agents.includes(agent.id)
                          }
                          onChange={(e) => {
                            const isChecked = e.target.checked;
                            if (editingTeam) {
                              const agents = isChecked
                                ? [...(editingTeam.agents || []), agent.id]
                                : (editingTeam.agents || []).filter((id) => id !== agent.id);
                              setEditingTeam({ ...editingTeam, agents });
                            } else {
                              const agents = isChecked
                                ? [...newTeam.agents, agent.id]
                                : newTeam.agents.filter((id) => id !== agent.id);
                              setNewTeam({ ...newTeam, agents });
                            }
                          }}
                          className="mt-1"
                        />
                        <div className="flex-1">
                          <p className="font-medium">{agent.name}</p>
                          <p className="text-sm text-gray-500">
                            {agent.role || 'No role'} • {agent.cli_type || 'claude-code'}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                  {(editingTeam?.agents?.length || newTeam.agents.length) > 0 && (
                    <p className="text-sm text-gray-500 mt-2">
                      {editingTeam?.agents?.length || newTeam.agents.length} agent(s) selected
                    </p>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => {
                    setCreateDialogOpen(false);
                    setEditingTeam(null);
                    setNewTeam({ name: '', description: '', agents: [] });
                  }}
                  className="px-4 py-2 border rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={editingTeam ? updateTeam : createTeam}
                  disabled={loading}
                  className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 flex items-center gap-2"
                >
                  {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
                  {editingTeam ? 'Update Team' : 'Create Team'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Run History Dialog */}
      {runsDialogOpen && selectedTeamRuns && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h2 className="text-xl font-semibold">Team Run History</h2>
                  <p className="text-sm text-gray-500">{selectedTeamRuns.teamName}</p>
                </div>
                <button
                  onClick={() => {
                    setRunsDialogOpen(false);
                    setSelectedTeamRuns(null);
                  }}
                  className="p-1 hover:bg-gray-100 rounded"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto">
                {selectedTeamRuns.runs?.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">
                    No runs recorded for this team
                  </p>
                ) : (
                  selectedTeamRuns.runs?.map((run) => (
                    <div key={run.runId} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium text-sm">Run ID: {run.runId}</p>
                          <p className="text-sm text-gray-600">
                            Started: {new Date(run.startedAt).toLocaleString()}
                          </p>
                          {run.stoppedAt && (
                            <p className="text-sm text-gray-600">
                              Stopped: {new Date(run.stoppedAt).toLocaleString()}
                            </p>
                          )}
                          {run.errorMessage && (
                            <p className="text-sm text-red-500 mt-1">
                              Error: {run.errorMessage}
                            </p>
                          )}
                          <p className="text-sm text-gray-500 mt-1">
                            {run.agentCount} agent(s)
                          </p>
                        </div>
                        <span
                          className="px-2 py-1 text-xs font-medium rounded-full text-white"
                          style={{ backgroundColor: getStatusColor(run.status) }}
                        >
                          {run.status}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="flex justify-end mt-4">
                <button
                  onClick={() => {
                    setRunsDialogOpen(false);
                    setSelectedTeamRuns(null);
                  }}
                  className="px-4 py-2 border rounded-md hover:bg-gray-50"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TeamManager;