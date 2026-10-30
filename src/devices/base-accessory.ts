/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * @fileoverview What every monitor accessory shares.
 *
 * Unavailable means No Response. A cloud blip does not use that path: the
 * sensor stays up and StatusActive goes false, so the last reading remains.
 */

import type { Characteristic, CharacteristicValue, PlatformAccessory, Service, WithUUID } from 'homebridge'

import { MANUFACTURER } from '../settings'
import type { AccessoryHost } from './host'

export type ServiceConstructor = {
  UUID: string
  new (displayName?: string, subtype?: string): Service
}

type CharacteristicLike = string | WithUUID<typeof Characteristic>

export interface MonitorInit {
  host: AccessoryHost
  accessory: PlatformAccessory
  displayName: string
  model: string
  serialNumber: string
  unavailable: boolean
}

export abstract class BaseAccessory {
  protected readonly host: AccessoryHost
  protected readonly accessory: PlatformAccessory
  displayName: string
  protected readonly unavailable: boolean

  constructor(init: MonitorInit) {
    this.host = init.host
    this.accessory = init.accessory
    this.displayName = init.displayName
    this.unavailable = init.unavailable
    this.configureInformation(init)
  }

  /** Refresh Accessory Information after a later poll renames the monitor. */
  updateIdentity(input: { displayName: string, model: string, serialNumber: string }): void {
    this.displayName = input.displayName
    this.configureInformation({
      host: this.host,
      accessory: this.accessory,
      displayName: input.displayName,
      model: input.model,
      serialNumber: input.serialNumber,
      unavailable: this.unavailable,
    })
  }

  protected requireAvailable(): void {
    if (this.unavailable) {
      throw new this.host.api.hap.HapStatusError(this.host.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE)
    }
  }

  protected publish(service: Service, characteristic: CharacteristicLike, value: CharacteristicValue): void {
    const name = characteristic as never
    const current = service.getCharacteristic(name)
    if (current === undefined || current.value === value) {
      return
    }
    service.updateCharacteristic(name, value)
  }

  private configureInformation(init: MonitorInit): void {
    const { Characteristic, Service: HapService } = this.host.hap
    const service = this.accessory.getService(HapService.AccessoryInformation)
      ?? this.accessory.addService(HapService.AccessoryInformation)
    service
      .setCharacteristic(Characteristic.Manufacturer, MANUFACTURER)
      .setCharacteristic(Characteristic.Model, init.model)
      .setCharacteristic(Characteristic.SerialNumber, init.serialNumber)
      .setCharacteristic(Characteristic.FirmwareRevision, this.host.pluginVersion)
      .setCharacteristic(Characteristic.Name, this.displayName)
  }
}
