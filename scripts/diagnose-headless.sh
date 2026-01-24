#!/usr/bin/env bash
#
# diagnose-headless.sh - Comprehensive headless execution environment diagnostic
#
# Usage:
#   ./scripts/diagnose-headless.sh                    # Check all CLIs
#   ./scripts/diagnose-headless.sh --cli claude-code  # Check specific CLI
#   ./scripts/diagnose-headless.sh --format json      # Output JSON report
#

set -euo pipefail

# Configuration
BROKER_URL="${BROKER_URL:-http://127.0.0.1:5050}"
CLI_TYPE="${1:-all}"
OUTPUT_FORMAT="text"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --cli)
      CLI_TYPE="$2"
      shift 2
      ;;
    --format)
      OUTPUT_FORMAT="$2"
      shift 2
      ;;
    --help|-h)
      echo "Usage: $0 [--cli <type>] [--format text|json]"
      echo ""
      echo "Options:"
      echo "  --cli <type>     Check specific CLI (claude-code, factory-droid, gemini, or all)"
      echo "  --format <fmt>   Output format (text or json)"
      echo ""
      echo "Examples:"
      echo "  $0                           # Check all CLIs"
      echo "  $0 --cli claude-code         # Check Claude Code only"
      echo "  $0 --format json > report.json"
      exit 0
      ;;
    *)
      shift
      ;;
  esac
done

# Colors for text output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
  if [[ "$OUTPUT_FORMAT" == "text" ]]; then
    echo -e "${BLUE}[INFO]${NC} $1"
  fi
}

log_success() {
  if [[ "$OUTPUT_FORMAT" == "text" ]]; then
    echo -e "${GREEN}[]${NC} $1"
  fi
}

log_warning() {
  if [[ "$OUTPUT_FORMAT" == "text" ]]; then
    echo -e "${YELLOW}[ ]${NC} $1"
  fi
}

log_error() {
  if [[ "$OUTPUT_FORMAT" == "text" ]]; then
    echo -e "${RED}[]${NC} $1"
  fi
}

# Check if broker is running
check_broker() {
  log_info "Checking broker availability..."

  if curl -sf "$BROKER_URL/health" > /dev/null 2>&1; then
    log_success "Broker is running at $BROKER_URL"
    return 0
  else
    log_error "Broker is not reachable at $BROKER_URL"
    return 1
  fi
}

# Check environment via broker API
check_environment() {
  local cli_type="$1"

  log_info "Checking environment for $cli_type..."

  local result
  if result=$(curl -sf "$BROKER_URL/api/health/environment?cli=$cli_type" 2>&1); then
    local passed
    passed=$(echo "$result" | jq -r '.passed')

    if [[ "$passed" == "true" ]]; then
      log_success "$cli_type environment check passed"

      # Show warnings if any
      local warnings
      warnings=$(echo "$result" | jq -r '.warnings[]?' 2>/dev/null || echo "")
      if [[ -n "$warnings" ]]; then
        while IFS= read -r warning; do
          log_warning "$cli_type: $warning"
        done <<< "$warnings"
      fi

      return 0
    else
      log_error "$cli_type environment check failed"

      # Show failed checks
      local failed_checks
      failed_checks=$(echo "$result" | jq -r '.checks[] | select(.passed == false) | "\(.name): \(.message)"' 2>/dev/null || echo "Unknown failure")
      while IFS= read -r check; do
        log_error "  $check"
      done <<< "$failed_checks"

      return 1
    fi
  else
    log_error "Failed to check $cli_type environment (API error)"
    return 1
  fi
}

# Check session manager status
check_sessions() {
  log_info "Checking session status..."

  local result
  if result=$(curl -sf "$BROKER_URL/agents/sessions/status" 2>&1); then
    local total_sessions
    total_sessions=$(echo "$result" | jq '. | length')

    local locked_sessions
    locked_sessions=$(echo "$result" | jq '[.[] | select(.locked == true)] | length')

    local executing_sessions
    executing_sessions=$(echo "$result" | jq '[.[] | select(.executing == true)] | length')

    log_success "Session manager healthy"
    log_info "  Total sessions: $total_sessions"
    log_info "  Locked sessions: $locked_sessions"
    log_info "  Executing sessions: $executing_sessions"

    # Warn if any locked >5min
    local stale_locks
    stale_locks=$(echo "$result" | jq -r '.[] | select(.locked == true and .executionStartedAt != null) | select((now * 1000 - .executionStartedAt) > 300000) | .agentId' 2>/dev/null || echo "")

    if [[ -n "$stale_locks" ]]; then
      while IFS= read -r agent; do
        log_warning "Agent $agent locked >5 minutes (potential deadlock)"
      done <<< "$stale_locks"
    fi

    return 0
  else
    log_error "Failed to check session status"
    return 1
  fi
}

# Check circuit breaker status
check_circuits() {
  log_info "Checking circuit breaker status..."

  local result
  if result=$(curl -sf "$BROKER_URL/agents/circuits/status" 2>&1); then
    local total_circuits
    total_circuits=$(echo "$result" | jq '.circuits | length')

    local open_circuits
    open_circuits=$(echo "$result" | jq '[.circuits[] | select(.state == "open")] | length')

    if [[ "$open_circuits" -eq 0 ]]; then
      log_success "All circuit breakers closed ($total_circuits total)"
    else
      log_warning "$open_circuits circuit breakers open"

      # List open circuits
      local agents
      agents=$(echo "$result" | jq -r '.circuits[] | select(.state == "open") | .agentId')
      while IFS= read -r agent; do
        log_warning "  $agent circuit is OPEN (failing)"
      done <<< "$agents"
    fi

    return 0
  else
    log_error "Failed to check circuit breaker status"
    return 1
  fi
}

# Check fallback status
check_fallback() {
  log_info "Checking fallback controller status..."

  local result
  if result=$(curl -sf "$BROKER_URL/api/fallback/status" 2>&1); then
    local disabled_clis
    disabled_clis=$(echo "$result" | jq '.disabledCLIs | length')

    local forced_fallbacks
    forced_fallbacks=$(echo "$result" | jq '.forcedFallbacks | length')

    if [[ "$disabled_clis" -eq 0 ]] && [[ "$forced_fallbacks" -eq 0 ]]; then
      log_success "No fallbacks active (headless enabled)"
    else
      log_warning "$disabled_clis CLIs disabled, $forced_fallbacks agents forced to tmux"

      # List disabled CLIs
      if [[ "$disabled_clis" -gt 0 ]]; then
        local clis
        clis=$(echo "$result" | jq -r '.disabledCLIs[] | "\(.cli): \(.reason)"')
        while IFS= read -r cli; do
          log_warning "  $cli"
        done <<< "$clis"
      fi
    fi

    return 0
  else
    log_error "Failed to check fallback status"
    return 1
  fi
}

# Check SLO status
check_slo() {
  log_info "Checking SLO status..."

  local result
  if result=$(curl -sf "$BROKER_URL/api/slo/status" 2>&1); then
    local availability
    availability=$(echo "$result" | jq -r '.availability.current // 0')

    local availability_target
    availability_target=$(echo "$result" | jq -r '.availability.target // 0.995')

    if (( $(echo "$availability >= $availability_target" | bc -l) )); then
      log_success "Availability: $(printf "%.2f%%" $(echo "$availability * 100" | bc -l)) (target: $(printf "%.2f%%" $(echo "$availability_target * 100" | bc -l)))"
    else
      log_error "Availability: $(printf "%.2f%%" $(echo "$availability * 100" | bc -l)) (below target: $(printf "%.2f%%" $(echo "$availability_target * 100" | bc -l)))"
    fi

    return 0
  else
    log_warning "SLO status unavailable (telemetry may not be configured)"
    return 0  # Non-critical
  fi
}

# Main diagnostic routine
run_diagnostics() {
  local exit_code=0

  if [[ "$OUTPUT_FORMAT" == "text" ]]; then
    echo "========================================="
    echo " Kokino Headless Execution Diagnostics"
    echo "========================================="
    echo ""
  fi

  # Check broker first
  if ! check_broker; then
    log_error "Cannot proceed without broker connection"
    return 1
  fi

  echo ""

  # Check environment for requested CLI(s)
  if [[ "$CLI_TYPE" == "all" ]]; then
    for cli in claude-code factory-droid gemini; do
      check_environment "$cli" || exit_code=1
      echo ""
    done
  else
    check_environment "$CLI_TYPE" || exit_code=1
    echo ""
  fi

  # Check operational systems
  check_sessions || exit_code=1
  echo ""

  check_circuits || exit_code=1
  echo ""

  check_fallback || exit_code=1
  echo ""

  check_slo || exit_code=1
  echo ""

  # Summary
  if [[ "$OUTPUT_FORMAT" == "text" ]]; then
    echo "========================================="
    if [[ $exit_code -eq 0 ]]; then
      log_success "All checks passed"
    else
      log_error "Some checks failed - see details above"
    fi
    echo "========================================="
  fi

  return $exit_code
}

# JSON output mode
run_diagnostics_json() {
  local broker_health
  broker_health=$(curl -sf "$BROKER_URL/health" 2>/dev/null || echo '{"status":"unavailable"}')

  local env_checks="{}"
  if [[ "$CLI_TYPE" == "all" ]]; then
    env_checks=$(jq -n \
      --argjson claude "$(curl -sf "$BROKER_URL/api/health/environment?cli=claude-code" 2>/dev/null || echo '{}')" \
      --argjson droid "$(curl -sf "$BROKER_URL/api/health/environment?cli=factory-droid" 2>/dev/null || echo '{}')" \
      --argjson gemini "$(curl -sf "$BROKER_URL/api/health/environment?cli=gemini" 2>/dev/null || echo '{}')" \
      '{"claude-code": $claude, "factory-droid": $droid, "gemini": $gemini}')
  else
    local cli_result
    cli_result=$(curl -sf "$BROKER_URL/api/health/environment?cli=$CLI_TYPE" 2>/dev/null || echo '{}')
    env_checks=$(jq -n --argjson result "$cli_result" --arg cli "$CLI_TYPE" '{($cli): $result}')
  fi

  local sessions
  sessions=$(curl -sf "$BROKER_URL/agents/sessions/status" 2>/dev/null || echo '[]')

  local circuits
  circuits=$(curl -sf "$BROKER_URL/agents/circuits/status" 2>/dev/null || echo '{"circuits":[]}')

  local fallback
  fallback=$(curl -sf "$BROKER_URL/api/fallback/status" 2>/dev/null || echo '{"disabledCLIs":[],"forcedFallbacks":[]}')

  local slo
  slo=$(curl -sf "$BROKER_URL/api/slo/status" 2>/dev/null || echo '{}')

  jq -n \
    --argjson broker "$broker_health" \
    --argjson env "$env_checks" \
    --argjson sessions "$sessions" \
    --argjson circuits "$circuits" \
    --argjson fallback "$fallback" \
    --argjson slo "$slo" \
    '{
      timestamp: (now | todate),
      broker: $broker,
      environment: $env,
      sessions: $sessions,
      circuits: $circuits,
      fallback: $fallback,
      slo: $slo
    }'
}

# Main entry point
main() {
  if [[ "$OUTPUT_FORMAT" == "json" ]]; then
    run_diagnostics_json
  else
    run_diagnostics
  fi
}

main "$@"
