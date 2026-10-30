/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * @fileoverview The lines written once a device list has been applied.
 */
import type { MonitorSnapshot } from '../types';
export declare function startupLines(input: {
    version: string;
    name: string;
    monitors: readonly MonitorSnapshot[];
    refreshIntervalSec: number;
    created: number;
    removed: number;
}): string[];
