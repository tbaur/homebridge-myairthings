/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * @fileoverview One poll: device list, samples, and the wait until the next one.
 *
 * A sensor page and the token refresh are one poll. Retries inside a poll
 * do not exist. The next poll waits the interval, unless the client was
 * rejected or the hourly budget was spent.
 */

import type { CloudClient } from './api/client'
import { hasPublishableSensor, planFor, unknownSensorNames } from './readings/plan'
import { DEVICE_LIST_EVERY, FAILURES_BEFORE_STALE } from './settings'
import type {
  CloudView,
  ListedDevice,
  MonitorSnapshot,
  NormalizedReading,
  PluginLogger,
  PollOutcome,
} from './types'
import {
  AbortedError,
  AuthError,
  ConnectionError,
  HttpStatusError,
  NoAccountsError,
  ProtocolError,
  RateLimitedError,
  describeError,
} from './utils/errors'
import { forLog } from './utils/redact'

const BACKOFF_MS = [5_000, 15_000, 30_000, 60_000, 120_000, 300_000]

interface SessionOptions {
  client: CloudClient
  log: PluginLogger
  intervalMs: number
  now?: () => number
}

/** Polls Airthings and turns failures into a wait, not a tight loop. */
export class CloudSession {
  private devices: ListedDevice[] | undefined
  private polls = 0
  /** Rejected-client polls in a row. Cleared only by an accepted poll. */
  private authStreak = 0
  private authOpen = false
  /** Unreachable polls in a row. A rejected client does not count. */
  private outageStreak = 0
  private authLogged = false
  private outageLogged = false
  private readonly announcedUnknown = new Set<string>()

  constructor(private readonly options: SessionOptions) {}

  abort(): void {
    this.options.client.abort()
  }

  async poll(): Promise<PollOutcome> {
    const now = this.now()
    const blocked = this.options.client.blockedForMs(now)
    if (blocked > 0) {
      return idle(blocked)
    }
    try {
      const view = await this.load()
      this.authStreak = 0
      this.authOpen = false
      this.outageStreak = 0
      this.noteRecovery()
      return {
        waitMs: this.options.intervalMs,
        unreachable: false,
        authFailed: false,
        cloudOffline: false,
        reportSignals: true,
        countAs: 'ok',
        view,
      }
    } catch (error) {
      return this.fail(error)
    }
  }

  private async load(): Promise<CloudView> {
    let deviceListFresh = false
    if (this.devices === undefined || this.polls % DEVICE_LIST_EVERY === 0) {
      try {
        const listed = retainSensors(await this.options.client.listDevices(), this.devices)
        this.devices = dedupe(listed, this.options.log)
        deviceListFresh = true
        this.polls = 0
      } catch (error) {
        if (error instanceof NoAccountsError && this.devices !== undefined) {
          // This poll stops before samples. The remembered device list stays.
          // polls = 1 keeps the later sample cadence, and the account list is tried again on that cadence.
          this.polls = 1
        }
        throw error
      }
    }
    const accountIds = this.devices.map((device) => device.accountId)
    const batch = await this.options.client.listSamples(accountIds)
    this.polls += 1
    this.logUnmapped(this.devices)
    this.logIgnored(batch.ignored)
    return {
      deviceListFresh,
      ignored: batch.ignored,
      listedSerials: this.devices.map((device) => device.serialNumber),
      monitors: this.devices.flatMap((device) => publishable(device, batch.readings)),
    }
  }

  private fail(error: unknown): PollOutcome {
    if (error instanceof AbortedError) {
      return idle(this.options.intervalMs)
    }
    if (error instanceof RateLimitedError) {
      this.options.log.info(error.message)
      return idle(error.retryAfterMs)
    }
    if (error instanceof AuthError) {
      this.logAuth()
      this.authStreak += 1
      this.authOpen = true
      return {
        waitMs: backoffMs(this.authStreak),
        unreachable: this.authStreak >= FAILURES_BEFORE_STALE,
        authFailed: true,
        cloudOffline: false,
        reportSignals: true,
        countAs: 'error',
      }
    }
    if (error instanceof NoAccountsError) {
      return {
        waitMs: this.options.intervalMs,
        unreachable: false,
        authFailed: this.authOpen,
        cloudOffline: false,
        reportSignals: false,
        countAs: 'error',
      }
    }
    if (countsAsOutage(error)) {
      this.logOutage(error)
      this.outageStreak += 1
      const cloudOffline = !this.authOpen && this.outageStreak >= FAILURES_BEFORE_STALE
      return {
        waitMs: this.options.intervalMs,
        unreachable: this.outageStreak >= FAILURES_BEFORE_STALE,
        authFailed: this.authOpen,
        cloudOffline,
        reportSignals: true,
        countAs: 'error',
      }
    }
    this.options.log.error(`Airthings poll failed: ${describeError(error)}`)
    return {
      waitMs: this.options.intervalMs,
      unreachable: false,
      authFailed: this.authOpen,
      cloudOffline: false,
      reportSignals: false,
      countAs: 'error',
    }
  }

  private logAuth(): void {
    if (this.authLogged) {
      return
    }
    this.authLogged = true
      this.options.log.error('Airthings rejected the client credentials')
  }

  private logOutage(error: unknown): void {
    const line = `Airthings is unreachable: ${describeError(error)}`
    if (this.outageLogged) {
      this.options.log.debug(line)
      return
    }
    this.outageLogged = true
    this.options.log.warn(line)
  }

  private noteRecovery(): void {
    if (!this.authLogged && !this.outageLogged) {
      return
    }
    this.authLogged = false
    this.outageLogged = false
    this.options.log.info('Airthings is reachable again')
  }

  private logUnmapped(devices: readonly ListedDevice[]): void {
    for (const device of devices) {
      const names = unknownSensorNames(device.sensors)
      if (names.length === 0) {
        continue
      }
      const key = `${device.serialNumber}:${names.join(',')}`
      if (this.announcedUnknown.has(key)) {
        continue
      }
      this.announcedUnknown.add(key)
      this.options.log.info(`${forLog(device.name)} reports unmapped sensors: ${names.map((name) => forLog(name)).join(', ')}`)
    }
  }

  private logIgnored(tokens: readonly string[]): void {
    for (const token of tokens) {
      if (this.announcedUnknown.has(token)) {
        continue
      }
      this.announcedUnknown.add(token)
      const [serial = '', sensorType = '', unit = ''] = token.split('\t')
      const device = this.devices?.find((item) => item.serialNumber === serial)
      const who = device !== undefined && device.name.trim().length > 0 ? device.name : serial
      const unitText = unit.length > 0 ? `unit "${forLog(unit)}"` : 'no unit'
      this.options.log.info(`${forLog(who)} did not use ${forLog(sensorType)}; ${unitText} is not converted`)
    }
  }

  private now(): number {
    return this.options.now?.() ?? Date.now()
  }
}

export function backoffMs(failures: number): number {
  const index = Math.min(Math.max(failures, 1), BACKOFF_MS.length) - 1
  return BACKOFF_MS[index] ?? BACKOFF_MS[BACKOFF_MS.length - 1] ?? 300_000
}

/** A poll that did not learn whether Airthings is up. The last signal rows stay. */
function idle(waitMs: number): PollOutcome {
  return {
    waitMs,
    unreachable: false,
    authFailed: false,
    cloudOffline: false,
    reportSignals: false,
    countAs: 'wait',
  }
}

function countsAsOutage(error: unknown): boolean {
  if (error instanceof AuthError || error instanceof RateLimitedError) {
    return false
  }
  if (error instanceof ConnectionError || error instanceof ProtocolError) {
    return true
  }
  if (error instanceof HttpStatusError) {
    return error.status >= 500 || error.status === 408
  }
  return false
}

function retainSensors(incoming: readonly ListedDevice[], previous: readonly ListedDevice[] | undefined): ListedDevice[] {
  const prior = new Map((previous ?? []).map((device) => [device.serialNumber, device]))
  return incoming.map((device) => {
    if (!device.sensorsOmitted) {
      return device
    }
    const kept = prior.get(device.serialNumber)
    if (kept === undefined) {
      return { ...device, sensors: [] }
    }
    return { ...device, sensors: kept.sensors, sensorsOmitted: false }
  })
}

function dedupe(devices: readonly ListedDevice[], log: PluginLogger): ListedDevice[] {
  const seen = new Set<string>()
  const unique: ListedDevice[] = []
  for (const device of devices) {
    if (seen.has(device.serialNumber)) {
      log.warn(`duplicate serial ${forLog(device.serialNumber)} ignored`)
      continue
    }
    seen.add(device.serialNumber)
    unique.push(device)
  }
  return unique
}

function publishable(
  device: ListedDevice,
  readings: ReadonlyMap<string, NormalizedReading>,
): MonitorSnapshot[] {
  if (!hasPublishableSensor(planFor(device.sensors))) {
    return []
  }
  return [{
    accountId: device.accountId,
    serialNumber: device.serialNumber,
    name: device.name,
    type: device.type,
    sensors: device.sensors,
    samplePresent: readings.has(device.serialNumber),
    reading: readings.get(device.serialNumber) ?? { active: false },
  }]
}
