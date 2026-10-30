/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * @fileoverview Shared types. No I/O.
 */

/** Logger surface. Homebridge's `Logging` satisfies it. */
export interface PluginLogger {
  info(message: string): void
  warn(message: string): void
  error(message: string): void
  debug(message: string): void
}

/** What `config.json` may contain before validation. */
export interface AirthingsPlatformConfig {
  name?: unknown
  clientId?: unknown
  clientSecret?: unknown
  refreshInterval?: unknown
  co2DetectedThreshold?: unknown
  debug?: unknown
  diagnosticsInterval?: unknown
  pagerdutySignals?: unknown
}

/** Config the platform is willing to run with. */
export interface ResolvedConfig {
  name: string
  clientId: string
  clientSecret: string
  refreshIntervalSec: number
  co2DetectedPpm: number
  debug: boolean
  diagnosticsIntervalSec: number
  pagerdutySignals: boolean
}

export type ConfigStatus = 'ok' | 'notConfigured' | 'invalid'

export interface ConfigResult {
  status: ConfigStatus
  config?: ResolvedConfig
  errors: string[]
  warnings: string[]
}

/** One monitor as the device list describes it. */
export interface ListedDevice {
  accountId: string
  serialNumber: string
  name: string
  type: string
  sensors: readonly string[]
  /** The payload omitted `sensors`. The session may keep the previous list. */
  sensorsOmitted?: boolean
}

/** One sensor value from a sample payload. */
export interface SensorValue {
  sensorType: string
  value: number
  unit: string
}

/** One device's latest sample. */
export interface SensorRecord {
  serialNumber: string
  sensors: readonly SensorValue[]
  recordedAt?: number
  batteryPercent?: number
}

/**
 * Readings in the units HomeKit and Eve want.
 *
 * Absent fields were not in the sample. `active` is false when the sample is
 * missing or older than the freshness window.
 */
export interface NormalizedReading {
  active: boolean
  /** When the sample was recorded, so a later poll is not required to go stale. */
  recordedAt?: number
  batteryPercent?: number
  temperatureC?: number
  humidityPercent?: number
  radonShortBq?: number
  radonLongBq?: number
  co2Ppm?: number
  vocPpb?: number
  vocMicrograms?: number
  pm25Micrograms?: number
  pm1Micrograms?: number
  pressureHpa?: number
  mold?: number
  lux?: number
  soundDb?: number
}

/** A monitor the platform can publish, with its latest reading if we have one. */
export interface MonitorSnapshot {
  accountId: string
  serialNumber: string
  name: string
  type: string
  sensors: readonly string[]
  reading: NormalizedReading
  /** False when this poll had no sample for the serial. The last reading stays. */
  samplePresent: boolean
}

/** Result of one poll. `view` is set only when the device list and samples were read. */
export interface PollOutcome {
  waitMs: number
  unreachable: boolean
  /** The client id or secret was rejected. This is not an unreachable cloud. */
  authFailed: boolean
  /** Three unreachable polls in a row. A rejected client does not count. */
  cloudOffline: boolean
  /**
   * The account signals have a known state this poll.
   * A rate limit and an unclassified error leave the last rows alone.
   */
  reportSignals: boolean
  /** Whether this poll is a completed request, a failure, or a deliberate wait. */
  countAs: 'ok' | 'error' | 'wait'
  view?: CloudView
}

export interface CloudView {
  monitors: readonly MonitorSnapshot[]
  /** Every serial in the device list, including ones this plugin does not publish. */
  listedSerials: readonly string[]
  /** True when this poll refreshed the device list, so removals are real. */
  deviceListFresh: boolean
  ignored: readonly string[]
}

/** Cached on the Homebridge accessory. The serial number is the identity. */
export interface AccessoryContext {
  serialNumber: string
  apiName: string
  deviceType: string
  sensors: string[]
  reportsBattery: boolean
  /** Sample time from the last poll, so a restart can still go inactive at three hours. */
  recordedAt?: number
}

/** Which HomeKit and Eve services a sensor list needs. */
export interface SensorPlan {
  radonShort: boolean
  radonLong: boolean
  temperature: boolean
  humidity: boolean
  carbonDioxide: boolean
  voc: boolean
  pm25: boolean
  pm1: boolean
  pressure: boolean
  mold: boolean
  light: boolean
  sound: boolean
}

/** HomeKit Air Quality words. Excellent and Inferior are unused: Airthings has three bands. */
export type AirQualityWord = 'unknown' | 'good' | 'fair' | 'poor'
