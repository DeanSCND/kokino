#!/usr/bin/env bash

# tmux-helpers.sh - Reusable tmux utility functions
# Source this file to use these functions in other scripts

# Send keys to a tmux session/pane with automatic Enter key
# Usage: tmux_send_keys <target> <text> [--no-enter]
tmux_send_keys() {
  local target="$1"
  local text="$2"
  local submit="${3:-yes}"

  if [[ "$submit" == "--no-enter" ]]; then
    tmux send-keys -t "$target" "$text"
  else
    tmux send-keys -t "$target" "$text" C-m
  fi
}

# Send literal text to tmux (escapes special characters)
# Usage: tmux_send_literal <target> <text>
tmux_send_literal() {
  local target="$1"
  local text="$2"

  tmux send-keys -t "$target" -l "$text"
  tmux send-keys -t "$target" C-m
}

# Clear the current line in tmux
# Usage: tmux_clear_line <target>
tmux_clear_line() {
  local target="$1"
  tmux send-keys -t "$target" C-c C-u
}

# Check if a tmux session exists
# Usage: tmux_session_exists <session_name>
tmux_session_exists() {
  local session="$1"
  tmux has-session -t "$session" 2>/dev/null
}

# Get pane ID for a session
# Usage: tmux_get_pane_id <session:window.pane>
tmux_get_pane_id() {
  local target="$1"
  tmux display-message -p -t "$target" -F "#{pane_id}"
}

# Send command and wait for completion
# Usage: tmux_send_and_wait <target> <command> [sleep_seconds]
tmux_send_and_wait() {
  local target="$1"
  local command="$2"
  local wait_time="${3:-2}"

  tmux send-keys -t "$target" "$command" C-m
  sleep "$wait_time"
}

export -f tmux_send_keys
export -f tmux_send_literal
export -f tmux_clear_line
export -f tmux_session_exists
export -f tmux_get_pane_id
export -f tmux_send_and_wait
