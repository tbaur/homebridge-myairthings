/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * @fileoverview Opt-in diagnostics collector.
 *
 * It counts polls and their durations. It never sees the client secret.
 * The human line is formatted in `format.ts`. The plugin version is not on it.
 */

import { formatDiagnosticLine, type DiagnosticsMessage, type RestTransportState } from './format'

/** Maximum number of recent poll durations retained for percentile math. */
const LATENCY_WINDOW = 200

interface Counters {
  requests: number
  errors: number
}

/** Accumulates poll counters and renders the diagnostics line. */
export class DiagnosticsCollector {
  private requests = 0
  private errors = 0
  private readonly latencies: number[] = []
  private marker: Counters = { requests: 0, errors: 0 }

  /** One poll finished. `wait` is a rate-limit pause, not a failed request. */
  apiRequest(durationMs: number, countAs: 'ok' | 'error' | 'wait'): void {
    if (countAs === 'wait') {
      return
    }
    this.requests += 1
    if (countAs === 'error') {
      this.errors += 1
    }
    if (Number.isFinite(durationMs) && durationMs >= 0) {
      this.latencies.push(durationMs)
      if (this.latencies.length > LATENCY_WINDOW) {
        this.latencies.shift()
      }
    }
  }

  /**
   * The line for one report.
   *
   * `health` uses the counts since the previous heartbeat. Start and stop use
   * the totals since the process began.
   */
  line(input: {
    msg: DiagnosticsMessage
    devicesOnline: number
    devicesTotal: number
    restState: RestTransportState
  }): string {
    const counters = input.msg === 'health' ? this.sinceMarker() : this.totals()
    if (input.msg === 'health') {
      this.marker = { requests: this.requests, errors: this.errors }
    }
    return formatDiagnosticLine({
      msg: input.msg,
      devicesOnline: input.devicesOnline,
      devicesTotal: input.devicesTotal,
      restState: input.restState,
      p50Ms: this.percentile(50),
      p95Ms: this.percentile(95),
      requests: counters.requests,
      errors: counters.errors,
    })
  }

  private totals(): Counters {
    return { requests: this.requests, errors: this.errors }
  }

  private sinceMarker(): Counters {
    return {
      requests: this.requests - this.marker.requests,
      errors: this.errors - this.marker.errors,
    }
  }

  /** Nearest-rank percentile (0..100) over the recent poll durations. */
  private percentile(rankPercent: number): number {
    if (this.latencies.length === 0) {
      return 0
    }
    const sorted = [...this.latencies].sort((left, right) => left - right)
    const rank = Math.ceil((Math.min(100, Math.max(0, rankPercent)) / 100) * sorted.length)
    return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))] ?? 0
  }
}
