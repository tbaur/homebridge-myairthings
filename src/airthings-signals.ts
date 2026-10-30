/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * @fileoverview The three conditions this plugin pages through homebridge-pagerduty.
 *
 * A rejected client is `auth-failed`. The account being unreachable is
 * `cloud-offline`. One monitor with an old sample, while the account itself
 * answers, is `stale.<serial>`. The account-level signals suppress the
 * per-monitor ones, so one outage is one page.
 */

import { PagerDutySignals } from './pagerduty-signals'
import type { PagerDutySignalsOptions, SignalSeverity, SignalState } from './pagerduty-signals'

/** Logged once, when the setting is on, before the first poll. */
export const PAGERDUTY_STARTUP_LOG =
  'homebridge-pagerduty support is enabled (auth-failed, cloud-offline, stale.<serial>)'

export const SIGNAL_AUTH_FAILED = 'auth-failed'
export const SIGNAL_CLOUD_OFFLINE = 'cloud-offline'

export const AUTH_FAILED_SUMMARY =
  'Airthings rejected the API client. HomeKit is showing the last readings until the client id and secret work again.'

export const CLOUD_OFFLINE_SUMMARY =
  'Homebridge has not reached Airthings. The monitors are showing their last readings.'

const STALE_SEVERITY: SignalSeverity = 'warning'
const SIGNAL_NAME = /^[a-z0-9._-]{1,64}$/

export interface SignalWriter {
  write(signal: string, state: SignalState): void
  close(): void
}

export interface StaleMonitor {
  serialNumber: string
  name: string
  /** True when the latest sample is inside the freshness window. */
  fresh: boolean
}

export interface SignalUpdate {
  authFailed: boolean
  cloudOffline: boolean
  monitors?: readonly StaleMonitor[]
  /** Drop stale rows for serials absent from `monitors`. */
  deviceListFresh: boolean
}

/** `stale.<serial>`. The serial is lowercased so the store's name check accepts it. */
export function staleSignalName(serialNumber: string): string {
  return `stale.${serialNumber.toLowerCase()}`
}

/** A summary that still reads as a fixed PagerDuty message. */
export function staleSummary(name: string, serialNumber: string): string {
  const label = name.trim().length > 0 ? name.trim() : serialNumber
  return `${label} has not reported a fresh Airthings reading.`
}

/**
 * Turns poll results into signal rows.
 *
 * The store writer is injected so tests can watch writes without SQLite.
 */
export class AirthingsSignals {
  private readonly summaries = new Map<string, string>()

  constructor(private readonly writer: SignalWriter) {}

  record(update: SignalUpdate): void {
    const accountDown = update.authFailed || update.cloudOffline
    this.writer.write(SIGNAL_AUTH_FAILED, {
      active: update.authFailed,
      severity: 'error',
      summary: AUTH_FAILED_SUMMARY,
    })
    this.writer.write(SIGNAL_CLOUD_OFFLINE, {
      active: update.cloudOffline && !update.authFailed,
      severity: 'error',
      summary: CLOUD_OFFLINE_SUMMARY,
    })
    if (accountDown) {
      this.clearStale()
      return
    }
    if (update.monitors === undefined) {
      return
    }
    const present = new Set<string>()
    for (const monitor of update.monitors) {
      present.add(monitor.serialNumber)
      this.writeStale(monitor.serialNumber, monitor.name, !monitor.fresh)
    }
    if (!update.deviceListFresh) {
      return
    }
    for (const serial of [...this.summaries.keys()]) {
      if (!present.has(serial)) {
        this.writeStale(serial, '', false)
        this.summaries.delete(serial)
      }
    }
  }

  /** Turn a known monitor's stale signal on. Does nothing while the account itself is the page. */
  expire(serial: string): void {
    if (!this.summaries.has(serial)) {
      return
    }
    this.writeStale(serial, '', true)
  }

  /** Close the store. Does not clear a signal. */
  close(): void {
    this.writer.close()
  }

  private clearStale(): void {
    for (const serial of this.summaries.keys()) {
      this.writeStale(serial, '', false)
    }
  }

  private writeStale(serial: string, name: string, active: boolean): void {
    const signal = staleSignalName(serial)
    if (!SIGNAL_NAME.test(signal)) {
      return
    }
    const summary = name.trim().length > 0
      ? staleSummary(name, serial)
      : this.summaries.get(serial) ?? staleSummary('', serial)
    this.summaries.set(serial, summary)
    this.writer.write(signal, { active, severity: STALE_SEVERITY, summary })
  }
}

/** Build the signals for this plugin, backed by the homebridge-pagerduty store. */
export function createAirthingsSignals(options: PagerDutySignalsOptions): AirthingsSignals {
  return new AirthingsSignals(new PagerDutySignals(options))
}
