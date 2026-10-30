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
export type DiagnosticsMessage = 'health' | 'diagnostics.start' | 'diagnostics.stop';
/** REST poll lifecycle. `running` is shown as `live`. */
export type RestTransportState = 'running' | 'connecting' | 'stopped' | 'auth-failed';
export interface RestTransportFlags {
    /** Platform shutdown has begun. */
    stopped: boolean;
    /** The last completed poll was a rejected client. */
    authFailed: boolean;
    /** The next poll is already scheduled. */
    pollingArmed: boolean;
}
export interface DiagnosticLine {
    msg: DiagnosticsMessage;
    devicesOnline: number;
    devicesTotal: number;
    restState: RestTransportState;
    p50Ms: number;
    p95Ms: number;
    requests: number;
    errors: number;
}
/**
 * Resolve the REST transport lifecycle.
 *
 * Stopped and a rejected client win.
 */
export declare function resolveRestTransportState(flags: RestTransportFlags): RestTransportState;
/** Short label for the REST transport. `running` is `live`. */
export declare function formatRestTransportState(state: RestTransportState): string;
/** Human-readable label for a diagnostics channel. */
export declare function diagnosticLabel(msg: DiagnosticsMessage): string;
/** Bracketed reason list, empty when healthy. */
export declare function formatReasons(reasons: readonly string[]): string;
/**
 * Concise summary, same shape as the other plugins:
 * `Health: healthy | devices 1/1 | rest live | api p50 12ms p95 40ms (req 3, err 0)`.
 */
export declare function formatDiagnosticLine(report: DiagnosticLine): string;
