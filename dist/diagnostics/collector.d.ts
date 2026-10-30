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
import { type DiagnosticsMessage, type RestTransportState } from './format';
/** Accumulates poll counters and renders the diagnostics line. */
export declare class DiagnosticsCollector {
    private requests;
    private errors;
    private readonly latencies;
    private marker;
    /** One poll finished. `wait` is a rate-limit pause, not a failed request. */
    apiRequest(durationMs: number, countAs: 'ok' | 'error' | 'wait'): void;
    /**
     * The line for one report.
     *
     * `health` uses the counts since the previous heartbeat. Start and stop use
     * the totals since the process began.
     */
    line(input: {
        msg: DiagnosticsMessage;
        devicesOnline: number;
        devicesTotal: number;
        restState: RestTransportState;
    }): string;
    private totals;
    private sinceMarker;
    /** Nearest-rank percentile (0..100) over the recent poll durations. */
    private percentile;
}
