/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * Drives the platform through a stand-in transport and real HAP services.
 */

import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type * as Sqlite from 'node:sqlite'

import { Accessory, Categories, Characteristic, Service, uuid } from '@homebridge/hap-nodejs'
import type { API, Logging, PlatformAccessory, PlatformConfig } from 'homebridge'

import type { JsonRequest } from '../../src/api/http'
import { requestJson } from '../../src/api/http'
import {
  AUTH_FAILED_SUMMARY,
  CLOUD_OFFLINE_SUMMARY,
  PAGERDUTY_STARTUP_LOG,
  staleSignalName,
  staleSummary,
} from '../../src/airthings-signals'
import { PRESSURE, RADON_SHORT } from '../../src/devices/eve'
import { AirthingsPlatform } from '../../src/platform'
import { PLUGIN_NAME, STALE_AFTER_MS } from '../../src/settings'
import { fakeClientId, fakeClientSecret } from '../helpers/secrets'

jest.mock('../../src/api/http', () => {
  const actual = jest.requireActual('../../src/api/http') as typeof import('../../src/api/http')
  return { ...actual, requestJson: jest.fn() }
})

const transport = requestJson as jest.MockedFunction<typeof requestJson>
const ACCOUNT = '00000000-0000-0000-0000-000000000001'
const PLUS = '2960000001'
const RADON = '2989000001'
const sqlite = typeof process.getBuiltinModule === 'function'
  ? process.getBuiltinModule('node:sqlite') as typeof Sqlite | undefined
  : undefined
const describeWithSqlite = sqlite ? describe : describe.skip

interface SignalRow {
  plugin: string
  signal: string
  active: number
  severity: string
  summary: string
}

class TestAccessory extends Accessory {
  context: Record<string, unknown> = {}

  updateDisplayName(name: string): void {
    this.displayName = name
  }
}

function sample(serial: string, sensors: unknown[]): unknown {
  return { serialNumber: serial, recorded: new Date().toISOString(), batteryPercentage: 9, sensors }
}

describe('AirthingsPlatform', () => {
  const devices: unknown[] = []
  const registered: TestAccessory[] = []
  const removed: TestAccessory[] = []
  const lines: string[] = []

  function bridge(storagePath = '/tmp/airthings-test'): API & { emit(event: string): void } {
    const listeners = new Map<string, Array<() => void>>()
    return {
      hap: { Service, Characteristic, Categories: { SENSOR: Categories.SENSOR }, uuid },
      platformAccessory: TestAccessory,
      user: { storagePath: () => storagePath },
      on: (event: string, listener: () => void) => {
        const list = listeners.get(event) ?? []
        list.push(listener)
        listeners.set(event, list)
      },
      emit: (event: string) => {
        for (const listener of listeners.get(event) ?? []) {
          listener()
        }
      },
      registerPlatformAccessories: (_plugin: string, _platform: string, accessories: TestAccessory[]) => {
        registered.push(...accessories)
      },
      unregisterPlatformAccessories: (_plugin: string, _platform: string, accessories: TestAccessory[]) => {
        removed.push(...accessories)
      },
    } as unknown as API & { emit(event: string): void }
  }

  function log(): Logging {
    return {
      info: (message: string) => lines.push(`info ${message}`),
      warn: (message: string) => lines.push(`warn ${message}`),
      error: (message: string) => lines.push(`error ${message}`),
      debug: (message: string) => lines.push(`debug ${message}`),
    } as unknown as Logging
  }

  beforeEach(() => {
    devices.splice(0, devices.length,
      {
        serialNumber: PLUS,
        name: 'Zone One',
        type: 'VIEW_PLUS',
        sensors: ['radonShortTermAvg', 'temp', 'humidity', 'pressure', 'co2', 'voc', 'pm25', 'pm1'],
      },
      {
        serialNumber: RADON,
        name: 'Zone Two',
        type: 'VIEW_RADON',
        sensors: ['radonShortTermAvg', 'temp', 'humidity'],
      })
    registered.splice(0)
    removed.splice(0)
    lines.splice(0)
    transport.mockImplementation(async (request: JsonRequest) => {
      if (request.url.endsWith('/token')) {
        return { status: 200, body: JSON.stringify({ access_token: 'test-token', token_type: 'Bearer', expires_in: 3600 }), headers: {} }
      }
      if (request.url.endsWith('/accounts')) {
        return { status: 200, body: JSON.stringify({ accounts: [{ id: ACCOUNT }] }), headers: {} }
      }
      if (request.url.endsWith('/devices')) {
        return { status: 200, body: JSON.stringify({ devices }), headers: {} }
      }
      return {
        status: 200,
        headers: {},
        body: JSON.stringify({
          hasNext: false,
          results: [
            sample(PLUS, [
              { sensorType: 'radonShortTermAvg', value: 40, unit: 'bq' },
              { sensorType: 'co2', value: 1500, unit: 'ppm' },
              { sensorType: 'temp', value: 21, unit: 'c' },
              { sensorType: 'humidity', value: 40, unit: 'pct' },
              { sensorType: 'pressure', value: 1013.4, unit: 'hpa' },
              { sensorType: 'voc', value: 100, unit: 'ppb' },
              { sensorType: 'pm25', value: 3, unit: 'ugm3' },
              { sensorType: 'pm1', value: 1, unit: 'ugm3' },
            ]),
            sample(RADON, [
              { sensorType: 'radonShortTermAvg', value: 40, unit: 'bq' },
              { sensorType: 'temp', value: 18, unit: 'c' },
              { sensorType: 'humidity', value: 45, unit: 'pct' },
            ]),
          ],
        }),
      }
    })
  })

  it('publishes both monitors as sensor accessories whose tile is radon', async () => {
    const api = bridge()
    const platform = new AirthingsPlatform(log(), {
      platform: 'MyAirthings',
      name: 'MyAirthings',
      clientId: fakeClientId(),
      clientSecret: fakeClientSecret(),
      debug: true,
    }, api)
    api.emit('didFinishLaunching')
    await platform.settled()

    expect(registered).toHaveLength(2)
    expect(registered.every((accessory) => accessory.category === Categories.SENSOR)).toBe(true)
    const plus = registered.find((accessory) => accessory.displayName === 'Zone One')
    const radon = registered.find((accessory) => accessory.displayName === 'Zone Two')
    if (plus === undefined || radon === undefined) {
      throw new Error(lines.join('\n'))
    }

    const plusAir = plus.getService(Service.AirQualitySensor)
    const radonAir = radon.getService(Service.AirQualitySensor)
    if (plusAir === undefined || radonAir === undefined) {
      throw new Error('missing air quality service')
    }
    expect(plusAir.getCharacteristic(Characteristic.AirQuality).value).toBe(Characteristic.AirQuality.GOOD)
    expect(radonAir.getCharacteristic(Characteristic.AirQuality).value).toBe(Characteristic.AirQuality.GOOD)
    expect(plusAir.getCharacteristic(RADON_SHORT)?.value).toBe(40)
    expect(radonAir.getCharacteristic(RADON_SHORT)?.value).toBe(40)
    expect(plus.getService(Service.CarbonDioxideSensor)).toBeDefined()
    expect(radon.getService(Service.CarbonDioxideSensor)).toBeUndefined()
    const carbon = plus.getService(Service.CarbonDioxideSensor)
    expect(carbon?.getCharacteristic(Characteristic.CarbonDioxideDetected).value)
      .toBe(Characteristic.CarbonDioxideDetected.CO2_LEVELS_ABNORMAL)
    const temperature = plus.getService(Service.TemperatureSensor)
    expect(temperature?.testCharacteristic(PRESSURE)).toBe(true)
    expect(temperature?.testCharacteristic(RADON_SHORT)).toBe(false)
    expect(plus.getService(Service.Battery)?.getCharacteristic(Characteristic.StatusLowBattery).value)
      .toBe(Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW)
    expect(lines.some((line) => line.includes('View Plus'))).toBe(true)
    expect(lines).toContainEqual(expect.stringMatching(new RegExp(`^info ${PLUS} radon=40 co2=1500 temp=21 `)))
  })

  it('does not log readings when the debug setting is off', async () => {
    const api = bridge()
    const platform = new AirthingsPlatform(log(), {
      platform: 'MyAirthings',
      name: 'MyAirthings',
      clientId: fakeClientId(),
      clientSecret: fakeClientSecret(),
    }, api)
    api.emit('didFinishLaunching')
    await platform.settled()
    expect(registered).toHaveLength(2)
    expect(lines.some((line) => line.includes('radon='))).toBe(false)
    api.emit('shutdown')
  })

  it('marks a known monitor inactive when a poll has no sample for it', async () => {
    jest.useFakeTimers()
    try {
      const current = transport.getMockImplementation()
      let sensorReads = 0
      transport.mockImplementation(async (request) => {
        if (request.url.includes('/sensors')) {
          sensorReads += 1
          if (sensorReads > 1) {
            return { status: 200, headers: {}, body: JSON.stringify({ hasNext: false, results: [] }) }
          }
        }
        return current?.(request) ?? { status: 500, body: '', headers: {} }
      })
      const api = bridge()
      const platform = new AirthingsPlatform(log(), {
        platform: 'MyAirthings',
        name: 'MyAirthings',
        clientId: fakeClientId(),
        clientSecret: fakeClientSecret(),
      }, api)
      api.emit('didFinishLaunching')
      await platform.settled()
      await jest.advanceTimersByTimeAsync(300_000)
      await platform.settled()

      const air = registered.find((item) => item.displayName === 'Zone One')?.getService(Service.AirQualitySensor)
      expect(air?.getCharacteristic(RADON_SHORT)?.value).toBe(40)
      expect(air?.getCharacteristic(Characteristic.StatusActive).value).toBe(false)
      expect(lines).toContain('info Zone One inactive: no sample from Airthings')
      api.emit('shutdown')
    } finally {
      jest.useRealTimers()
    }
  })

  it('waits the configured interval after a fault in the plugin, not a fixed 30 seconds', async () => {
    jest.useFakeTimers()
    try {
      let sensorReads = 0
      const current = transport.getMockImplementation()
      transport.mockImplementation(async (request) => {
        if (request.url.includes('/sensors')) {
          sensorReads += 1
        }
        return current?.(request) ?? { status: 500, body: '', headers: {} }
      })
      const api = bridge()
      api.registerPlatformAccessories = () => {
        throw new Error('bridge refused')
      }
      const platform = new AirthingsPlatform(log(), {
        platform: 'MyAirthings',
        name: 'MyAirthings',
        clientId: fakeClientId(),
        clientSecret: fakeClientSecret(),
        refreshInterval: 600,
      }, api)
      api.emit('didFinishLaunching')
      await platform.settled()
      expect(lines).toContain('error poll failed: bridge refused')
      expect(sensorReads).toBe(1)

      await jest.advanceTimersByTimeAsync(599_000)
      expect(sensorReads).toBe(1)
      await jest.advanceTimersByTimeAsync(1_000)
      await platform.settled()
      expect(sensorReads).toBe(2)
      api.emit('shutdown')
    } finally {
      jest.useRealTimers()
    }
  })

  it('clears the poll and every stale timer on shutdown', async () => {
    jest.useFakeTimers()
    try {
      const api = bridge()
      const platform = new AirthingsPlatform(log(), {
        platform: 'MyAirthings',
        name: 'MyAirthings',
        clientId: fakeClientId(),
        clientSecret: fakeClientSecret(),
      }, api)
      api.emit('didFinishLaunching')
      await platform.settled()
      const running = jest.getTimerCount()
      api.emit('shutdown')
      // The next poll and one stale timer per monitor. HAP keeps timers of its own.
      expect(running - jest.getTimerCount()).toBe(3)
      const polls = transport.mock.calls.length
      await jest.advanceTimersByTimeAsync(STALE_AFTER_MS)
      expect(transport.mock.calls.length).toBe(polls)
      expect(lines.some((line) => line.includes('inactive'))).toBe(false)
    } finally {
      jest.useRealTimers()
    }
  })

  it('keeps the newer sample when an older one reaches three hours', async () => {
    jest.useFakeTimers()
    try {
      let samples = 0
      transport.mockImplementation(async (request: JsonRequest) => {
        if (request.url.endsWith('/token')) {
          return { status: 200, body: JSON.stringify({ access_token: 'test-token', token_type: 'Bearer', expires_in: 3600 }), headers: {} }
        }
        if (request.url.endsWith('/accounts')) {
          return { status: 200, body: JSON.stringify({ accounts: [{ id: ACCOUNT }] }), headers: {} }
        }
        if (request.url.endsWith('/devices')) {
          return { status: 200, body: JSON.stringify({ devices }), headers: {} }
        }
        const radon = samples === 0 ? 40 : 80
        samples += 1
        return {
          status: 200,
          headers: {},
          body: JSON.stringify({
            hasNext: false,
            results: [{
              serialNumber: PLUS,
              recorded: new Date().toISOString(),
              sensors: [{ sensorType: 'radonShortTermAvg', value: radon, unit: 'bq' }],
            }],
          }),
        }
      })
      const api = bridge()
      const platform = new AirthingsPlatform(log(), {
        platform: 'MyAirthings',
        name: 'MyAirthings',
        clientId: fakeClientId(),
        clientSecret: fakeClientSecret(),
        refreshInterval: 301,
      }, api)
      api.emit('didFinishLaunching')
      await platform.settled()
      await jest.advanceTimersByTimeAsync(STALE_AFTER_MS)
      await platform.settled()

      const plus = registered.find((item) => item.displayName === 'Zone One')
      const air = plus?.getService(Service.AirQualitySensor)
      expect(air?.getCharacteristic(RADON_SHORT)?.value).toBe(80)
      expect(air?.getCharacteristic(Characteristic.StatusActive)?.value).toBe(true)
    } finally {
      jest.useRealTimers()
    }
  })

  it('marks a restored monitor inactive after three unreachable polls', async () => {
    jest.useFakeTimers()
    try {
      transport.mockImplementation(async () => ({ status: 500, body: '', headers: {} }))
      const api = bridge()
      const cached = new TestAccessory('Zone One', uuid.generate('restored'))
      cached.context = {
        serialNumber: PLUS,
        apiName: 'Zone One',
        deviceType: 'VIEW_PLUS',
        sensors: ['radonShortTermAvg'],
        reportsBattery: false,
        recordedAt: Date.now(),
      }
      const air = cached.addService(Service.AirQualitySensor)
      air.setCharacteristic(Characteristic.StatusActive, true)
      const platform = new AirthingsPlatform(log(), {
        platform: 'MyAirthings',
        name: 'MyAirthings',
        clientId: fakeClientId(),
        clientSecret: fakeClientSecret(),
      }, api)
      platform.configureAccessory(cached as unknown as PlatformAccessory)
      api.emit('didFinishLaunching')
      await platform.settled()
      await jest.advanceTimersByTimeAsync(300_000)
      await platform.settled()
      await jest.advanceTimersByTimeAsync(300_000)
      await platform.settled()
      expect(air.getCharacteristic(Characteristic.StatusActive).value).toBe(false)
      expect(lines.some((line) => line.includes('Zone One inactive: three unreachable polls'))).toBe(true)
    } finally {
      jest.useRealTimers()
    }
  })

  it('does not remove a monitor whose sensor list becomes empty', async () => {
    jest.useFakeTimers()
    try {
      let deviceLists = 0
      const current = transport.getMockImplementation()
      transport.mockImplementation(async (request) => {
        if (request.url.endsWith('/devices')) {
          deviceLists += 1
          if (deviceLists > 1) {
            return {
              status: 200,
              headers: {},
              body: JSON.stringify({
                devices: devices.map((device) => ({ ...(device as object), sensors: [] })),
              }),
            }
          }
        }
        return current?.(request) ?? { status: 500, body: '', headers: {} }
      })
      const api = bridge()
      const platform = new AirthingsPlatform(log(), {
        platform: 'MyAirthings',
        name: 'MyAirthings',
        clientId: fakeClientId(),
        clientSecret: fakeClientSecret(),
        refreshInterval: 301,
      }, api)
      api.emit('didFinishLaunching')
      await platform.settled()
      await jest.advanceTimersByTimeAsync(301_000 * 6)
      await platform.settled()
      expect(deviceLists).toBeGreaterThan(1)
      expect(removed).toHaveLength(0)
      expect(registered).toHaveLength(2)
    } finally {
      jest.useRealTimers()
    }
  })

  it('shows a restored monitor with no sample time as inactive', async () => {
    const api = bridge()
    const cached = new TestAccessory('Zone One', uuid.generate('restored-no-time'))
    cached.context = {
      serialNumber: PLUS,
      apiName: 'Zone One',
      deviceType: 'VIEW_PLUS',
      sensors: ['radonShortTermAvg'],
      reportsBattery: false,
    }
    const air = cached.addService(Service.AirQualitySensor)
    air.setCharacteristic(Characteristic.StatusActive, true)
    const platform = new AirthingsPlatform(log(), {
      platform: 'MyAirthings',
      name: 'MyAirthings',
      clientId: fakeClientId(),
      clientSecret: fakeClientSecret(),
    }, api)
    platform.configureAccessory(cached as unknown as PlatformAccessory)
    api.emit('didFinishLaunching')
    expect(air.getCharacteristic(Characteristic.StatusActive).value).toBe(false)
    expect(lines.some((line) => line.includes('Zone One inactive: timestamp missing'))).toBe(true)
    await platform.settled()
  })

  it('does not start when credentials are missing', () => {
    const api = bridge()
    const cached = new TestAccessory('Zone One', uuid.generate('cached'))
    const platform = new AirthingsPlatform(log(), { platform: 'MyAirthings', name: 'MyAirthings' }, api)
    platform.configureAccessory(cached as unknown as PlatformAccessory)
    api.emit('didFinishLaunching')

    expect(registered).toHaveLength(0)
    expect(lines.some((line) => line.includes('not started'))).toBe(true)
    expect(lines.some((line) => line.includes('inactive'))).toBe(true)
  })

  it('refuses a second platform and a config that is not usable', () => {
    const api = bridge()
    const creds = {
      platform: 'MyAirthings',
      name: 'MyAirthings',
      clientId: fakeClientId(),
      clientSecret: fakeClientSecret(),
      diagnosticsInterval: 30,
    }
    const first = new AirthingsPlatform(log(), creds, api)
    new AirthingsPlatform(log(), creds, api)
    expect(first).toBeInstanceOf(AirthingsPlatform)
    api.emit('didFinishLaunching')
    expect(lines.some((line) => line.includes('platform name "MyAirthings" is disabled'))).toBe(true)
    expect(lines.some((line) => line.includes('Diagnostics start: healthy | devices 0/0 | rest connecting'))).toBe(true)

    const bad = bridge()
    lines.splice(0)
    new AirthingsPlatform(log(), { platform: 'MyAirthings', name: 1, clientId: 'id', clientSecret: 'secret' } as unknown as PlatformConfig, bad)
    bad.emit('didFinishLaunching')
    expect(lines.some((line) => line.includes('name must be a string'))).toBe(true)
    expect(lines.some((line) => line.includes('platform disabled'))).toBe(true)
  })

  it('does not log or create a signal store when the setting is off', async () => {
    const storagePath = mkdtempSync(join(tmpdir(), 'airthings-signals-'))
    try {
      const api = bridge(storagePath)
      const platform = new AirthingsPlatform(log(), {
        platform: 'MyAirthings',
        name: 'MyAirthings',
        clientId: fakeClientId(),
        clientSecret: fakeClientSecret(),
      }, api)
      api.emit('didFinishLaunching')
      await platform.settled()
      expect(lines.some((line) => line.includes('homebridge-pagerduty'))).toBe(false)
      expect(existsSync(join(storagePath, 'homebridge-pagerduty'))).toBe(false)
      api.emit('shutdown')
    } finally {
      rmSync(storagePath, { recursive: true, force: true })
    }
  })

  it('does not log signals when the config cannot be used', () => {
    const storagePath = mkdtempSync(join(tmpdir(), 'airthings-signals-'))
    try {
      const api = bridge(storagePath)
      new AirthingsPlatform(log(), {
        platform: 'MyAirthings',
        name: 1,
        clientId: 'id',
        clientSecret: 'secret',
        pagerdutySignals: true,
      } as unknown as PlatformConfig, api)
      api.emit('didFinishLaunching')
      expect(lines.some((line) => line.includes('homebridge-pagerduty'))).toBe(false)
      expect(existsSync(join(storagePath, 'homebridge-pagerduty'))).toBe(false)
    } finally {
      rmSync(storagePath, { recursive: true, force: true })
    }
  })

  it('logs pagerduty before a rate limit and does not touch the store', async () => {
    const storagePath = mkdtempSync(join(tmpdir(), 'airthings-signals-'))
    transport.mockImplementation(async () => ({ status: 429, body: '', headers: {} }))
    try {
      const api = bridge(storagePath)
      const platform = new AirthingsPlatform(log(), {
        platform: 'MyAirthings',
        name: 'MyAirthings',
        clientId: fakeClientId(),
        clientSecret: fakeClientSecret(),
        pagerdutySignals: true,
      }, api)
      api.emit('didFinishLaunching')
      expect(lines[0]).toBe(`info ${PAGERDUTY_STARTUP_LOG}`)
      await platform.settled()
      expect(existsSync(join(storagePath, 'homebridge-pagerduty'))).toBe(false)
      api.emit('shutdown')
    } finally {
      rmSync(storagePath, { recursive: true, force: true })
    }
  })

  describeWithSqlite('signal store', () => {
    function readRows(storagePath: string): SignalRow[] {
      const file = join(storagePath, 'homebridge-pagerduty', 'signals-2026-10-24', 'signals.sqlite')
      const db = new sqlite!.DatabaseSync(file)
      try {
        return db.prepare('SELECT plugin, signal, active, severity, summary FROM signals ORDER BY signal').all() as unknown as SignalRow[]
      } finally {
        db.close()
      }
    }

    it('writes every signal once the account answers, and shutdown leaves the rows', async () => {
      const storagePath = mkdtempSync(join(tmpdir(), 'airthings-signals-'))
      try {
        const api = bridge(storagePath)
        const platform = new AirthingsPlatform(log(), {
          platform: 'MyAirthings',
          name: 'MyAirthings',
          clientId: fakeClientId(),
          clientSecret: fakeClientSecret(),
          pagerdutySignals: true,
        }, api)
        api.emit('didFinishLaunching')
        api.emit('didFinishLaunching')
        await platform.settled()

        expect(lines.filter((line) => line.includes(PAGERDUTY_STARTUP_LOG))).toHaveLength(1)
        expect(readRows(storagePath)).toEqual([
          { plugin: PLUGIN_NAME, signal: 'auth-failed', active: 0, severity: 'error', summary: AUTH_FAILED_SUMMARY },
          { plugin: PLUGIN_NAME, signal: 'cloud-offline', active: 0, severity: 'error', summary: CLOUD_OFFLINE_SUMMARY },
          {
            plugin: PLUGIN_NAME,
            signal: staleSignalName(PLUS),
            active: 0,
            severity: 'warning',
            summary: staleSummary('Zone One', PLUS),
          },
          {
            plugin: PLUGIN_NAME,
            signal: staleSignalName(RADON),
            active: 0,
            severity: 'warning',
            summary: staleSummary('Zone Two', RADON),
          },
        ])
        api.emit('shutdown')
        expect(readRows(storagePath).map((row) => row.signal)).toEqual([
          'auth-failed',
          'cloud-offline',
          staleSignalName(PLUS),
          staleSignalName(RADON),
        ])
      } finally {
        rmSync(storagePath, { recursive: true, force: true })
      }
    })

    it('pages a rejected client and leaves the cloud and the monitors alone', async () => {
      const storagePath = mkdtempSync(join(tmpdir(), 'airthings-signals-'))
      transport.mockImplementation(async () => ({ status: 401, body: '', headers: {} }))
      try {
        const api = bridge(storagePath)
        const platform = new AirthingsPlatform(log(), {
          platform: 'MyAirthings',
          name: 'MyAirthings',
          clientId: fakeClientId(),
          clientSecret: fakeClientSecret(),
          pagerdutySignals: true,
        }, api)
        api.emit('didFinishLaunching')
        await platform.settled()

        const enabled = lines.findIndex((line) => line.includes(PAGERDUTY_STARTUP_LOG))
        const rejected = lines.findIndex((line) => line.includes('rejected the client credentials'))
        expect(enabled).toBeGreaterThanOrEqual(0)
        expect(rejected).toBeGreaterThan(enabled)
        expect(readRows(storagePath)).toEqual([
          { plugin: PLUGIN_NAME, signal: 'auth-failed', active: 1, severity: 'error', summary: AUTH_FAILED_SUMMARY },
          { plugin: PLUGIN_NAME, signal: 'cloud-offline', active: 0, severity: 'error', summary: CLOUD_OFFLINE_SUMMARY },
        ])
        api.emit('shutdown')
      } finally {
        rmSync(storagePath, { recursive: true, force: true })
      }
    })
  })
})
