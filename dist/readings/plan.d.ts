/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * @fileoverview Which services a device's sensor list needs.
 *
 * The list is the `sensors` array on the device payload.
 */
import type { SensorPlan } from '../types';
export declare function planFor(sensors: readonly string[]): SensorPlan;
export declare function hasPublishableSensor(plan: SensorPlan): boolean;
/** Sensor names the device reported that this plugin does not map yet. */
export declare function unknownSensorNames(sensors: readonly string[]): string[];
