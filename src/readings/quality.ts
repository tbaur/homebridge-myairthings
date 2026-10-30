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
