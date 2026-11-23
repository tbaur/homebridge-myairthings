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

import type { AirQualityWord, NormalizedReading, SensorPlan } from '../types'

const RADON_FAIR_BQ = 100
const RADON_POOR_BQ = 150
const PM_FAIR = 10
const PM_POOR = 25
const VOC_FAIR_PPB = 250
const VOC_POOR_PPB = 2000
const CO2_FAIR_PPM = 800
const CO2_POOR_PPM = 1000

const RANK: Record<AirQualityWord, number> = {
  unknown: 0,
  good: 1,
  fair: 2,
  poor: 3,
}

export function airQuality(plan: SensorPlan, reading: NormalizedReading): AirQualityWord {
  if (plan.radonShort || plan.radonLong) {
    const becquerels = reading.radonShortBq ?? reading.radonLongBq
    return becquerels === undefined ? 'unknown' : band(becquerels, RADON_FAIR_BQ, RADON_POOR_BQ)
  }
  return worse([
    reading.co2Ppm === undefined ? undefined : band(reading.co2Ppm, CO2_FAIR_PPM, CO2_POOR_PPM),
    reading.pm25Micrograms === undefined ? undefined : band(reading.pm25Micrograms, PM_FAIR, PM_POOR),
    reading.vocPpb === undefined ? undefined : band(reading.vocPpb, VOC_FAIR_PPB, VOC_POOR_PPB),
  ])
}

/**
 * The reading that set the tile's level, for a log line: `radon 160 Bq/m³`.
 *
 * Without radon, several sensors can share the worst band. Given the previous
 * reading, the one whose own band changed is named, since that is the one
 * that moved the tile.
 */
export function qualityCause(
  plan: SensorPlan,
  reading: NormalizedReading,
  previous?: NormalizedReading,
): string | undefined {
  if (plan.radonShort || plan.radonLong) {
    const becquerels = reading.radonShortBq ?? reading.radonLongBq
    return becquerels === undefined ? undefined : `radon ${Math.round(becquerels)} Bq/m³`
  }
  const sensors = [
    { value: (r: NormalizedReading) => r.co2Ppm, fair: CO2_FAIR_PPM, poor: CO2_POOR_PPM, text: (v: number) => `CO2 ${Math.round(v)} ppm` },
    { value: (r: NormalizedReading) => r.pm25Micrograms, fair: PM_FAIR, poor: PM_POOR, text: (v: number) => `PM2.5 ${Math.round(v)} µg/m³` },
    { value: (r: NormalizedReading) => r.vocPpb, fair: VOC_FAIR_PPB, poor: VOC_POOR_PPB, text: (v: number) => `VOC ${Math.round(v)} ppb` },
  ]
  const candidates: { level: AirQualityWord, changed: boolean, text: string }[] = []
  for (const sensor of sensors) {
    const value = sensor.value(reading)
    if (value === undefined) {
      continue
    }
    const level = band(value, sensor.fair, sensor.poor)
    const before = previous === undefined ? undefined : sensor.value(previous)
    const changed = before === undefined || band(before, sensor.fair, sensor.poor) !== level
    candidates.push({ level, changed, text: sensor.text(value) })
  }
  let worst: AirQualityWord = 'unknown'
  for (const candidate of candidates) {
    if (RANK[candidate.level] > RANK[worst]) {
      worst = candidate.level
    }
  }
  const atWorst = candidates.filter((candidate) => candidate.level === worst)
  const changedAtWorst = atWorst.find((candidate) => candidate.changed)
  if (changedAtWorst !== undefined) {
    return changedAtWorst.text
  }
  // Every sensor at the worst level held still, so the tile improved: name the one that dropped.
  return (candidates.find((candidate) => candidate.changed) ?? atWorst[0])?.text
}

function band(value: number, fairAt: number, poorAt: number): AirQualityWord {
  if (value >= poorAt) {
    return 'poor'
  }
  if (value >= fairAt) {
    return 'fair'
  }
  return 'good'
}

function worse(levels: readonly (AirQualityWord | undefined)[]): AirQualityWord {
  let current: AirQualityWord = 'unknown'
  for (const level of levels) {
    if (level !== undefined && RANK[level] > RANK[current]) {
      current = level
    }
  }
  return current
}
