#!/usr/bin/env node

import { parseArgs } from "node:util";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BROKER_BASE_URL = process.env.BRIDGE_BROKER_URL || "http://127.0.0.1:5050";
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_WAIT_MS = 25_000;
const POLL_INTERVAL_MS = 5_000;

// Track subscribed agents and their last known pending count
const subscriptions = new Map<string, { lastCount: number; interval?: NodeJS.Timeout }>();

interface SendOptions {
  agentId: string;
  payload: string;
  ticketId?: string;
  timeoutMs?: number;
  awaitResponse?: boolean;
  metadata?: Record<string, unknown>;
}

interface SendResponse {
  ticketId: string;
  status: string;
  waitEndpoint?: string;
}

interface BrokerReply {
  ticketId: string;
  status: string;
  response?: {
    payload: unknown;
    metadata?: Record<string, unknown>;
    at?: string;
  };
}

interface AwaitOptions {
  ticketId: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
}

interface PostReplyOptions {
  ticketId: string;
  payload: unknown;
  metadata?: Record<string, unknown>;
  status?: string;
}

async function brokerRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const url = `${BROKER_BASE_URL}${path}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });
  return response;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await brokerRequest(path, {
    method: "POST",
    body: JSON.stringify(body ?? {}),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Broker POST ${path} failed (${response.status}): ${errorText}`);
  }
  return (await response.json()) as T;
}

async function postJsonAllowEmpty(path: string, body: unknown): Promise<Response> {
  const response = await brokerRequest(path, {
    method: "POST",
    body: JSON.stringify(body ?? {}),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Broker POST ${path} failed (${response.status}): ${errorText}`);
  }
  return response;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await brokerRequest(path, { method: "GET" });
  if (response.status === 204) {
    throw new Error("No reply available (204)");
  }
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Broker GET ${path} failed (${response.status}): ${errorText}`);
  }
  return (await response.json()) as T;
}

async function sendMessage(options: SendOptions): Promise<SendResponse> {
  const ticketId = options.ticketId ?? randomUUID();
  const metadata = options.metadata ?? {};

  // Auto-populate origin if not provided
  if (!metadata.origin && process.env.AGENT_ID) {
    metadata.origin = process.env.AGENT_ID;
  }

  const result = await postJson<SendResponse>(`/agents/${encodeURIComponent(options.agentId)}/send`, {
    ticketId,
    payload: options.payload,
    metadata,
    expectReply: options.awaitResponse === true,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  });
  return result;
}

async function awaitReply({ ticketId, timeoutMs, pollIntervalMs }: AwaitOptions): Promise<BrokerReply> {
  const effectiveTimeout = timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const endAt = Date.now() + effectiveTimeout;
  const interval = pollIntervalMs ?? Math.min(5_000, effectiveTimeout);

  while (Date.now() <= endAt) {
    const remainingMs = endAt - Date.now();
    const wait = Math.min(interval, remainingMs, DEFAULT_WAIT_MS);
    try {
      const reply = await getJson<BrokerReply>(`/replies/${encodeURIComponent(ticketId)}?waitMs=${wait}`);
      return reply;
    } catch (error: any) {
      const message = error?.message ?? "unknown error";
      if (!/No reply available/.test(message)) {
        throw error;
      }
      // No reply yet, continue loop if time remains.
    }
  }

  throw new Error(`Timeout waiting for reply to ticket ${ticketId}`);
}

async function listAgents(params: { type?: string; status?: string } = {}): Promise<any[]> {
  const query = new URLSearchParams();
  if (params.type) query.set("type", params.type);
  if (params.status) query.set("status", params.status);
  const path = `/agents${query.toString() ? `?${query.toString()}` : ""}`;
  const agents = await getJson<any[]>(path);
  return agents;
}

async function postReply({ ticketId, payload, metadata, status }: PostReplyOptions): Promise<void> {
  if (!ticketId) {
    throw new Error("ticketId is required");
  }
  await postJsonAllowEmpty(`/replies`, {
    ticketId,
    payload,
    metadata: metadata ?? {},
    status,
  });
}

function formatCoWorkers(agents: any[]): string {
  if (agents.length === 0) {
    return "No registered co-workers.";
  }
  const lines = agents.map((agent) => {
    const meta = agent.metadata ?? {};
    const cwd = typeof meta.cwd === "string" ? `cwd=${meta.cwd}` : "";
    const capabilities = Array.isArray(meta.capabilities) ? meta.capabilities : [];
    const extra = [cwd, ...capabilities.map((cap: string) => `cap:${cap}`)]
      .filter(Boolean)
      .join(" ");
    return `${agent.agentId} [${agent.type ?? "unknown"}] ${agent.status ?? "unknown"}${extra ? ` — ${extra}` : ""}`;
  });
  return ["Registered co-workers:", ...lines].join("\n");
}

const server = new McpServer(
  {
    name: "kokino-mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: { listChanged: true },
      resources: { subscribe: true, listChanged: true },
      logging: {},
    },
  }
);

server.tool(
  "send_message",
  "Queue a message for a target agent. Returns a 'ticketId' immediately (delivery receipt). The message will be injected into the target agent's terminal context asynchronously.",
  {
    agentId: z.string().min(1).describe("Target agent handle (as registered with the broker)."),
    payload: z.string().min(1).describe("Message to deliver."),
    ticketId: z.string().optional().describe("Optional correlation ID. If omitted, a UUID will be generated."),
    timeoutMs: z.number().int().positive().optional().describe("How long the broker should wait for a reply before marking the ticket as timeout (default 60000)."),
    awaitResponse: z.boolean().optional().describe("DEPRECATED: If true, wait up to 25s for a reply. NOT RECOMMENDED as it causes deadlocks. Prefer async fire-and-forget."),
    metadata: z.record(z.any()).optional().describe("Additional metadata to attach to the ticket (JSON object)."),
  },
  async ({ agentId, payload, ticketId, timeoutMs, awaitResponse, metadata }) => {
    try {
      const response = await sendMessage({
        agentId: agentId as string,
        payload: payload as string,
        ticketId: ticketId as string | undefined,
        timeoutMs: timeoutMs as number | undefined,
        awaitResponse: awaitResponse === true,
        metadata: metadata as Record<string, any> | undefined,
      });

      if (awaitResponse !== true) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response, null, 2),
            },
          ],
        };
      }

      const reply = await awaitReply({ ticketId: response.ticketId, timeoutMs: timeoutMs as number | undefined });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ ticketId: response.ticketId, reply }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error.message ?? error}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.tool(
  "await_reply",
  "Wait for a reply associated with a ticket.",
  {
    ticketId: z.string().min(1).describe("Ticket/correlation ID returned from send_message."),
    timeoutMs: z.number().int().positive().optional().describe("Maximum wait in ms (defaults to 60000)."),
    pollIntervalMs: z.number().int().positive().optional().describe("Interval for polling when SSE is unavailable."),
  },
  async ({ ticketId, timeoutMs, pollIntervalMs }) => {
    try {
      const reply = await awaitReply({ ticketId, timeoutMs, pollIntervalMs });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(reply, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error.message ?? error}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.tool(
  "list_agents",
  "List all registered agents (handles, types, metadata).",
  {
    type: z.string().optional().describe("Optional filter by agent type."),
    status: z.string().optional().describe("Optional filter by status (online/offline)."),
  },
  async ({ type, status }) => {
    try {
      const agents = await listAgents({ type, status });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(agents, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error.message ?? error}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.tool(
  "co_workers",
  "Summarise currently registered co-workers (handles, types, cwd).",
  {},
  async () => {
    try {
      const agents = await listAgents();
      return {
        content: [
          {
            type: "text",
            text: formatCoWorkers(agents),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error.message ?? error}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.tool(
  "register_agent",
  "Manually register an agent handle with the broker (primarily for wrappers).",
  {
    agentId: z.string().min(1).describe("Agent handle to register."),
    type: z.string().optional().describe("Agent type (e.g., codex, claude-code)."),
    metadata: z.record(z.any()).optional().describe("Metadata such as cwd, paneId, capabilities."),
    heartbeatIntervalMs: z.number().int().positive().optional().describe("Expected heartbeat interval in ms."),
  },
  async ({ agentId, type, metadata, heartbeatIntervalMs }) => {
    try {
      const result = await postJson<Record<string, unknown>>(`/agents/register`, {
        agentId,
        type,
        metadata,
        heartbeatIntervalMs,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error.message ?? error}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.tool(
  "post_reply",
  "Post a reply for an existing ticket via the broker (useful for agents running the bridge MCP).",
  {
    ticketId: z.string().min(1).describe("Ticket/correlation ID to resolve."),
    payload: z.any().describe("Reply payload (string or JSON serialisable value)."),
    metadata: z.record(z.any()).optional().describe("Optional metadata (e.g., agent handle, status)."),
    status: z.string().optional().describe("Override ticket status (default 'responded')."),
  },
  async ({ ticketId, payload, metadata, status }) => {
    try {
      await postReply({ ticketId, payload, metadata, status });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ ticketId, status: status ?? "responded" }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error.message ?? error}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Register resources for each agent dynamically
async function setupAgentResources() {
  const agents = await listAgents();

  for (const agent of agents) {
    const uri = `pending-messages://${agent.agentId}`;

    server.resource(
      `pending-messages-${agent.agentId}`,
      uri,
      {
        description: `Messages waiting for agent ${agent.agentId}`,
        mimeType: "application/json",
      },
      async () => {
        try {
          const response = await brokerRequest(`/agents/${encodeURIComponent(agent.agentId)}/tickets/pending`);
          if (!response.ok) {
            throw new Error(`Failed to fetch pending tickets: ${response.status}`);
          }
          const tickets = await response.json();

          return {
            contents: [
              {
                uri,
                mimeType: "application/json",
                text: JSON.stringify(tickets, null, 2),
              },
            ],
          };
        } catch (error: any) {
          throw new Error(`Failed to read pending messages: ${error.message}`);
        }
      }
    );

    // Start polling for this agent
    if (!subscriptions.has(agent.agentId)) {
      subscriptions.set(agent.agentId, { lastCount: 0 });
    }

    const sub = subscriptions.get(agent.agentId)!;

    // Clear any existing polling interval
    if (sub.interval) {
      clearInterval(sub.interval);
    }

    // Start polling for changes
    sub.interval = setInterval(async () => {
      try {
        const response = await brokerRequest(`/agents/${encodeURIComponent(agent.agentId)}/tickets/pending`);
        if (!response.ok) return;

        const tickets = await response.json();
        const currentCount = Array.isArray(tickets) ? tickets.length : 0;

        // If count changed, notify
        if (currentCount !== sub.lastCount && currentCount > 0) {
          sub.lastCount = currentCount;
          await server.server.sendResourceUpdated({ uri });
        }
      } catch (error) {
        // Silently ignore polling errors
      }
    }, POLL_INTERVAL_MS);
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      "broker-url": { type: "string" },
    },
  });

  if (values["broker-url"]) {
    process.env.BRIDGE_BROKER_URL = values["broker-url"] as string;
  }

  // Setup agent resources BEFORE connecting
  await setupAgentResources();

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
