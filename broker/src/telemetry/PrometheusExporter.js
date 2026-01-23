/**
 * Prometheus metrics exporter for headless execution monitoring
 *
 * Exposes metrics in Prometheus text format at GET /metrics
 */

export class PrometheusExporter {
  constructor(metricsCollector) {
    this.metrics = metricsCollector;
  }

  /**
   * Format metrics in Prometheus exposition format
   *
   * @returns {string} Prometheus-formatted metrics
   */
  export() {
    const data = this.metrics.getPrometheusMetrics();
    const lines = [];

    // headless_executions_total - Counter
    lines.push('# HELP headless_executions_total Total number of headless executions');
    lines.push('# TYPE headless_executions_total counter');
    for (const row of data.headless_executions_total) {
      const status = row.success ? 'success' : 'failure';
      const labels = `agent_id="${row.agent_id}",cli_type="${row.cli_type || 'unknown'}",status="${status}"`;
      lines.push(`headless_executions_total{${labels}} ${row.count}`);
    }

    // headless_execution_duration_seconds - Histogram
    lines.push('# HELP headless_execution_duration_seconds Execution duration in seconds');
    lines.push('# TYPE headless_execution_duration_seconds histogram');

    // Group by agent/cli for histogram buckets
    const durationsByAgent = {};
    for (const row of data.headless_execution_duration_seconds) {
      const key = `${row.agent_id}:${row.cli_type || 'unknown'}`;
      if (!durationsByAgent[key]) {
        durationsByAgent[key] = [];
      }
      durationsByAgent[key].push(row.duration_ms / 1000); // Convert to seconds
    }

    // Generate histogram buckets (1s, 5s, 10s, 30s, 60s, 120s, +Inf)
    const buckets = [1, 5, 10, 30, 60, 120, Infinity];
    for (const [key, durations] of Object.entries(durationsByAgent)) {
      const [agentId, cliType] = key.split(':');
      const labels = `agent_id="${agentId}",cli_type="${cliType}"`;

      // Calculate bucket counts
      let cumulativeCount = 0;
      for (const bucket of buckets) {
        const count = durations.filter(d => d <= bucket).length;
        cumulativeCount = count;
        const le = bucket === Infinity ? '+Inf' : bucket;
        lines.push(`headless_execution_duration_seconds_bucket{${labels},le="${le}"} ${cumulativeCount}`);
      }

      // Sum and count
      const sum = durations.reduce((a, b) => a + b, 0);
      lines.push(`headless_execution_duration_seconds_sum{${labels}} ${sum.toFixed(3)}`);
      lines.push(`headless_execution_duration_seconds_count{${labels}} ${durations.length}`);
    }

    // headless_availability - Gauge
    lines.push('# HELP headless_availability Current availability SLI (24h window)');
    lines.push('# TYPE headless_availability gauge');
    lines.push(`headless_availability ${data.headless_availability.toFixed(4)}`);

    // headless_latency_p95_ms - Gauge
    lines.push('# HELP headless_latency_p95_ms P95 latency in milliseconds (24h window)');
    lines.push('# TYPE headless_latency_p95_ms gauge');
    lines.push(`headless_latency_p95_ms ${data.headless_latency_p95_ms}`);

    return lines.join('\n') + '\n';
  }
}
