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

import type { AirQualityWord, NormalizedReading, SensorPlan } from '../types'
import { forLog } from '../utils/redact'
import { airQuality, qualityCause } from './quality'

/** Battery level HomeKit reports as low. */
export const LOW_BATTERY_PERCENT = 10

/** A battery line is written each time the level falls this far below the last one logged. */
const BATTERY_STEP_PERCENT = 5

/** Below this level the step shrinks, so a battery near empty is logged more often. */
const BATTERY_NEAR_EMPTY_PERCENT = 20
const BATTERY_NEAR_EMPTY_STEP_PERCENT = 2

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
  /** Battery level the log last reported, so a drop is logged per step rather than per point. */
  batteryMark?: number
  lateLogged: boolean
}

export interface ReportResult {
  lines: string[]
  /** `new` for a sample not seen before, `unchanged` for the same one again, `none` when there is nothing to compare yet. */
  sample: 'new' | 'unchanged' | 'none'
}

/** Remembers each monitor's last sample so only changes reach the log. */
export class ReadingReporter {
  private readonly memory = new Map<string, MonitorMemory>()

  observe(input: ReportInput): ReportResult {
    const { reading, now } = input
    const recordedAt = reading.recordedAt
    const previous = this.memory.get(input.serialNumber)
    const name = forLog(input.name)

    if (previous === undefined && recordedAt === undefined) {
      return { lines: [], sample: 'none' }
    }
    if (previous !== undefined && (recordedAt === undefined || recordedAt <= previous.recordedAt)) {
      return { lines: this.lateLines(name, previous, input), sample: 'unchanged' }
    }
    if (recordedAt === undefined) {
      return { lines: [], sample: 'none' }
    }

    const lines: string[] = []
    const gapMs = previous === undefined ? undefined : recordedAt - previous.recordedAt
    const resumed = previous?.lateLogged === true && gapMs !== undefined && gapMs >= 60_000
    if (resumed) {
      lines.push(`${name}: new sample after ${formatDuration(gapMs)}`)
    }
    if (previous === undefined || resumed || valuesChanged(previous.reading, reading)) {
      lines.push(`${name}: ${summary(previous?.reading, reading, input.plan, now)}`)
    }

    // A sample without the readings that set the tile does not count as a
    // level change; the last known level stays the one to compare against.
    const measured = airQuality(input.plan, reading)
    const quality = measured === 'unknown' ? previous?.quality ?? 'unknown' : measured
    if (previous !== undefined && measured !== 'unknown' && measured !== previous.quality) {
      const cause = qualityCause(input.plan, reading, previous.reading)
      lines.push(`${name}: Air ${previous.quality} → ${measured}${cause === undefined ? '' : ` (${cause})`}`)
    }

    let co2High = previous?.co2High ?? false
    if (reading.co2Ppm !== undefined) {
      const isHigh = reading.co2Ppm >= input.co2AlertPpm
      if (isHigh !== co2High) {
        const ppm = Math.round(reading.co2Ppm)
        lines.push(isHigh
          ? `${name}: CO2 at or above ${input.co2AlertPpm} ppm (${ppm})`
          : `${name}: CO2 back below ${input.co2AlertPpm} ppm (${ppm})`)
      }
      co2High = isHigh
    }

    let batteryLow = previous?.batteryLow ?? false
    let batteryMark = previous?.batteryMark
    if (reading.batteryPercent !== undefined) {
      const percent = Math.round(reading.batteryPercent)
      const isLow = percent <= LOW_BATTERY_PERCENT
      const step = percent < BATTERY_NEAR_EMPTY_PERCENT ? BATTERY_NEAR_EMPTY_STEP_PERCENT : BATTERY_STEP_PERCENT
      const dropped = batteryMark !== undefined && percent <= batteryMark - step
      if (isLow !== batteryLow) {
        lines.push(isLow ? `${name}: battery low (${percent}%)` : `${name}: battery ok (${percent}%)`)
      } else if (dropped) {
        lines.push(`${name}: battery ${batteryMark} → ${percent}%`)
      }
      // The mark moves up with a rise (new batteries, or a reading that wobbles
      // by a point) and down only when a drop is logged.
      if (batteryMark === undefined || percent > batteryMark || dropped || isLow !== batteryLow) {
        batteryMark = percent
      }
      batteryLow = isLow
    }

    this.memory.set(input.serialNumber, {
      recordedAt,
      reading,
      quality,
      // A gap that ended a late stretch is not the monitor's normal cadence,
      // unless it is the only gap seen so far.
      sampleGapMs: previous?.lateLogged === true && previous.sampleGapMs !== undefined ? previous.sampleGapMs : gapMs,
      co2High,
      batteryLow,
      batteryMark,
      lateLogged: false,
    })
    return { lines, sample: 'new' }
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

/** True when a reading shows differently in the log. Battery is left out; its low and ok lines cover it. */
function valuesChanged(previous: NormalizedReading, reading: NormalizedReading): boolean {
  return FIELDS.some((field) => {
    const before = field.value(previous)
    const after = field.value(reading)
    return (before === undefined ? undefined : field.format(before)) !== (after === undefined ? undefined : field.format(after))
  })
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
