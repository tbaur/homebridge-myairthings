/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 */

import { airQuality } from '../../../src/readings/quality'
import { hasPublishableSensor, planFor, unknownSensorNames } from '../../../src/readings/plan'
import { isFresh, normalizeSample, parseRecordedAt, sampleAge } from '../../../src/readings/sample'
import { convertSensor, microgramsToPpb, ppbToMicrograms } from '../../../src/readings/units'
import { FUTURE_SKEW_MS, STALE_AFTER_MS } from '../../../src/settings'
import type { SensorPlan } from '../../../src/types'

const NOW = Date.parse('2026-01-01T00:00:00Z')

function plan(sensors: string[]): SensorPlan {
  return planFor(sensors)
}

describe('sensor plan', () => {
  it('gives View Plus and View Radon the same radon tile and only Plus the extra pollutants', () => {
    const plus = plan(['radonShortTermAvg', 'temp', 'humidity', 'pressure', 'co2', 'voc', 'pm1', 'pm25'])
    const radon = plan(['radonShortTermAvg', 'temp', 'humidity'])

    expect(plus.radonShort).toBe(true)
    expect(radon.radonShort).toBe(true)
    expect(plus.carbonDioxide).toBe(true)
    expect(plus.pm25).toBe(true)
    expect(plus.voc).toBe(true)
    expect(plus.pressure).toBe(true)
    expect(radon.carbonDioxide).toBe(false)
    expect(radon.pm25).toBe(false)
    expect(hasPublishableSensor(plan([]))).toBe(false)
  })

  it('names sensors it does not map', () => {
    expect(unknownSensorNames(['temp', 'virusRisk'])).toEqual(['virusRisk'])
  })
})

describe('air quality', () => {
  const plus = plan(['radonShortTermAvg', 'co2', 'voc', 'pm25', 'humidity'])
  const radon = plan(['radonShortTermAvg', 'humidity'])
  const noRadon = plan(['co2', 'voc'])

  it('uses radon alone when the monitor has a radon sensor', () => {
    const reading = { active: true, radonShortBq: 40, co2Ppm: 2000, vocPpb: 3000, humidityPercent: 10 }

    expect(airQuality(plus, reading)).toBe('good')
    expect(airQuality(radon, reading)).toBe('good')
    expect(airQuality(plus, { active: true, radonShortBq: 120 })).toBe('fair')
    expect(airQuality(plus, { active: true, radonShortBq: 150 })).toBe('poor')
  })

  it('stays unknown when radon has not arrived yet', () => {
    expect(airQuality(plus, { active: true, co2Ppm: 2000 })).toBe('unknown')
  })

  it('uses the worst pollutant when the monitor has no radon', () => {
    expect(airQuality(noRadon, { active: true, co2Ppm: 500, vocPpb: 300 })).toBe('fair')
    expect(airQuality(noRadon, { active: true })).toBe('unknown')
  })
})

describe('units', () => {
  it('converts the units the API actually sends', () => {
    expect(convertSensor({ sensorType: 'temp', value: 68, unit: 'f' })?.temperatureC).toBeCloseTo(20)
    expect(convertSensor({ sensorType: 'temp', value: 21, unit: 'c' })?.temperatureC).toBe(21)
    expect(convertSensor({ sensorType: 'humidity', value: 40, unit: '%' })?.humidityPercent).toBe(40)
    expect(convertSensor({ sensorType: 'radonShortTermAvg', value: 2, unit: 'pci' })?.radonShortBq).toBe(74)
    expect(convertSensor({ sensorType: 'radonLongTermAvg', value: 10, unit: 'bq' })?.radonLongBq).toBe(10)
    expect(convertSensor({ sensorType: 'co2', value: 400, unit: 'ppm' })?.co2Ppm).toBe(400)
    expect(convertSensor({ sensorType: 'pressure', value: 101325, unit: 'pa' })?.pressureHpa).toBeCloseTo(1013.25)
    expect(convertSensor({ sensorType: 'pressure', value: 29.9, unit: 'inhg' })?.pressureHpa).toBeGreaterThan(1000)
    expect(convertSensor({ sensorType: 'pressure', value: 1013, unit: 'mbar' })?.pressureHpa).toBe(1013)
    expect(convertSensor({ sensorType: 'voc', value: 250, unit: 'ppb' })?.vocPpb).toBe(250)
    expect(convertSensor({ sensorType: 'voc', value: 250, unit: 'ppb' })?.vocMicrograms).toBeCloseTo(ppbToMicrograms(250))
    expect(convertSensor({ sensorType: 'voc', value: 12, unit: 'ugm3' })?.vocMicrograms).toBe(12)
    expect(convertSensor({ sensorType: 'voc', value: 12, unit: 'ugm3' })?.vocPpb).toBeCloseTo(microgramsToPpb(12))
    expect(convertSensor({ sensorType: 'voc', value: 12, unit: 'ppm' })).toBeUndefined()
    expect(convertSensor({ sensorType: 'radonShortTermAvg', value: 1, unit: 'ppm' })).toBeUndefined()
    expect(convertSensor({ sensorType: 'mold', value: 1, unit: 'count' })).toBeUndefined()
    expect(convertSensor({ sensorType: 'pm25', value: 3, unit: 'mgpc' })?.pm25Micrograms).toBe(3)
    expect(convertSensor({ sensorType: 'pm1', value: 1, unit: 'ug/m3' })?.pm1Micrograms).toBe(1)
    expect(convertSensor({ sensorType: 'mold', value: 2, unit: '' })?.mold).toBe(2)
    expect(convertSensor({ sensorType: 'lux', value: 10, unit: 'lux' })?.lux).toBe(10)
    expect(convertSensor({ sensorType: 'sla', value: 35, unit: 'db' })?.soundDb).toBe(35)
    expect(convertSensor({ sensorType: 'temp', value: 1, unit: 'k' })).toBeUndefined()
    expect(convertSensor({ sensorType: 'pm25', value: 1, unit: 'ppm' })).toBeUndefined()
  })
})

describe('samples', () => {
  it('treats a timestamp without a zone as UTC and marks an old sample inactive', () => {
    expect(parseRecordedAt('2026-01-01T00:00:00')).toBe(NOW)
    const fresh = normalizeSample({
      serialNumber: '2960000001',
      recordedAt: NOW,
      batteryPercent: 80,
      sensors: [{ sensorType: 'temp', value: 21, unit: 'c' }, { sensorType: 'mystery', value: 1, unit: 'x' }],
    }, NOW)
    expect(fresh.reading.active).toBe(true)
    expect(fresh.reading.temperatureC).toBe(21)
    expect(fresh.ignored).toEqual(['2960000001\tmystery\tx'])

    expect(isFresh(NOW - STALE_AFTER_MS, NOW)).toBe(true)
    expect(isFresh(NOW - STALE_AFTER_MS - 1, NOW)).toBe(false)
    expect(isFresh(NOW + FUTURE_SKEW_MS, NOW)).toBe(true)
    expect(isFresh(NOW + FUTURE_SKEW_MS + 1, NOW)).toBe(false)
  })

  it('writes a sample age a person can read', () => {
    expect(sampleAge(undefined, NOW)).toBe('-')
    expect(sampleAge(NOW + 90_000, NOW)).toBe('0m')
    expect(sampleAge(NOW - 59_999, NOW)).toBe('0m')
    expect(sampleAge(NOW - 10 * 60_000, NOW)).toBe('10m')
    expect(sampleAge(NOW - 192 * 60_000, NOW)).toBe('3h12m')
  })
})
