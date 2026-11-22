/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * @fileoverview The log lines a poll writes about each monitor.
 *
 * A monitor gets a summary line when Airthings has a new sample for it, and a
 * short line when the air quality level, the CO₂ alert, or the battery state
 * changes, or when its samples fall behind. A poll that returns the same
 * sample again writes nothing, so the log follows the monitors rather than
 * the poll interval.
 */

import type { AirQualityWord, NormalizedReading, SensorPlan } from '../types'
import { forLog } from '../utils/redact'
import { airQuality, qualityCause } from './quality'

/** Battery level HomeKit reports as low. */
export const LOW_BATTERY_PERCENT = 10

/** A sample counts as late only once it is at least this old. */
const MIN_LATE_MS = 15 * 60_000

interface Field {
  label: string
  value: (reading: NormalizedReading) => number | undefined
  format: (value: number) => string
  /** Written once after the value, or after both values when one changed. */
  unit: string
}

const FIELDS: readonly Field[] = [
  { label: 'Radon', value: (r) => r.radonShortBq, format: (v) => `${Math.round(v)}`, unit: ' Bq/m³' },
  { label: 'Radon long', value: (r) => r.radonLongBq, format: (v) => `${Math.round(v)}`, unit: ' Bq/m³' },
  { label: 'CO2', value: (r) => r.co2Ppm, format: (v) => `${Math.round(v)}`, unit: ' ppm' },
  { label: 'VOC', value: (r) => r.vocPpb, format: (v) => `${Math.round(v)}`, unit: ' ppb' },
  { label: 'PM2.5', value: (r) => r.pm25Micrograms, format: (v) => `${Math.round(v)}`, unit: ' µg/m³' },
  { label: 'PM1', value: (r) => r.pm1Micrograms, format: (v) => `${Math.round(v)}`, unit: ' µg/m³' },
  { label: '', value: (r) => r.temperatureC, format: (v) => v.toFixed(1), unit: '°C' },
  { label: '', value: (r) => r.humidityPercent, format: (v) => `${Math.round(v)}`, unit: '%' },
  { label: '', value: (r) => r.pressureHpa, format: (v) => `${Math.round(v)}`, unit: ' hPa' },
  { label: 'Light', value: (r) => r.lux, format: (v) => `${Math.round(v)}`, unit: ' lx' },
  { label: 'Sound', value: (r) => r.soundDb, format: (v) => `${Math.round(v)}`, unit: ' dB' },
  { label: 'Mold', value: (r) => r.mold, format: (v) => `${Math.round(v)}`, unit: '' },
]

export interface ReportInput {
  serialNumber: string
  /** The HomeKit name, which the user may have changed. */
  name: string
  plan: SensorPlan
  reading: NormalizedReading
  co2AlertPpm: number
  pollIntervalMs: number
  now: number
}

interface MonitorMemory {
  recordedAt: number
  reading: NormalizedReading
  quality: AirQualityWord
  /** Time between the last two samples, when two have been seen. */
  sampleGapMs?: number
  co2High: boolean
  batteryLow: boolean
  lateLogged: boolean
}

export interface ReportResult {
  lines: string[]
  /** True when this poll brought a sample this reporter had not seen. */
  isNewSample: boolean
}

/** Remembers each monitor's last sample so only changes reach the log. */
export class ReadingReporter {
  private readonly memory = new Map<string, MonitorMemory>()

  observe(input: ReportInput): ReportResult {
    const { reading, now } = input
    const recordedAt = reading.recordedAt
    const previous = this.memory.get(input.serialNumber)
    const name = forLog(input.name)

    if (recordedAt === undefined || (previous !== undefined && recordedAt <= previous.recordedAt)) {
      return { lines: previous === undefined ? [] : this.lateLines(name, previous, input), isNewSample: false }
    }

    const lines: string[] = []
    if (previous?.lateLogged === true) {
      lines.push(`${name}: new sample after ${formatDuration(recordedAt - previous.recordedAt)}`)
    }
    lines.push(`${name}: ${summary(previous?.reading, reading, input.plan, now)}`)

    const quality = airQuality(input.plan, reading)
    if (previous !== undefined && previous.quality !== 'unknown' && quality !== 'unknown' && quality !== previous.quality) {
      const cause = qualityCause(input.plan, reading)
      lines.push(`${name}: Air ${previous.quality} → ${quality}${cause === undefined ? '' : ` (${cause})`}`)
    }

    let co2High = previous?.co2High ?? false
    if (reading.co2Ppm !== undefined) {
      const isHigh = reading.co2Ppm >= input.co2AlertPpm
      if (isHigh !== co2High) {
        const ppm = Math.round(reading.co2Ppm)
        lines.push(isHigh
          ? `${name}: CO2 above ${input.co2AlertPpm} ppm (${ppm})`
          : `${name}: CO2 back below ${input.co2AlertPpm} ppm (${ppm})`)
      }
      co2High = isHigh
    }

    let batteryLow = previous?.batteryLow ?? false
    if (reading.batteryPercent !== undefined) {
      const percent = Math.round(reading.batteryPercent)
      const isLow = percent <= LOW_BATTERY_PERCENT
      if (isLow !== batteryLow) {
        lines.push(isLow ? `${name}: battery low (${percent}%)` : `${name}: battery ok (${percent}%)`)
      }
      batteryLow = isLow
    }

    this.memory.set(input.serialNumber, {
      recordedAt,
      reading,
      quality,
      sampleGapMs: previous === undefined ? undefined : recordedAt - previous.recordedAt,
      co2High,
      batteryLow,
      lateLogged: false,
    })
    return { lines, isNewSample: true }
  }

  /** Forget a monitor that left the account. */
  forget(serialNumber: string): void {
    this.memory.delete(serialNumber)
  }

  private lateLines(name: string, memory: MonitorMemory, input: ReportInput): string[] {
    if (memory.lateLogged) {
      return []
    }
    const age = input.now - memory.recordedAt
    const expected = Math.max(memory.sampleGapMs ?? 0, input.pollIntervalMs)
    if (age < Math.max(2 * expected, MIN_LATE_MS)) {
      return []
    }
    memory.lateLogged = true
    return [`${name}: sample is ${formatDuration(age)} old`]
  }
}

function summary(
  previous: NormalizedReading | undefined,
  reading: NormalizedReading,
  plan: SensorPlan,
  now: number,
): string {
  const parts: string[] = []
  for (const field of FIELDS) {
    const value = field.value(reading)
    if (value === undefined) {
      continue
    }
    const text = field.format(value)
    const before = previous === undefined ? undefined : field.value(previous)
    const beforeText = before === undefined ? undefined : field.format(before)
    const shown = beforeText !== undefined && beforeText !== text
      ? `${beforeText} → ${text}${field.unit}`
      : `${text}${field.unit}`
    parts.push(field.label === '' ? shown : `${field.label} ${shown}`)
  }
  const quality = airQuality(plan, reading)
  if (quality !== 'unknown') {
    parts.push(`Air ${quality}`)
  }
  if (reading.batteryPercent !== undefined) {
    parts.push(`Battery ${Math.round(reading.batteryPercent)}%`)
  }
  if (reading.recordedAt !== undefined) {
    parts.push(`sampled ${formatAgo(now - reading.recordedAt)}`)
  }
  return parts.length > 0 ? parts.join(', ') : 'no readings'
}

/** `just now`, `4 min ago`, `1 h 25 min ago`. A timestamp ahead of this clock reads `just now`. */
export function formatAgo(ms: number): string {
  return ms < 60_000 ? 'just now' : `${formatDuration(ms)} ago`
}

/** `4 min`, `1 h`, `1 h 25 min`. */
export function formatDuration(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000))
  if (minutes < 60) {
    return `${minutes} min`
  }
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`
}
