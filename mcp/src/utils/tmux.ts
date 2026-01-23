import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface TmuxSession {
  id: string;
  name: string;
  attached: boolean;
  windows: number;
}

/**
 * Execute a tmux command and return stdout
 */
export async function runTmux(args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("tmux", args);
    return stdout.toString();
  } catch (error: any) {
    const stderr = error?.stderr?.toString?.() ?? "";
    throw new Error(`tmux ${args.join(" ")} failed: ${error.message ?? error}\n${stderr}`);
  }
}

/**
 * List all tmux sessions
 */
export async function listSessions(): Promise<TmuxSession[]> {
  try {
    const format = "#{session_id}\t#{session_name}\t#{?session_attached,1,0}\t#{session_windows}";
    const output = (await runTmux(["list-sessions", "-F", format])).trim();
    if (!output) return [];

    return output.split("\n").map((line) => {
      const [id, name, attached, windows] = line.split("\t");
      return {
        id,
        name,
        attached: attached === "1",
        windows: Number.parseInt(windows, 10) || 0,
      };
    });
  } catch (error: any) {
    // No sessions exist
    if (error.message.includes("no server running") || error.message.includes("failed to connect")) {
      return [];
    }
    throw error;
  }
}

/**
 * Check if a tmux session exists
 */
export async function sessionExists(sessionName: string): Promise<boolean> {
  try {
    await runTmux(["has-session", "-t", sessionName]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Capture pane output
 */
export async function capturePane(
  paneId: string,
  lines: number = 200,
  withColors = false
): Promise<string> {
  const args = ["capture-pane", "-p", "-t", paneId, "-S", `-${lines}`];
  if (withColors) {
    args.push("-e");
  }
  const result = await runTmux(args);
  return result.replace(/\r\n/g, "\n");
}

/**
 * Send keys to a pane (literal mode)
 */
export async function sendKeys(paneId: string, text: string, literal = true): Promise<void> {
  const args = ["send-keys", "-t", paneId];
  if (literal) {
    args.push("-l");
  }
  args.push("--", text);
  await runTmux(args);
}

/**
 * Send Enter key to a pane
 */
export async function sendEnter(paneId: string): Promise<void> {
  await runTmux(["send-keys", "-t", paneId, "Enter"]);
}

/**
 * Load content into tmux buffer (atomic operation)
 */
export async function loadBuffer(content: string, bufferName?: string): Promise<void> {
  const args = ["load-buffer"];
  if (bufferName) {
    args.push("-b", bufferName);
  }
  args.push("-");

  return new Promise<void>((resolve, reject) => {
    const proc = execFile("tmux", args, (error) => {
      if (error) reject(new Error(`Failed to load buffer: ${error.message}`));
      else resolve();
    });

    if (proc.stdin) {
      proc.stdin.write(content);
      proc.stdin.end();
    } else {
      reject(new Error("Failed to get stdin for tmux process"));
    }
  });
}

/**
 * Paste buffer to a pane (atomic operation)
 */
export async function pasteBuffer(paneId: string, bufferName?: string): Promise<void> {
  const args = ["paste-buffer", "-t", paneId];
  if (bufferName) {
    args.push("-b", bufferName);
  }
  await runTmux(args);
}

/**
 * Check if terminal is ready to receive input
 * Returns true if the pane is not running a blocking command
 */
export async function isTerminalReady(paneId: string): Promise<boolean> {
  try {
    // Capture last few lines to check for prompts
    const output = await capturePane(paneId, 5);
    const lastLine = output.trim().split("\n").pop() || "";

    // Look for common shell prompts (very basic heuristic)
    // More sophisticated: check pane_current_command
    const format = "#{pane_current_command}";
    const command = (await runTmux(["display-message", "-p", "-t", paneId, "-F", format])).trim();

    // Terminal is ready if running a shell
    const shellCommands = ["bash", "zsh", "fish", "sh", "ksh", "tcsh"];
    return shellCommands.includes(command.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Kill a tmux session
 */
export async function killSession(sessionName: string): Promise<void> {
  try {
    await runTmux(["kill-session", "-t", sessionName]);
  } catch (error: any) {
    // Ignore errors if session doesn't exist
    if (!error.message.includes("can't find session")) {
      throw error;
    }
  }
}

/**
 * Get pane ID for a session (uses first pane if not specified)
 */
export async function getPaneId(sessionName: string, paneId?: string): Promise<string | null> {
  try {
    if (paneId) {
      // Verify pane exists
      await runTmux(["display-message", "-p", "-t", paneId]);
      return paneId;
    }

    // Get first pane of session
    const format = "#{pane_id}";
    const result = await runTmux(["display-message", "-p", "-t", `${sessionName}:0.0`, "-F", format]);
    return result.trim();
  } catch {
    return null;
  }
}
