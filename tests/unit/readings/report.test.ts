/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 */

import { planFor } from '../../../src/readings/plan'
import { qualityCause } from '../../../src/readings/quality'
import { formatAgo, formatDuration, ReadingReporter, type ReportInput } from '../../../src/readings/report'
import type { NormalizedReading } from '../../../src/types'

const MINUTE = 60_000
const T0 = Date.parse('2026-01-01T12:00:00Z')
const PLUS = planFor(['radonShortTermAvg', 'radonLongTermAvg', 'co2', 'voc', 'pm25', 'temp', 'humidity', 'pressure'])
const WAVE = planFor(['co2', 'voc', 'temp', 'humidity'])

function input(reading: Partial<NormalizedReading>, options: Partial<ReportInput> = {}): ReportInput {
  return {
    serialNumber: 'SERIAL-0001',
    name: 'Zone One',
    plan: PLUS,
    reading: { active: true, recordedAt: T0, ...reading },
    co2AlertPpm: 1000,
    pollIntervalMs: 5 * MINUTE,
    now: (reading.recordedAt ?? T0) + 2 * MINUTE,
    ...options,
  }
}

const BASE: Partial<NormalizedReading> = {
  radonShortBq: 45,
  radonLongBq: 38,
  co2Ppm: 612,
  vocPpb: 104,
  pm25Micrograms: 3,
  temperatureC: 20.94,
  humidityPercent: 41,
  pressureHpa: 1003.4,
  batteryPercent: 87,
}

describe('ReadingReporter', () => {
  it('writes the full summary for the first sample', () => {
    const result = new ReadingReporter().observe(input(BASE))

    expect(result.isNewSample).toBe(true)
    expect(result.lines).toEqual([
      'Zone One: Radon 45 Bq/m³, Radon long 38 Bq/m³, CO2 612 ppm, VOC 104 ppb, PM2.5 3 µg/m³, 20.9°C, 41%, 1003 hPa, Air good, Battery 87%, sampled 2 min ago',
    ])
  })

  it('writes nothing when a poll returns the same sample again', () => {
    const reporter = new ReadingReporter()
    reporter.observe(input(BASE))

    const again = reporter.observe(input(BASE, { now: T0 + 7 * MINUTE }))

    expect(again).toEqual({ lines: [], isNewSample: false })
  })

  it('shows what changed with an arrow', () => {
    const reporter = new ReadingReporter()
    reporter.observe(input(BASE))

    const next = reporter.observe(input({ ...BASE, recordedAt: T0 + 5 * MINUTE, co2Ppm: 845 }))

    expect(next.lines[0]).toContain('CO2 612 → 845 ppm, VOC 104 ppb')
  })

  it('says when the air quality level changes and what caused it', () => {
    const reporter = new ReadingReporter()
    reporter.observe(input(BASE))

    const next = reporter.observe(input({ ...BASE, recordedAt: T0 + 5 * MINUTE, radonShortBq: 160 }))

    expect(next.lines).toContain('Zone One: Air good → poor (radon 160 Bq/m³)')
  })

  it('says once when CO2 crosses the alert level and once when it drops back', () => {
    const reporter = new ReadingReporter()
    reporter.observe(input(BASE))

    const high = reporter.observe(input({ ...BASE, recordedAt: T0 + 5 * MINUTE, co2Ppm: 1040 }))
    const stillHigh = reporter.observe(input({ ...BASE, recordedAt: T0 + 10 * MINUTE, co2Ppm: 1100 }))
    const low = reporter.observe(input({ ...BASE, recordedAt: T0 + 15 * MINUTE, co2Ppm: 820 }))

    expect(high.lines).toContain('Zone One: CO2 above 1000 ppm (1040)')
    expect(stillHigh.lines.some((line) => line.includes('CO2 above'))).toBe(false)
    expect(low.lines).toContain('Zone One: CO2 back below 1000 ppm (820)')
  })

  it('says once when the battery is low and once when it recovers', () => {
    const reporter = new ReadingReporter()
    reporter.observe(input(BASE))

    const low = reporter.observe(input({ ...BASE, recordedAt: T0 + 5 * MINUTE, batteryPercent: 9 }))
    const stillLow = reporter.observe(input({ ...BASE, recordedAt: T0 + 10 * MINUTE, batteryPercent: 8 }))
    const ok = reporter.observe(input({ ...BASE, recordedAt: T0 + 15 * MINUTE, batteryPercent: 100 }))

    expect(low.lines).toContain('Zone One: battery low (9%)')
    expect(stillLow.lines.some((line) => line.includes('battery'))).toBe(false)
    expect(ok.lines).toContain('Zone One: battery ok (100%)')
  })

  it('says once when samples fall behind, then when a new one arrives', () => {
    const reporter = new ReadingReporter()
    reporter.observe(input(BASE))

    const onTime = reporter.observe(input(BASE, { now: T0 + 9 * MINUTE }))
    const late = reporter.observe(input(BASE, { now: T0 + 47 * MINUTE }))
    const stillLate = reporter.observe(input(BASE, { now: T0 + 52 * MINUTE }))
    const back = reporter.observe(input({ ...BASE, recordedAt: T0 + 85 * MINUTE }))

    expect(onTime.lines).toEqual([])
    expect(late.lines).toEqual(['Zone One: sample is 47 min old'])
    expect(stillLate.lines).toEqual([])
    expect(back.lines[0]).toBe('Zone One: new sample after 1 h 25 min')
  })

  it('waits longer before calling a slow monitor late', () => {
    const reporter = new ReadingReporter()
    reporter.observe(input(BASE))
    reporter.observe(input({ ...BASE, recordedAt: T0 + 60 * MINUTE }))

    const atNinety = reporter.observe(input(BASE, { now: T0 + 150 * MINUTE, reading: { active: true, recordedAt: T0 + 60 * MINUTE } }))

    expect(atNinety.lines).toEqual([])
  })

  it('ignores a sample with no timestamp', () => {
    const result = new ReadingReporter().observe(input({ ...BASE, recordedAt: undefined }))

    expect(result).toEqual({ lines: [], isNewSample: false })
  })
})

describe('qualityCause', () => {
  it('names radon on a radon monitor and the worst reading otherwise', () => {
    expect(qualityCause(PLUS, { active: true, radonShortBq: 160.4 })).toBe('radon 160 Bq/m³')
    expect(qualityCause(WAVE, { active: true, co2Ppm: 1200, vocPpb: 300 })).toBe('CO2 1200 ppm')
    expect(qualityCause(WAVE, { active: true, co2Ppm: 500, vocPpb: 300 })).toBe('VOC 300 ppb')
    expect(qualityCause(WAVE, { active: true })).toBeUndefined()
  })
})

describe('durations', () => {
  it('reads as minutes and hours', () => {
    expect(formatAgo(30_000)).toBe('just now')
    expect(formatAgo(-5 * MINUTE)).toBe('just now')
    expect(formatAgo(4 * MINUTE)).toBe('4 min ago')
    expect(formatDuration(60 * MINUTE)).toBe('1 h')
    expect(formatDuration(85 * MINUTE)).toBe('1 h 25 min')
  })
})
