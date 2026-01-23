#!/usr/bin/env node
// Mock agent runner - polls broker for tasks and auto-responds
// Usage: node mock-agent.js <agentName> <role>

import fetch from 'node-fetch';

const BROKER_URL = process.env.BROKER_URL || 'http://127.0.0.1:5050';
const AGENT_NAME = process.argv[2] || 'UnnamedAgent';
const AGENT_ROLE = process.argv[3] || 'Developer';
const POLL_INTERVAL = 2000; // Poll every 2 seconds

console.log(`[${AGENT_NAME}] Starting mock agent...`);
console.log(`[${AGENT_NAME}] Role: ${AGENT_ROLE}`);
console.log(`[${AGENT_NAME}] Broker: ${BROKER_URL}`);

let isRunning = true;

// Register with broker
async function register() {
    try {
        const response = await fetch(`${BROKER_URL}/agents/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                agentId: AGENT_NAME,
                type: 'mock-agent',
                metadata: { role: AGENT_ROLE, pid: process.pid },
                heartbeatIntervalMs: 30000
            })
        });

        if (response.ok) {
            console.log(`[${AGENT_NAME}] ✓ Registered with broker`);
            return true;
        } else {
            const error = await response.text();
            console.error(`[${AGENT_NAME}] ✗ Registration failed:`, error);
            return false;
        }
    } catch (error) {
        console.error(`[${AGENT_NAME}] ✗ Registration error:`, error.message);
        return false;
    }
}

// Send heartbeat
async function heartbeat() {
    try {
        await fetch(`${BROKER_URL}/agents/${AGENT_NAME}/heartbeat`, {
            method: 'POST'
        });
    } catch (error) {
        // Silent fail on heartbeat
    }
}

// Poll for pending tickets
async function pollTickets() {
    try {
        const response = await fetch(`${BROKER_URL}/agents/${AGENT_NAME}/tickets/pending`);
        if (!response.ok) return [];

        const tickets = await response.json();
        return tickets;
    } catch (error) {
        return [];
    }
}

// Process a ticket and generate a response
function generateResponse(ticket) {
    const { payload } = ticket;
    const content = payload?.content || payload?.message || 'unknown task';

    // Simple auto-responses based on content
    if (content.toLowerCase().includes('help')) {
        return `[${AGENT_NAME}] Sure, I can help with that! I'm working on it now.`;
    } else if (content.toLowerCase().includes('hi ')) {
        return `[${AGENT_NAME}] Hello! I'm ${AGENT_ROLE}, ready to assist.`;
    } else if (content.toLowerCase().includes('task completed')) {
        return `[${AGENT_NAME}] Acknowledged! Great work.`;
    } else if (content.toLowerCase().includes('great work')) {
        return `[${AGENT_NAME}] Thanks! Happy to help.`;
    } else {
        return `[${AGENT_NAME}] I've processed your request: "${content.substring(0, 50)}..."`;
    }
}

// Reply to a ticket
async function replyToTicket(ticketId, responseText) {
    try {
        const response = await fetch(`${BROKER_URL}/replies`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ticketId,
                payload: { message: responseText, from: AGENT_NAME },
                metadata: { agentId: AGENT_NAME, auto: true }
            })
        });

        if (response.ok) {
            console.log(`[${AGENT_NAME}] ✓ Replied to ticket ${ticketId.substring(0, 8)}...`);
            return true;
        }
        return false;
    } catch (error) {
        console.error(`[${AGENT_NAME}] ✗ Reply error:`, error.message);
        return false;
    }
}

// Main polling loop
async function mainLoop() {
    while (isRunning) {
        const tickets = await pollTickets();

        if (tickets.length > 0) {
            console.log(`[${AGENT_NAME}] 📬 ${tickets.length} pending ticket(s)`);

            for (const ticket of tickets) {
                const responseText = generateResponse(ticket);
                console.log(`[${AGENT_NAME}] 📤 "${responseText}"`);
                await replyToTicket(ticket.ticketId, responseText);

                // Small delay between replies
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
    }
}

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log(`[${AGENT_NAME}] Shutting down...`);
    isRunning = false;
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log(`[${AGENT_NAME}] Shutting down...`);
    isRunning = false;
    process.exit(0);
});

// Start agent
(async () => {
    const registered = await register();
    if (!registered) {
        console.error(`[${AGENT_NAME}] Failed to register, exiting...`);
        process.exit(1);
    }

    // Start heartbeat (every 30s)
    setInterval(heartbeat, 30000);

    // Start polling
    console.log(`[${AGENT_NAME}] 🔄 Polling for tickets...`);
    await mainLoop();
})();
