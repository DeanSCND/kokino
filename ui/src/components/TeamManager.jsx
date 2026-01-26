/**
 * TeamManager Component
 * Phase 5: Team Lifecycle Management UI
 *
 * Provides UI for managing teams - create, start, stop, delete
 */

import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/components/ui/use-toast';
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
} from 'lucide-react';
import apiClient from '@/services/api-client';

export function TeamManager({ projectId = null }) {
  const [teams, setTeams] = useState([]);
  const [teamStatus, setTeamStatus] = useState({});
  const [availableAgents, setAvailableAgents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState(null);
  const [selectedTeamRuns, setSelectedTeamRuns] = useState(null);
  const [runsDialogOpen, setRunsDialogOpen] = useState(false);
  const { toast } = useToast();

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

    // Refresh team status every 5 seconds
    const interval = setInterval(() => {
      refreshTeamStatus();
    }, 5000);

    return () => clearInterval(interval);
  }, [projectId]);

  const loadTeams = async () => {
    try {
      const params = projectId ? { projectId, withStatus: true } : { withStatus: true };
      const response = await apiClient.get('/api/teams', { params });
      setTeams(response.data.teams);

      // Extract status from teams
      const statusMap = {};
      response.data.teams.forEach(team => {
        if (team.status) {
          statusMap[team.id] = team.status;
        }
      });
      setTeamStatus(statusMap);
    } catch (error) {
      console.error('Failed to load teams:', error);
      toast({
        title: 'Error',
        description: 'Failed to load teams',
        variant: 'destructive',
      });
    }
  };

  const loadAvailableAgents = async () => {
    try {
      const params = projectId ? { projectId } : {};
      const response = await apiClient.get('/api/agents', { params });
      setAvailableAgents(response.data.configs || []);
    } catch (error) {
      console.error('Failed to load agent configs:', error);
    }
  };

  const refreshTeamStatus = async () => {
    if (teams.length === 0) return;

    try {
      const statusPromises = teams.map(team =>
        apiClient.get(`/api/teams/${team.id}/status`)
          .then(res => ({ id: team.id, status: res.data }))
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

  const createTeam = async () => {
    if (!newTeam.name || newTeam.agents.length === 0) {
      toast({
        title: 'Validation Error',
        description: 'Team name and at least one agent are required',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const teamData = {
        ...newTeam,
        projectId,
      };

      const response = await apiClient.post('/api/teams', teamData);

      toast({
        title: 'Success',
        description: `Team "${response.data.team.name}" created successfully`,
      });

      setCreateDialogOpen(false);
      setNewTeam({ name: '', description: '', agents: [] });
      await loadTeams();
    } catch (error) {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to create team',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const updateTeam = async () => {
    if (!editingTeam || !editingTeam.name || editingTeam.agents.length === 0) {
      toast({
        title: 'Validation Error',
        description: 'Team name and at least one agent are required',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const response = await apiClient.put(`/api/teams/${editingTeam.id}`, {
        name: editingTeam.name,
        description: editingTeam.description,
        agents: editingTeam.agents,
      });

      toast({
        title: 'Success',
        description: `Team "${response.data.team.name}" updated successfully`,
      });

      setEditingTeam(null);
      await loadTeams();
    } catch (error) {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to update team',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const startTeam = async (teamId) => {
    setLoading(true);
    try {
      const response = await apiClient.post(`/api/teams/${teamId}/start`);

      toast({
        title: 'Success',
        description: response.data.message,
      });

      await loadTeams();
    } catch (error) {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to start team',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const stopTeam = async (teamId) => {
    setLoading(true);
    try {
      const response = await apiClient.post(`/api/teams/${teamId}/stop`);

      toast({
        title: 'Success',
        description: response.data.message,
      });

      await loadTeams();
    } catch (error) {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to stop team',
        variant: 'destructive',
      });
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
      await apiClient.delete(`/api/teams/${teamId}`);

      toast({
        title: 'Success',
        description: `Team "${teamName}" deleted successfully`,
      });

      await loadTeams();
    } catch (error) {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to delete team',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const loadTeamRuns = async (teamId) => {
    try {
      const response = await apiClient.get(`/api/teams/${teamId}/runs`);
      setSelectedTeamRuns(response.data);
      setRunsDialogOpen(true);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load team runs',
        variant: 'destructive',
      });
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'running':
        return 'bg-green-500';
      case 'stopped':
        return 'bg-gray-500';
      case 'error':
        return 'bg-red-500';
      case 'never_run':
        return 'bg-blue-500';
      default:
        return 'bg-gray-400';
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
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Users className="w-6 h-6" />
          Team Management
        </h2>
        <Button
          onClick={() => setCreateDialogOpen(true)}
          disabled={loading}
        >
          <Plus className="w-4 h-4 mr-2" />
          New Team
        </Button>
      </div>

      {teams.length === 0 ? (
        <Card>
          <CardContent className="text-center py-8">
            <Users className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">No teams configured yet</p>
            <Button
              onClick={() => setCreateDialogOpen(true)}
              variant="outline"
              className="mt-4"
            >
              Create Your First Team
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {teams.map((team) => {
            const status = teamStatus[team.id] || { status: 'unknown' };
            const isRunning = status.status === 'running';

            return (
              <Card key={team.id}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg">{team.name}</CardTitle>
                      <CardDescription className="mt-1">
                        {team.description || 'No description'}
                      </CardDescription>
                    </div>
                    <Badge
                      className={`${getStatusColor(status.status)} text-white`}
                    >
                      {getStatusIcon(status.status)}
                      <span className="ml-1">{status.status}</span>
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-sm text-muted-foreground">
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
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => stopTeam(team.id)}
                        disabled={loading}
                      >
                        <Square className="w-4 h-4 mr-1" />
                        Stop
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => startTeam(team.id)}
                        disabled={loading}
                      >
                        <Play className="w-4 h-4 mr-1" />
                        Start
                      </Button>
                    )}

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingTeam(team)}
                      disabled={loading || isRunning}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => loadTeamRuns(team.id)}
                      disabled={loading}
                    >
                      <History className="w-4 h-4" />
                    </Button>

                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteTeam(team.id, team.name)}
                      disabled={loading || isRunning}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create/Edit Team Dialog */}
      <Dialog open={createDialogOpen || !!editingTeam} onOpenChange={(open) => {
        if (!open) {
          setCreateDialogOpen(false);
          setEditingTeam(null);
          setNewTeam({ name: '', description: '', agents: [] });
        }
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingTeam ? 'Edit Team' : 'Create New Team'}
            </DialogTitle>
            <DialogDescription>
              Configure a team of agents that can be started and stopped together
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="team-name">Team Name</Label>
              <Input
                id="team-name"
                value={editingTeam?.name || newTeam.name}
                onChange={(e) => {
                  if (editingTeam) {
                    setEditingTeam({ ...editingTeam, name: e.target.value });
                  } else {
                    setNewTeam({ ...newTeam, name: e.target.value });
                  }
                }}
                placeholder="e.g., Development Team"
              />
            </div>

            <div>
              <Label htmlFor="team-description">Description (Optional)</Label>
              <Textarea
                id="team-description"
                value={editingTeam?.description || newTeam.description}
                onChange={(e) => {
                  if (editingTeam) {
                    setEditingTeam({ ...editingTeam, description: e.target.value });
                  } else {
                    setNewTeam({ ...newTeam, description: e.target.value });
                  }
                }}
                placeholder="Describe the team's purpose..."
                rows={3}
              />
            </div>

            <div>
              <Label>Select Agents</Label>
              <p className="text-sm text-muted-foreground mb-2">
                Choose which agent configurations to include in this team
              </p>
              <ScrollArea className="h-48 border rounded-md p-2">
                <div className="space-y-2">
                  {availableAgents.map((agent) => (
                    <label
                      key={agent.id}
                      className="flex items-center space-x-2 cursor-pointer hover:bg-muted p-2 rounded"
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
                        className="rounded"
                      />
                      <div className="flex-1">
                        <p className="font-medium">{agent.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {agent.role || 'No role'} • {agent.cli_type || 'claude-code'}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </ScrollArea>
              {(editingTeam?.agents?.length || newTeam.agents.length) > 0 && (
                <p className="text-sm text-muted-foreground mt-2">
                  {editingTeam?.agents?.length || newTeam.agents.length} agent(s) selected
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCreateDialogOpen(false);
                setEditingTeam(null);
                setNewTeam({ name: '', description: '', agents: [] });
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={editingTeam ? updateTeam : createTeam}
              disabled={loading}
            >
              {loading && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
              {editingTeam ? 'Update Team' : 'Create Team'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Run History Dialog */}
      <Dialog open={runsDialogOpen} onOpenChange={setRunsDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Team Run History</DialogTitle>
            <DialogDescription>
              {selectedTeamRuns?.teamName}
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="h-96">
            {selectedTeamRuns?.runs?.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No runs recorded for this team
              </p>
            ) : (
              <div className="space-y-2">
                {selectedTeamRuns?.runs?.map((run) => (
                  <Card key={run.runId}>
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium">Run ID: {run.runId}</p>
                          <p className="text-sm text-muted-foreground">
                            Started: {new Date(run.startedAt).toLocaleString()}
                          </p>
                          {run.stoppedAt && (
                            <p className="text-sm text-muted-foreground">
                              Stopped: {new Date(run.stoppedAt).toLocaleString()}
                            </p>
                          )}
                          {run.errorMessage && (
                            <p className="text-sm text-red-500 mt-1">
                              Error: {run.errorMessage}
                            </p>
                          )}
                        </div>
                        <Badge className={getStatusColor(run.status)}>
                          {run.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-2">
                        {run.agentCount} agent(s)
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRunsDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default TeamManager;