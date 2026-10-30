/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * @fileoverview Convert a sensor value into the unit HomeKit or Eve expects.
 *
 * The consumer API names the unit on each value. Metric is requested, and
 * the other spellings are accepted so a sample is not dropped when the unit
 * token differs.
 *
 * VOC is reported in ppb. HomeKit's VOC density is micrograms per cubic
 * metre. Airthings does not publish a molar mass, so the mass value uses
 * isobutylene at 25°C, the reference gas VOC sensors are calibrated against.
 * Eve receives the unmodified ppb value.
 */
import type { NormalizedReading, SensorValue } from '../types';
export declare function ppbToMicrograms(ppb: number): number;
export declare function microgramsToPpb(micrograms: number): number;
/** The fields this value contributes, or undefined when the unit is unknown. */
export declare function convertSensor(sensor: SensorValue): Partial<NormalizedReading> | undefined;
