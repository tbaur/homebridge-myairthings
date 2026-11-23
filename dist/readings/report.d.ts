/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * @fileoverview The log lines a poll writes about each monitor.
 *
 * A monitor gets a summary line for its first sample and for each new sample
 * whose readings differ from the last one, and a short line when the air
 * quality level or the CO₂ alert changes, when the battery falls another five
 * points (two below 20%) or crosses the low level, or when its samples fall behind. A sample with the same readings, or a poll that
 * returns the same sample again, writes nothing.
 */
import type { NormalizedReading, SensorPlan } from '../types';
/** Battery level HomeKit reports as low. */
export declare const LOW_BATTERY_PERCENT = 10;
export interface ReportInput {
    serialNumber: string;
    /** The HomeKit name, which the user may have changed. */
    name: string;
    plan: SensorPlan;
    reading: NormalizedReading;
    co2AlertPpm: number;
    pollIntervalMs: number;
    now: number;
}
export interface ReportResult {
    lines: string[];
    /** `new` for a sample not seen before, `unchanged` for the same one again, `none` when there is nothing to compare yet. */
    sample: 'new' | 'unchanged' | 'none';
}
/** Remembers each monitor's last sample so only changes reach the log. */
export declare class ReadingReporter {
    private readonly memory;
    observe(input: ReportInput): ReportResult;
    /** Forget a monitor that left the account. */
    forget(serialNumber: string): void;
    private lateLines;
}
/** `just now`, `4 min ago`, `1 h 25 min ago`. A timestamp ahead of this clock reads `just now`. */
export declare function formatAgo(ms: number): string;
/** `4 min`, `1 h`, `1 h 25 min`. */
export declare function formatDuration(ms: number): string;
