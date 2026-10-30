/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * @fileoverview One sample payload, in canonical units, plus anything skipped.
 */
import type { NormalizedReading, SensorRecord } from '../types';
export interface NormalizedSample {
    reading: NormalizedReading;
    /** `serial`, sensor type, and unit, separated by tabs, when the unit is not converted. */
    ignored: string[];
}
export declare function normalizeSample(record: SensorRecord, now: number): NormalizedSample;
export declare function parseRecordedAt(value: string): number | undefined;
export declare function isFresh(recordedAt: number | undefined, now: number): boolean;
/** Why a sample is not fresh, or undefined when it still is. */
export declare function inactiveReason(recordedAt: number | undefined, now: number): string | undefined;
