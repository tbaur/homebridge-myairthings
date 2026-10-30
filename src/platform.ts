/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * @fileoverview The platform. It owns which accessories exist, and nothing else.
 *
 * A monitor's identity is its serial number. Adopting a cached accessory keeps
 * the room and the automations. A bad config leaves those accessories
 * registered and answering No Response. A failed poll does not remove one.
 * A monitor is removed only after a device list that succeeded and omitted it.
 */

import type { API, DynamicPlatformPlugin, Logging, PlatformAccessory, PlatformConfig } from 'homebridge'

import { AirthingsClient } from './api/client'
import { AirthingsSignals, createAirthingsSignals, PAGERDUTY_STARTUP_LOG } from './airthings-signals'
import { DiagnosticsCollector } from './diagnostics/collector'
import type { DiagnosticsMessage, RestTransportState } from './diagnostics/format'
import { resolveRestTransportState } from './diagnostics/format'
import { MonitorAccessory, readingFromAccessory } from './devices/monitor'
import type { AccessoryHost } from './devices/host'
import { CloudSession } from './session'
import { DEFAULT_CO2_DETECTED_PPM, DEFAULT_NAME, PLATFORM_NAME, PLUGIN_NAME, readPluginVersion, UUID_PREFIX } from './settings'
import type { CloudView, MonitorSnapshot, PluginLogger, PollOutcome, ResolvedConfig } from './types'
import { parseAccessoryContext, resolvedDisplayName, writeContext } from './utils/context'
import { isFresh, sampleAge } from './readings/sample'
import { describeError } from './utils/errors'
import { homeKitName, modelLabel } from './utils/names'
import { forLog } from './utils/redact'
import { startupLines } from './utils/startup-report'
import { validateConfig } from './utils/validators'

const running = new WeakSet<API>()

/** Homebridge's dynamic platform for an Airthings account. */
export class AirthingsPlatform implements DynamicPlatformPlugin, AccessoryHost {
  readonly api: API
  readonly log: Logging
  readonly pluginVersion: string
  private readonly restored = new Map<string, PlatformAccessory>()
  private readonly handlers = new Map<string, MonitorAccessory>()
  private readonly diagnostics = new DiagnosticsCollector()
  private config?: ResolvedConfig
  private session?: CloudSession
  private timer?: ReturnType<typeof setTimeout>
  private diagnosticsTimer?: ReturnType<typeof setInterval>
  private signals?: AirthingsSignals
  private pagerDutyLogged = false
  /** The last completed poll was a rejected client. */
  private authFailed = false
  private cloudOffline = false
  private launched = false
  private stopped = false
  private announced = false
  private cyclePromise: Promise<void> = Promise.resolve()

  constructor(log: Logging, platformConfig: PlatformConfig, api: API) {
    this.log = log
    this.api = api
    this.pluginVersion = readPluginVersion(log)
    if (running.has(api)) {
      const blockName = configuredBlockName(platformConfig)
      this.log.error(`platform name "${forLog(blockName)}" is disabled. Another ${PLATFORM_NAME} block is already running`)
      api.on('didFinishLaunching', () => this.keepRestoredUnavailable())
      return
    }
    running.add(api)
    const result = validateConfig(platformConfig)
    for (const warning of result.warnings) {
      this.log.warn(warning)
    }
    if (result.status !== 'ok' || result.config === undefined) {
      if (result.status === 'notConfigured') {
        for (const error of result.errors) {
          this.log.error(error)
        }
        this.log.info(`no client credentials set; ${DEFAULT_NAME} is not started`)
      } else {
        for (const error of result.errors) {
          this.log.error(error)
        }
        this.log.error('platform disabled; cached accessories kept')
      }
      api.on('didFinishLaunching', () => this.keepRestoredUnavailable())
      return
    }
    this.config = result.config
    if (result.config.pagerdutySignals) {
      this.signals = createAirthingsSignals({
        plugin: PLUGIN_NAME,
        storagePath: this.api.user.storagePath(),
        log: this.log,
      })
    }
    api.on('didFinishLaunching', () => {
      if (this.launched) {
        return
      }
      this.launched = true
      this.attachRestored()
      this.logPagerDuty()
      this.cyclePromise = this.cycle()
      this.startDiagnostics()
    })
    api.on('shutdown', () => {
      this.stop()
    })
  }

  get hap(): API['hap'] {
    return this.api.hap
  }

  get co2DetectedPpm(): number {
    return this.config?.co2DetectedPpm ?? DEFAULT_CO2_DETECTED_PPM
  }

  /** Resolves when the current poll has finished. */
  settled(): Promise<void> {
    return this.cyclePromise
  }

  configureAccessory(accessory: PlatformAccessory): void {
    this.restored.set(accessory.UUID, accessory)
  }

  /** Handlers for accessories Homebridge restored, so an outage can mark them inactive before the next good poll. */
  private attachRestored(): void {
    for (const accessory of this.restored.values()) {
      if (this.handlers.has(accessory.UUID)) {
        continue
      }
      const context = parseAccessoryContext(accessory.context)
      if (context === undefined) {
        continue
      }
      const handler = new MonitorAccessory({
        host: this,
        accessory,
        displayName: accessory.displayName,
        model: modelLabel(context.deviceType),
        serialNumber: context.serialNumber,
        unavailable: false,
      })
      const recordedAt = context.recordedAt
      handler.sync({
        sensors: context.sensors,
        battery: context.reportsBattery,
        reading: {
          active: isFresh(recordedAt, Date.now()),
          recordedAt,
          ...readingFromAccessory(accessory, this.hap),
        },
      })
      this.handlers.set(accessory.UUID, handler)
    }
  }

  noteSampleExpired(serialNumber: string): void {
    if (this.stopped || this.authFailed || this.cloudOffline) {
      return
    }
    this.signals?.expire(serialNumber)
  }

  private async cycle(): Promise<void> {
    if (this.stopped || this.config === undefined) {
      return
    }
    this.session ??= new CloudSession({
      client: new AirthingsClient({
        clientId: this.config.clientId,
        clientSecret: this.config.clientSecret,
        log: this.log,
      }),
      log: this.log,
      intervalMs: this.config.refreshIntervalSec * 1000,
    })
    const started = Date.now()
    // A fault in this plugin is not a reason to poll faster than configured.
    let waitMs = this.config.refreshIntervalSec * 1000
    try {
      const outcome = await this.session.poll()
      this.diagnostics.apiRequest(Date.now() - started, outcome.countAs)
      waitMs = outcome.waitMs
      if (this.stopped) {
        return
      }
      this.applyOutcome(outcome)
    } catch (error) {
      this.log.error(`poll failed: ${describeError(error)}`)
      this.markStale('poll failed')
    }
    this.schedule(waitMs)
  }

  private applyOutcome(outcome: PollOutcome): void {
    if (outcome.reportSignals) {
      this.authFailed = outcome.authFailed
      this.cloudOffline = outcome.cloudOffline
    }
    if (outcome.view !== undefined) {
      this.applyView(outcome.view)
    }
    this.noteSignals(outcome)
    if (outcome.unreachable) {
      this.markStale()
    }
  }

  private noteSignals(outcome: PollOutcome): void {
    if (this.signals === undefined) {
      return
    }
    // A rate-limit wait, or an error we do not classify, leaves the last rows
    // alone. Writing "clear" there would resolve a real page.
    if (!outcome.reportSignals) {
      return
    }
    this.signals.record({
      authFailed: outcome.authFailed,
      cloudOffline: outcome.cloudOffline,
      monitors: outcome.view?.monitors.map((monitor) => ({
        serialNumber: monitor.serialNumber,
        name: monitor.name,
        fresh: monitor.reading.active,
      })),
      deviceListFresh: outcome.view?.deviceListFresh ?? false,
    })
  }

  private logPagerDuty(): void {
    if (this.signals === undefined || this.pagerDutyLogged) {
      return
    }
    this.pagerDutyLogged = true
    this.log.info(PAGERDUTY_STARTUP_LOG)
  }

  private applyView(view: CloudView): void {
    const wanted = new Map(view.monitors.map((monitor) => [this.uuid(monitor.serialNumber), monitor]))
    const listed = new Set(view.listedSerials.map((serial) => this.uuid(serial)))
    const removed = view.deviceListFresh ? this.removeMissing(listed) : 0
    const created: PlatformAccessory[] = []
    for (const [uuid, snapshot] of wanted) {
      const existing = this.restored.get(uuid)
      const accessory = existing ?? this.createAccessory(snapshot, uuid)
      if (existing === undefined) {
        created.push(accessory)
      }
      this.adopt(accessory, snapshot)
    }
    if (created.length > 0) {
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, created)
    }
    this.report(view.monitors, created.length, removed)
    this.logReadings(view.monitors)
  }

  private createAccessory(snapshot: MonitorSnapshot, uuid: string): PlatformAccessory {
    const name = homeKitName(snapshot.name, snapshot.serialNumber)
    return new this.api.platformAccessory(name, uuid, this.api.hap.Categories.SENSOR)
  }

  private adopt(accessory: PlatformAccessory, snapshot: MonitorSnapshot): void {
    const previous = parseAccessoryContext(accessory.context)
    const apiName = homeKitName(snapshot.name, snapshot.serialNumber)
    const display = homeKitName(
      resolvedDisplayName(accessory.displayName, previous?.apiName, apiName),
      snapshot.serialNumber,
    )
    if (accessory.displayName !== display) {
      accessory.updateDisplayName(display)
    }
    accessory.category = this.api.hap.Categories.SENSOR
    const existing = this.handlers.get(accessory.UUID)
    if (!snapshot.samplePresent && existing !== undefined) {
      existing.updateIdentity({
        displayName: accessory.displayName,
        model: modelLabel(snapshot.type),
        serialNumber: snapshot.serialNumber,
      })
      existing.markStale('no sample from Airthings')
      return
    }
    const battery = previous?.reportsBattery === true || snapshot.reading.batteryPercent !== undefined
    writeContext(accessory, { ...snapshot, name: apiName }, battery)
    this.restored.set(accessory.UUID, accessory)
    const handler = existing ?? new MonitorAccessory({
      host: this,
      accessory,
      displayName: accessory.displayName,
      model: modelLabel(snapshot.type),
      serialNumber: snapshot.serialNumber,
      unavailable: false,
    })
    handler.updateIdentity({
      displayName: accessory.displayName,
      model: modelLabel(snapshot.type),
      serialNumber: snapshot.serialNumber,
    })
    handler.sync({ sensors: snapshot.sensors, battery, reading: snapshot.reading })
    this.handlers.set(accessory.UUID, handler)
  }

  private removeMissing(keep: ReadonlySet<string>): number {
    const stale: PlatformAccessory[] = []
    for (const [uuid, accessory] of this.restored) {
      if (keep.has(uuid)) {
        continue
      }
      this.log.info(`removing ${forLog(accessory.displayName)}`)
      stale.push(accessory)
      this.handlers.get(uuid)?.release()
      this.restored.delete(uuid)
      this.handlers.delete(uuid)
    }
    if (stale.length > 0) {
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, stale)
    }
    return stale.length
  }

  private report(monitors: readonly MonitorSnapshot[], created: number, removed: number): void {
    if (this.announced && created === 0 && removed === 0) {
      return
    }
    this.announced = true
    const lines = startupLines({
      version: this.pluginVersion,
      name: this.config?.name ?? DEFAULT_NAME,
      monitors,
      refreshIntervalSec: this.config?.refreshIntervalSec ?? 0,
      created,
      removed,
    })
    for (const line of lines) {
      this.log.info(line)
    }
  }

  /** Debug, like the other plugins: Homebridge shows it only in debug mode, and only when the setting is on. */
  private logReadings(monitors: readonly MonitorSnapshot[]): void {
    if (this.config?.debug !== true) {
      return
    }
    const now = Date.now()
    for (const monitor of monitors) {
      const reading = monitor.reading
      this.log.debug(
        `${forLog(monitor.serialNumber)} radon=${reading.radonShortBq ?? '-'} `
        + `co2=${reading.co2Ppm ?? '-'} temp=${reading.temperatureC ?? '-'} `
        + `age=${sampleAge(reading.recordedAt, now)}`,
      )
    }
  }

  private keepRestoredUnavailable(): void {
    for (const accessory of this.restored.values()) {
      const context = parseAccessoryContext(accessory.context)
      new MonitorAccessory({
        host: this,
        accessory,
        displayName: accessory.displayName,
        model: modelLabel(context?.deviceType ?? ''),
        serialNumber: context?.serialNumber ?? accessory.UUID,
        unavailable: true,
      })
    }
    if (this.restored.size > 0) {
      this.log.warn(`${this.restored.size} cached accessory(ies) inactive`)
    }
  }

  private markStale(reason = 'three unreachable polls'): void {
    for (const handler of this.handlers.values()) {
      handler.markStale(reason)
    }
  }

  private schedule(waitMs: number): void {
    if (this.stopped) {
      return
    }
    if (this.timer !== undefined) {
      clearTimeout(this.timer)
    }
    this.timer = setTimeout(() => {
      this.cyclePromise = this.cycle()
    }, waitMs)
    this.timer.unref()
  }

  private startDiagnostics(): void {
    const seconds = this.config?.diagnosticsIntervalSec ?? 0
    if (seconds <= 0) {
      return
    }
    this.log.info(this.diagnosticsLine('diagnostics.start'))
    this.diagnosticsTimer = setInterval(() => {
      this.log.info(this.diagnosticsLine('health'))
    }, seconds * 1000)
    this.diagnosticsTimer.unref()
  }

  private diagnosticsLine(msg: DiagnosticsMessage): string {
    let online = 0
    for (const handler of this.handlers.values()) {
      if (handler.isLive()) {
        online += 1
      }
    }
    return this.diagnostics.line({
      msg,
      devicesOnline: online,
      devicesTotal: this.handlers.size,
      restState: this.restState(),
    })
  }

  private restState(): RestTransportState {
    return resolveRestTransportState({
      stopped: this.stopped,
      authFailed: this.authFailed,
      pollingArmed: this.timer !== undefined,
    })
  }

  private stop(): void {
    this.stopped = true
    this.session?.abort()
    if (this.timer !== undefined) {
      clearTimeout(this.timer)
    }
    for (const handler of this.handlers.values()) {
      handler.release()
    }
    if (this.diagnosticsTimer !== undefined) {
      this.log.info(this.diagnosticsLine('diagnostics.stop'))
      clearInterval(this.diagnosticsTimer)
    }
    this.signals?.close()
  }

  private uuid(serialNumber: string): string {
    return this.api.hap.uuid.generate(`${UUID_PREFIX}${serialNumber}`)
  }
}

function configuredBlockName(config: PlatformConfig): string {
  const name = config.name
  if (typeof name === 'string' && name.trim().length > 0) {
    return name.trim()
  }
  return DEFAULT_NAME
}

export type { PluginLogger }
