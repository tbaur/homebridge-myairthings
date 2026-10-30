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

import type { SensorPlan } from '../types'

const RECOGNIZED = new Set([
  'radonShortTermAvg',
  'radonLongTermAvg',
  'temp',
  'humidity',
  'pressure',
  'co2',
  'voc',
  'pm1',
  'pm25',
  'mold',
  'lux',
  'light',
  'sla',
  'soundLevel',
])

export function planFor(sensors: readonly string[]): SensorPlan {
  const has = (name: string): boolean => sensors.includes(name)
  return {
    radonShort: has('radonShortTermAvg'),
    radonLong: has('radonLongTermAvg'),
    temperature: has('temp'),
    humidity: has('humidity'),
    carbonDioxide: has('co2'),
    voc: has('voc'),
    pm25: has('pm25'),
    pm1: has('pm1'),
    pressure: has('pressure'),
    mold: has('mold'),
    light: has('lux') || has('light'),
    sound: has('sla') || has('soundLevel'),
  }
}

export function hasPublishableSensor(plan: SensorPlan): boolean {
  return Object.values(plan).some((present) => present)
}

/** Sensor names the device reported that this plugin does not map yet. */
export function unknownSensorNames(sensors: readonly string[]): string[] {
  return [...new Set(sensors.filter((name) => !RECOGNIZED.has(name)))]
}
