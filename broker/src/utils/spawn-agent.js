import { execSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function spawnAgentInTmux(agentName, role = 'Developer') {
    const tmuxSession = `dev-${agentName}`;

    // Check if session already exists
    try {
        execSync(`tmux has-session -t ${tmuxSession} 2>/dev/null`, { stdio: 'ignore' });
        console.log(`[spawn] Tmux session ${tmuxSession} already exists`);
        return { success: true, session: tmuxSession, created: false };
    } catch {
        // Session doesn't exist, create it
    }

    // Path to mock agent script
    const agentScript = join(__dirname, '../agents/mock-agent.js');

    // Create new tmux session with the agent running
    try {
        execSync(
            `tmux new-session -d -s ${tmuxSession} "node ${agentScript} ${agentName} '${role}'"`,
            { stdio: 'ignore' }
        );

        console.log(`[spawn] ✓ Created tmux session: ${tmuxSession}`);
        return { success: true, session: tmuxSession, created: true };
    } catch (error) {
        console.error(`[spawn] ✗ Failed to create tmux session: ${error.message}`);
        return { success: false, error: error.message };
    }
}

export function killAgentTmux(agentName) {
    const tmuxSession = `dev-${agentName}`;

    try {
        execSync(`tmux has-session -t ${tmuxSession} 2>/dev/null`, { stdio: 'ignore' });
        execSync(`tmux kill-session -t ${tmuxSession}`, { stdio: 'ignore' });
        console.log(`[spawn] ✓ Killed tmux session: ${tmuxSession}`);
        return { success: true, session: tmuxSession };
    } catch {
        console.log(`[spawn] Session ${tmuxSession} not found`);
        return { success: false, error: 'Session not found' };
    }
}
