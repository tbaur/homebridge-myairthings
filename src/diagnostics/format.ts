/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * @fileoverview Human-readable formatting for diagnostics reports.
 *
 * The plugin version is not on this line. It is already on the startup line.
 * The REST transport is its own segment, the same way the other plugins show
 * `rest`, `ws`, `mqtt`, or `obs`.
 */

export type DiagnosticsMessage = 'health' | 'diagnostics.start' | 'diagnostics.stop'

/** REST poll lifecycle. `running` is shown as `live`. */
export type RestTransportState = 'running' | 'connecting' | 'stopped' | 'auth-failed'

export interface RestTransportFlags {
  /** Platform shutdown has begun. */
  stopped: boolean
  /** The last completed poll was a rejected client. */
  authFailed: boolean
  /** The next poll is already scheduled. */
  pollingArmed: boolean
}

export interface DiagnosticLine {
  msg: DiagnosticsMessage
  devicesOnline: number
  devicesTotal: number
  restState: RestTransportState
  p50Ms: number
  p95Ms: number
  requests: number
  errors: number
}

/**
 * Resolve the REST transport lifecycle.
 *
 * Stopped and a rejected client win.
 */
export function resolveRestTransportState(flags: RestTransportFlags): RestTransportState {
  if (flags.stopped) {
    return 'stopped'
  }
  if (flags.authFailed) {
    return 'auth-failed'
  }
  if (!flags.pollingArmed) {
    return 'connecting'
  }
  return 'running'
}

/** Short label for the REST transport. `running` is `live`. */
export function formatRestTransportState(state: RestTransportState): string {
  switch (state) {
    case 'running':
      return 'live'
    case 'auth-failed':
      return 'auth-failed'
    case 'connecting':
    case 'stopped':
      return state
    default: {
      const unreachable: never = state
      return unreachable
    }
  }
}

/** Human-readable label for a diagnostics channel. */
export function diagnosticLabel(msg: DiagnosticsMessage): string {
  switch (msg) {
    case 'health':
      return 'Health'
    case 'diagnostics.start':
      return 'Diagnostics start'
    case 'diagnostics.stop':
      return 'Diagnostics stop'
    default: {
      const unreachable: never = msg
      return unreachable
    }
  }
}

/** Bracketed reason list, empty when healthy. */
export function formatReasons(reasons: readonly string[]): string {
  return reasons.length > 0 ? ` [${reasons.join(', ')}]` : ''
}

/**
 * Concise summary, same shape as the other plugins:
 * `Health: healthy | devices 1/1 | rest live | api p50 12ms p95 40ms (req 3, err 0)`.
 */
export function formatDiagnosticLine(report: DiagnosticLine): string {
  const reasons: string[] = []
  if (report.restState === 'auth-failed') {
    reasons.push('authFailed')
  }
  if (report.devicesTotal > 0 && report.devicesOnline < report.devicesTotal) {
    reasons.push('devicesInactive')
  }
  const parts = [
    `${diagnosticLabel(report.msg)}: ${reasons.length > 0 ? 'degraded' : 'healthy'}${formatReasons(reasons)}`,
    `devices ${report.devicesOnline}/${report.devicesTotal}`,
  ]
  parts.push(
    `rest ${formatRestTransportState(report.restState)}`,
    `api p50 ${report.p50Ms}ms p95 ${report.p95Ms}ms (req ${report.requests}, err ${report.errors})`,
  )
  return parts.join(' | ')
}
