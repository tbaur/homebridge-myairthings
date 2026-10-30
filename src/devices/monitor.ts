/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * @fileoverview One Airthings monitor.
 *
 * Reads return the last published value. A poll pushes changes. Nothing here
 * waits on the network.
 */

import type { Characteristic, CharacteristicValue, HAP, PlatformAccessory, Service, WithUUID } from 'homebridge'

import { airQuality } from '../readings/quality'
import { inactiveReason } from '../readings/sample'
import { STALE_AFTER_MS } from '../settings'
import type { AirQualityWord, NormalizedReading, SensorPlan } from '../types'
import { BaseAccessory, type MonitorInit } from './base-accessory'
import { ensureCustom, MOLD, PM1, PRESSURE, PRESSURE_SPEC, RADON_LONG, RADON_LONG_SPEC, RADON_SHORT, RADON_SHORT_SPEC, SOUND, VOC_PPB } from './eve'
import { arrangeServices, placePressure, type ArrangedServices } from './layout'
import { forLog } from '../utils/redact'
import { planFor } from '../readings/plan'

export interface MonitorUpdate {
  sensors: readonly string[]
  battery: boolean
  reading: NormalizedReading
}

/** HomeKit accessory for a single monitor. */
export class MonitorAccessory extends BaseAccessory {
  private plan: SensorPlan = planFor([])
  private reading: NormalizedReading = { active: false }
  private services?: ArrangedServices
  private readonly serialNumber: string
  private staleTimer?: ReturnType<typeof setTimeout>
  private inactiveLogged = false

  constructor(init: MonitorInit) {
    super(init)
    this.serialNumber = init.serialNumber
    if (init.unavailable) {
      this.failReads()
    }
  }

  /** Rebuild services to match the sensor list, then publish the reading. */
  sync(update: MonitorUpdate): void {
    this.plan = planFor(update.sensors)
    this.reading = update.reading
    this.services = arrangeServices({
      hap: this.host.hap,
      accessory: this.accessory,
      plan: this.plan,
      battery: update.battery || update.reading.batteryPercent !== undefined,
    })
    if (!this.unavailable) {
      this.publishAll()
    }
    this.armStale()
    if (this.reading.active) {
      this.inactiveLogged = false
    } else {
      this.noteInactive(inactiveReason(this.reading.recordedAt, Date.now()) ?? 'sample older than three hours')
    }
  }

  /** Stop the stale timer. The accessory is about to be removed or replaced. */
  release(): void {
    this.clearStaleTimer()
  }

  /** Keep the last numbers and mark every service inactive. */
  markStale(reason = 'three unreachable polls'): void {
    this.clearStaleTimer()
    this.reading = { ...this.reading, active: false }
    if (!this.unavailable) {
      this.publishAll()
    }
    this.noteInactive(reason)
  }

  /** True when the latest sample is still inside the freshness window. */
  isLive(): boolean {
    return !this.unavailable && this.reading.active
  }

  private armStale(): void {
    this.clearStaleTimer()
    const recordedAt = this.reading.recordedAt
    if (recordedAt === undefined || !this.reading.active || this.unavailable) {
      return
    }
    const delay = recordedAt + STALE_AFTER_MS - Date.now()
    if (delay <= 0) {
      this.markStale('sample older than three hours')
      return
    }
    this.staleTimer = setTimeout(() => {
      this.staleTimer = undefined
      this.reading = { ...this.reading, active: false }
      if (!this.unavailable) {
        this.publishAll()
      }
      this.host.noteSampleExpired?.(this.serialNumber)
      this.noteInactive('sample older than three hours')
    }, delay)
    this.staleTimer.unref()
  }

  private noteInactive(reason: string): void {
    if (this.inactiveLogged) {
      return
    }
    this.inactiveLogged = true
    this.host.log.info(`${forLog(this.displayName)} inactive: ${reason}`)
  }

  private clearStaleTimer(): void {
    if (this.staleTimer !== undefined) {
      clearTimeout(this.staleTimer)
      this.staleTimer = undefined
    }
  }

  private publishAll(): void {
    const services = this.services
    if (services === undefined) {
      return
    }
    this.publishAir(services.air)
    this.publishTemperature(services.temperature)
    this.publishHumidity(services.humidity)
    this.publishCarbonDioxide(services.carbonDioxide)
    this.publishLight(services.light)
    this.publishBattery(services.battery)
    this.publishExtras(services)
  }

  private publishAir(service: Service): void {
    const { Characteristic } = this.host.hap
    this.publish(service, Characteristic.AirQuality, this.qualityValue(airQuality(this.plan, this.reading)))
    this.publish(service, Characteristic.StatusActive, this.reading.active)
    this.publishOptional({ service, characteristic: Characteristic.PM2_5Density, value: this.reading.pm25Micrograms, min: 0, max: 1000 })
    this.publishOptional({ service, characteristic: Characteristic.VOCDensity, value: this.reading.vocMicrograms, min: 0, max: 100_000 })
    if (this.plan.voc) {
      this.publishOptional({ service, characteristic: VOC_PPB, value: this.reading.vocPpb, min: 0, max: 65535, round: true })
    }
    if (this.plan.radonShort) {
      this.publishOptional({ service, characteristic: RADON_SHORT, value: this.reading.radonShortBq, min: 0, max: 20000, round: true, spec: RADON_SHORT_SPEC })
    }
    if (this.plan.radonLong) {
      this.publishOptional({ service, characteristic: RADON_LONG, value: this.reading.radonLongBq, min: 0, max: 20000, round: true, spec: RADON_LONG_SPEC })
    }
    if (this.plan.pm1) {
      this.publishOptional({ service, characteristic: PM1, value: this.reading.pm1Micrograms, min: 0, max: 1000 })
    }
    if (this.plan.mold) {
      this.publishOptional({ service, characteristic: MOLD, value: this.reading.mold, min: 0, max: 10, round: true })
    }
    if (this.plan.sound) {
      this.publishOptional({ service, characteristic: SOUND, value: this.reading.soundDb, min: 0, max: 120 })
    }
  }

  private publishTemperature(service: Service | undefined): void {
    if (service === undefined) {
      return
    }
    const { Characteristic } = this.host.hap
    this.publishOptional({ service, characteristic: Characteristic.CurrentTemperature, value: this.reading.temperatureC, min: -270, max: 100 })
    this.publish(service, Characteristic.StatusActive, this.reading.active && this.reading.temperatureC !== undefined)
  }

  private publishHumidity(service: Service | undefined): void {
    if (service === undefined) {
      return
    }
    const { Characteristic } = this.host.hap
    this.publishOptional({ service, characteristic: Characteristic.CurrentRelativeHumidity, value: this.reading.humidityPercent, min: 0, max: 100 })
    this.publish(service, Characteristic.StatusActive, this.reading.active && this.reading.humidityPercent !== undefined)
  }

  private publishCarbonDioxide(service: Service | undefined): void {
    if (service === undefined) {
      return
    }
    const { Characteristic } = this.host.hap
    const ppm = this.reading.co2Ppm
    if (ppm !== undefined) {
      const detected = ppm >= this.host.co2DetectedPpm
        ? Characteristic.CarbonDioxideDetected.CO2_LEVELS_ABNORMAL
        : Characteristic.CarbonDioxideDetected.CO2_LEVELS_NORMAL
      this.publish(service, Characteristic.CarbonDioxideDetected, detected)
      this.publish(service, Characteristic.CarbonDioxideLevel, clamp(ppm, 0, 100_000))
    }
    this.publish(service, Characteristic.StatusActive, this.reading.active && ppm !== undefined)
  }

  private publishLight(service: Service | undefined): void {
    if (service === undefined) {
      return
    }
    const { Characteristic } = this.host.hap
    const lux = this.reading.lux
    if (lux !== undefined) {
      this.publish(service, Characteristic.CurrentAmbientLightLevel, clamp(Math.max(lux, 0.0001), 0.0001, 100_000))
    }
    this.publish(service, Characteristic.StatusActive, this.reading.active && lux !== undefined)
  }

  private publishBattery(service: Service | undefined): void {
    if (service === undefined || this.reading.batteryPercent === undefined) {
      return
    }
    const { Characteristic } = this.host.hap
    const level = Math.round(clamp(this.reading.batteryPercent, 0, 100))
    this.publish(service, Characteristic.BatteryLevel, level)
    this.publish(service, Characteristic.StatusLowBattery, level <= 10
      ? Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
      : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL)
    this.publish(service, Characteristic.ChargingState, Characteristic.ChargingState.NOT_CHARGING)
  }

  private publishExtras(services: ArrangedServices): void {
    const host = services.pressure
    if (host === undefined || this.reading.pressureHpa === undefined) {
      return
    }
    placePressure(this.host.hap, services.air, host, services.temperature)
    this.publishOptional({ service: host, characteristic: PRESSURE, value: this.reading.pressureHpa, min: 500, max: 1200, round: true, spec: PRESSURE_SPEC })
  }

  private publishOptional(input: {
    service: Service
    characteristic: Parameters<BaseAccessory['publish']>[1]
    value: number | undefined
    min: number
    max: number
    round?: boolean
    spec?: Parameters<typeof ensureCustom>[2]
  }): void {
    const { service, characteristic, value, min, max, round = false, spec } = input
    if (value === undefined) {
      return
    }
    if (spec !== undefined) {
      ensureCustom(service, this.host.hap, spec)
    }
    if (!service.testCharacteristic(characteristic)) {
      return
    }
    const next = round ? Math.round(clamp(value, min, max)) : clamp(value, min, max)
    this.publish(service, characteristic, next)
  }

  private qualityValue(word: AirQualityWord): CharacteristicValue {
    const air = this.host.hap.Characteristic.AirQuality
    switch (word) {
      case 'good':
        return air.GOOD
      case 'fair':
        return air.FAIR
      case 'poor':
        return air.POOR
      default:
        return air.UNKNOWN
    }
  }

  private failReads(): void {
    for (const service of this.accessory.services) {
      for (const characteristic of service.characteristics) {
        characteristic.onGet(() => {
          this.requireAvailable()
          return characteristic.value as CharacteristicValue
        })
      }
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Numbers already on a cached accessory, so a restart does not invent a reading. */
export function readingFromAccessory(accessory: PlatformAccessory, hap: HAP): Partial<NormalizedReading> {
  const air = accessory.getService(hap.Service.AirQualitySensor)
  const temperature = accessory.getService(hap.Service.TemperatureSensor)
  const humidity = accessory.getService(hap.Service.HumiditySensor)
  const carbon = accessory.getService(hap.Service.CarbonDioxideSensor)
  const light = accessory.getService(hap.Service.LightSensor)
  const battery = accessory.getService(hap.Service.Battery)
  return {
    radonShortBq: readNumber(air, RADON_SHORT),
    radonLongBq: readNumber(air, RADON_LONG),
    vocPpb: readNumber(air, VOC_PPB),
    pm1Micrograms: readNumber(air, PM1),
    mold: readNumber(air, MOLD),
    soundDb: readNumber(air, SOUND),
    pm25Micrograms: readNumber(air, hap.Characteristic.PM2_5Density),
    vocMicrograms: readNumber(air, hap.Characteristic.VOCDensity),
    pressureHpa: readNumber(temperature, PRESSURE) ?? readNumber(air, PRESSURE),
    temperatureC: readNumber(temperature, hap.Characteristic.CurrentTemperature),
    humidityPercent: readNumber(humidity, hap.Characteristic.CurrentRelativeHumidity),
    co2Ppm: readNumber(carbon, hap.Characteristic.CarbonDioxideLevel),
    lux: readNumber(light, hap.Characteristic.CurrentAmbientLightLevel),
    batteryPercent: readNumber(battery, hap.Characteristic.BatteryLevel),
  }
}

function readNumber(service: Service | undefined, characteristic: string | WithUUID<typeof Characteristic>): number | undefined {
  const lookup = characteristic as never
  if (service === undefined || !service.testCharacteristic(lookup)) {
    return undefined
  }
  const value = service.getCharacteristic(lookup)?.value
  return typeof value === 'number' ? value : undefined
}
