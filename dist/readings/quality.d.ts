/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * @fileoverview The Home tile.
 *
 * When a monitor reports radon, the Good / Fair / Poor value is that radon reading.
 * CO₂, particles, and VOC stay on their own services.
 *
 * A monitor with no radon uses the worst of CO₂, PM2.5, and VOC.
 * Humidity stays on the humidity service.
 *
 * Bands are Airthings' published thresholds.
 */
import type { AirQualityWord, NormalizedReading, SensorPlan } from '../types';
export declare function airQuality(plan: SensorPlan, reading: NormalizedReading): AirQualityWord;
