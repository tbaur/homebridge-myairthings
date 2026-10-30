/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * One monitor, with real HAP services and no network.
 */

import { Accessory, Characteristic, Service, uuid } from '@homebridge/hap-nodejs'
import type { API, HAP, Logging, PlatformAccessory } from 'homebridge'

import { MOLD, PM1, PRESSURE, RADON_LONG, RADON_SHORT, SOUND, VOC_PPB } from '../../../src/devices/eve'
import type { AccessoryHost } from '../../../src/devices/host'
import { MonitorAccessory } from '../../../src/devices/monitor'
import { STALE_AFTER_MS } from '../../../src/settings'
import type { NormalizedReading } from '../../../src/types'

const SERIAL = '2960000001'

function reading(overrides: Partial<NormalizedReading> = {}): NormalizedReading {
  return {
    active: true,
    recordedAt: Date.now() - STALE_AFTER_MS + 1_000,
    radonShortBq: 40,
    radonLongBq: 30,
    temperatureC: 21,
    humidityPercent: 40,
    pressureHpa: 1013,
    co2Ppm: 500,
    vocPpb: 10,
    vocMicrograms: 20,
    pm25Micrograms: 3,
    pm1Micrograms: 1,
    mold: 2,
    soundDb: 30,
    lux: 10,
    batteryPercent: 9,
    ...overrides,
  }
}

function host(expired: string[], lines: string[] = []): AccessoryHost {
  const hap = { Service, Characteristic, uuid } as unknown as HAP
  return {
    api: { hap } as unknown as API,
    hap,
    log: {
      info: (message: string) => { lines.push(`info ${message}`) },
      warn: () => undefined,
      error: () => undefined,
      debug: () => undefined,
    } as unknown as Logging,
    pluginVersion: '0.0.0',
    co2DetectedPpm: 1000,
    noteSampleExpired: (serialNumber: string) => {
      expired.push(serialNumber)
    },
  }
}

function accessory(): PlatformAccessory {
  return new Accessory('Zone One', uuid.generate(`homebridge-myairthings:${SERIAL}`)) as unknown as PlatformAccessory
}

describe('MonitorAccessory', () => {
  const expired: string[] = []

  beforeEach(() => {
    expired.splice(0)
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('removes a characteristic the monitor stops reporting', () => {
    const device = accessory()
    const monitor = new MonitorAccessory({
      host: host(expired),
      accessory: device,
      displayName: 'Zone One',
      model: 'View Plus',
      serialNumber: SERIAL,
      unavailable: false,
    })
    const sensors = ['radonShortTermAvg', 'radonLongTermAvg', 'temp', 'humidity', 'pressure', 'co2', 'voc', 'pm25', 'pm1', 'mold', 'sla', 'lux']
    monitor.sync({ sensors, battery: true, reading: reading() })
    const air = device.getService(Service.AirQualitySensor)
    const temperature = device.getService(Service.TemperatureSensor)
    expect(air?.testCharacteristic('PM2.5 Density')).toBe(true)
    expect(air?.testCharacteristic(VOC_PPB)).toBe(true)
    expect(air?.testCharacteristic(RADON_SHORT)).toBe(true)
    expect(air?.testCharacteristic(RADON_LONG)).toBe(true)
    expect(air?.testCharacteristic(PM1)).toBe(true)
    expect(air?.testCharacteristic(MOLD)).toBe(true)
    expect(air?.testCharacteristic(SOUND)).toBe(true)
    expect(temperature?.testCharacteristic(PRESSURE)).toBe(true)
    expect(monitor.isLive()).toBe(true)

    monitor.sync({ sensors: ['temp'], battery: false, reading: reading({ radonShortBq: undefined, pm25Micrograms: undefined }) })

    expect(air?.testCharacteristic('PM2.5 Density')).toBe(false)
    expect(air?.testCharacteristic('VOC Density')).toBe(false)
    expect(air?.testCharacteristic(VOC_PPB)).toBe(false)
    expect(air?.testCharacteristic(RADON_SHORT)).toBe(false)
    expect(air?.testCharacteristic(RADON_LONG)).toBe(false)
    expect(air?.testCharacteristic(PM1)).toBe(false)
    expect(air?.testCharacteristic(MOLD)).toBe(false)
    expect(air?.testCharacteristic(SOUND)).toBe(false)
    expect(temperature?.testCharacteristic(PRESSURE)).toBe(false)
    expect(air?.testCharacteristic(PRESSURE)).toBe(false)
  })

  it('does not publish radon until a sample includes it', () => {
    const device = accessory()
    const lines: string[] = []
    const monitor = new MonitorAccessory({
      host: host(expired, lines),
      accessory: device,
      displayName: 'Zone One',
      model: 'View Plus',
      serialNumber: SERIAL,
      unavailable: false,
    })
    monitor.sync({
      sensors: ['radonShortTermAvg'],
      battery: false,
      reading: reading({ radonShortBq: undefined, active: true }),
    })
    const air = device.getService(Service.AirQualitySensor)
    expect(air?.testCharacteristic(RADON_SHORT)).toBe(false)

    monitor.sync({
      sensors: ['radonShortTermAvg'],
      battery: false,
      reading: reading({ radonShortBq: 40 }),
    })
    expect(air?.getCharacteristic(RADON_SHORT)?.value).toBe(40)

    monitor.sync({
      sensors: ['radonShortTermAvg'],
      battery: false,
      reading: reading({ radonShortBq: undefined, active: false, recordedAt: undefined }),
    })
    expect(air?.getCharacteristic(RADON_SHORT)?.value).toBe(40)
    expect(lines).toEqual(['info Zone One inactive: timestamp missing'])
  })

  it('does not publish pressure until a sample includes it', () => {
    const device = accessory()
    const monitor = new MonitorAccessory({
      host: host(expired),
      accessory: device,
      displayName: 'Zone One',
      model: 'View Plus',
      serialNumber: SERIAL,
      unavailable: false,
    })
    monitor.sync({ sensors: ['pressure'], battery: false, reading: reading({ pressureHpa: undefined }) })
    const air = device.getService(Service.AirQualitySensor)
    expect(air?.testCharacteristic(PRESSURE)).toBe(false)
    monitor.sync({ sensors: ['pressure'], battery: false, reading: reading({ pressureHpa: 1000 }) })
    expect(air?.getCharacteristic(PRESSURE)?.value).toBe(1000)
  })

  it('moves pressure off air quality when a temperature service appears', () => {
    const device = accessory()
    const monitor = new MonitorAccessory({
      host: host(expired),
      accessory: device,
      displayName: 'Zone One',
      model: 'View Plus',
      serialNumber: SERIAL,
      unavailable: false,
    })
    monitor.sync({ sensors: ['pressure'], battery: false, reading: reading({ pressureHpa: 1000 }) })
    const air = device.getService(Service.AirQualitySensor)
    expect(air?.testCharacteristic(PRESSURE)).toBe(true)

    monitor.sync({ sensors: ['temp', 'pressure'], battery: false, reading: reading({ pressureHpa: 1010 }) })
    const temperature = device.getService(Service.TemperatureSensor)
    expect(air?.testCharacteristic(PRESSURE)).toBe(false)
    expect(temperature?.testCharacteristic(PRESSURE)).toBe(true)
    const pressure = temperature?.getCharacteristic(PRESSURE)
    expect(pressure?.value).toBe(1010)
  })

  it('goes inactive when the sample crosses three hours', () => {
    const device = accessory()
    const monitor = new MonitorAccessory({
      host: host(expired),
      accessory: device,
      displayName: 'Zone One',
      model: 'View Plus',
      serialNumber: SERIAL,
      unavailable: false,
    })
    monitor.sync({
      sensors: ['radonShortTermAvg', 'temp'],
      battery: false,
      reading: reading(),
    })
    const air = device.getService(Service.AirQualitySensor)
    expect(air?.getCharacteristic(Characteristic.StatusActive).value).toBe(true)

    jest.advanceTimersByTime(1_000)

    expect(air?.getCharacteristic(Characteristic.StatusActive).value).toBe(false)
    expect(expired).toEqual([SERIAL])
    expect(monitor.isLive()).toBe(false)
  })

  it('marks an already old sample inactive without waiting', () => {
    const device = accessory()
    const monitor = new MonitorAccessory({
      host: host(expired),
      accessory: device,
      displayName: 'Zone One',
      model: 'View Plus',
      serialNumber: SERIAL,
      unavailable: false,
    })
    monitor.sync({
      sensors: ['temp'],
      battery: true,
      reading: reading({ recordedAt: Date.now() - STALE_AFTER_MS - 1, batteryPercent: 9 }),
    })
    const air = device.getService(Service.AirQualitySensor)
    expect(air?.getCharacteristic(Characteristic.StatusActive).value).toBe(false)
    expect(expired).toEqual([])
    const battery = device.getService(Service.Battery)
    expect(battery?.getCharacteristic(Characteristic.StatusLowBattery).value)
      .toBe(Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW)
  })
})
