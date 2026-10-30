/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * @fileoverview One sample payload, in canonical units, plus anything skipped.
 */

import { FUTURE_SKEW_MS, STALE_AFTER_MS } from '../settings'
import type { NormalizedReading, SensorRecord } from '../types'
import { convertSensor } from './units'

export interface NormalizedSample {
  reading: NormalizedReading
  /** `serial`, sensor type, and unit, separated by tabs, when the unit is not converted. */
  ignored: string[]
}

export function normalizeSample(record: SensorRecord, now: number): NormalizedSample {
  const reading: NormalizedReading = {
    active: isFresh(record.recordedAt, now),
    recordedAt: record.recordedAt,
  }
  if (record.batteryPercent !== undefined) {
    reading.batteryPercent = record.batteryPercent
  }
  const ignored: string[] = []
  for (const sensor of record.sensors) {
    const converted = convertSensor(sensor)
    if (converted === undefined) {
      ignored.push(`${record.serialNumber}\t${sensor.sensorType}\t${sensor.unit}`)
      continue
    }
    Object.assign(reading, converted)
  }
  return { reading, ignored }
}

export function parseRecordedAt(value: string): number | undefined {
  const withZone = /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}Z`
  const ms = Date.parse(withZone)
  return Number.isNaN(ms) ? undefined : ms
}

export function isFresh(recordedAt: number | undefined, now: number): boolean {
  return inactiveReason(recordedAt, now) === undefined
}

/** Why a sample is not fresh, or undefined when it still is. */
export function inactiveReason(recordedAt: number | undefined, now: number): string | undefined {
  if (recordedAt === undefined) {
    return 'timestamp missing'
  }
  const skew = now - recordedAt
  if (skew > STALE_AFTER_MS) {
    return 'sample older than three hours'
  }
  if (skew < -FUTURE_SKEW_MS) {
    return 'timestamp ahead of this clock'
  }
  return undefined
}
