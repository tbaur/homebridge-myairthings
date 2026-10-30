/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * @fileoverview Build the services for one monitor.
 *
 * Air Quality is the primary service, and the others are linked to it, so
 * Home shows one tile. Extra services follow the sensors on that device.
 */

import type { HAP, PlatformAccessory, Service, WithUUID } from 'homebridge'

import type { SensorPlan } from '../types'
import {
  MOLD,
  MOLD_SPEC,
  PM1,
  PM1_SPEC,
  PRESSURE,
  PRESSURE_SPEC,
  RADON_LONG,
  RADON_SHORT,
  SOUND,
  SOUND_SPEC,
  VOC_PPB,
  VOC_PPB_SPEC,
  ensureCustom,
} from './eve'

type ServiceCtor = WithUUID<typeof Service>

export interface ArrangedServices {
  air: Service
  temperature?: Service
  humidity?: Service
  carbonDioxide?: Service
  light?: Service
  battery?: Service
  /** Where the Eve pressure characteristic lives. */
  pressure?: Service
}

export function arrangeServices(input: {
  hap: HAP
  accessory: PlatformAccessory
  plan: SensorPlan
  battery: boolean
}): ArrangedServices {
  const { hap, accessory, plan } = input
  const air = requireService(accessory, hap.Service.AirQualitySensor, 'Air Quality')
  air.setPrimaryService(true)
  const temperature = optional(accessory, hap.Service.TemperatureSensor, 'Temperature', plan.temperature)
  const humidity = optional(accessory, hap.Service.HumiditySensor, 'Humidity', plan.humidity)
  const carbonDioxide = optional(accessory, hap.Service.CarbonDioxideSensor, 'Carbon Dioxide', plan.carbonDioxide)
  const light = optional(accessory, hap.Service.LightSensor, 'Light', plan.light)
  const battery = optional(accessory, hap.Service.Battery, 'Battery', input.battery)
  decorateAir(hap, air, plan)
  const pressure = pressureService({ hap, accessory, air, temperature, wanted: plan.pressure })
  for (const service of [temperature, humidity, carbonDioxide, light, battery]) {
    if (service !== undefined) {
      link(air, service)
    }
  }
  dropUnused(hap, accessory, [air, temperature, humidity, carbonDioxide, light, battery])
  return { air, temperature, humidity, carbonDioxide, light, battery, pressure }
}

function decorateAir(hap: HAP, air: Service, plan: SensorPlan): void {
  if (plan.pm25) {
    air.getCharacteristic(hap.Characteristic.PM2_5Density).setProps({ maxValue: 1000, minValue: 0, minStep: 1 })
  }
  if (plan.voc) {
    air.getCharacteristic(hap.Characteristic.VOCDensity).setProps({ maxValue: 100_000, minValue: 0, minStep: 1 })
    ensureCustom(air, hap, VOC_PPB_SPEC)
  }
  if (plan.pm1) {
    ensureCustom(air, hap, PM1_SPEC)
  }
  if (plan.mold) {
    ensureCustom(air, hap, MOLD_SPEC)
  }
  if (plan.sound) {
    ensureCustom(air, hap, SOUND_SPEC)
  }
  if (!plan.pm25) {
    forget(air, 'PM2.5 Density')
  }
  if (!plan.voc) {
    forget(air, 'VOC Density')
    forget(air, VOC_PPB)
  }
  if (!plan.radonShort) {
    forget(air, RADON_SHORT)
  }
  if (!plan.radonLong) {
    forget(air, RADON_LONG)
  }
  if (!plan.pm1) {
    forget(air, PM1)
  }
  if (!plan.mold) {
    forget(air, MOLD)
  }
  if (!plan.sound) {
    forget(air, SOUND)
  }
}

function pressureService(input: {
  hap: HAP
  accessory: PlatformAccessory
  air: Service
  temperature: Service | undefined
  wanted: boolean
}): Service | undefined {
  const { hap, accessory, air, temperature, wanted } = input
  const existingTemperature = accessory.getService(hap.Service.TemperatureSensor)
  if (!wanted) {
    forget(air, PRESSURE)
    if (existingTemperature !== undefined) {
      forget(existingTemperature, PRESSURE)
    }
    return undefined
  }
  return temperature ?? air
}

/** Move pressure onto the service that should show it, once a real value exists. */
export function placePressure(hap: HAP, air: Service, host: Service, temperature: Service | undefined): void {
  if (host === air) {
    if (temperature !== undefined) {
      forget(temperature, PRESSURE)
    }
  } else {
    forget(air, PRESSURE)
  }
  ensureCustom(host, hap, PRESSURE_SPEC)
}

function optional(
  accessory: PlatformAccessory,
  type: ServiceCtor,
  name: string,
  wanted: boolean,
): Service | undefined {
  if (!wanted) {
    return undefined
  }
  return requireService(accessory, type, name)
}

function requireService(accessory: PlatformAccessory, type: ServiceCtor, name: string): Service {
  const existing = accessory.getService(type)
  if (existing !== undefined) {
    return existing
  }
  const created = new (type as unknown as new (displayName?: string) => Service)(name)
  return accessory.addService(created)
}

function forget(service: Service, characteristic: string): void {
  if (!service.testCharacteristic(characteristic)) {
    return
  }
  const current = service.getCharacteristic(characteristic)
  if (current !== undefined) {
    service.removeCharacteristic(current)
  }
}

function link(primary: Service, child: Service): void {
  if (!primary.linkedServices.includes(child)) {
    primary.addLinkedService(child)
  }
}

function dropUnused(hap: HAP, accessory: PlatformAccessory, keep: readonly (Service | undefined)[]): void {
  const managed = new Set([
    hap.Service.AirQualitySensor.UUID,
    hap.Service.TemperatureSensor.UUID,
    hap.Service.HumiditySensor.UUID,
    hap.Service.CarbonDioxideSensor.UUID,
    hap.Service.LightSensor.UUID,
    hap.Service.Battery.UUID,
  ])
  const kept = new Set(keep.flatMap((service) => service === undefined ? [] : [service.UUID]))
  for (const service of [...accessory.services]) {
    if (managed.has(service.UUID) && !kept.has(service.UUID)) {
      accessory.removeService(service)
    }
  }
}
