/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * @fileoverview Characteristics Eve already knows, and three this plugin owns.
 *
 * HAP looks a string up as a display name, not as a UUID. These names are
 * the lookup keys. The UUIDs are what Eve matches.
 *
 * Radon UUIDs are the Airthings GATT characteristics. Pressure and VOC ppb
 * are Eve's. PM1, mold risk, and sound have no Eve UUID; they are labeled
 * for apps that show every characteristic.
 */

import { Formats, Perms, type CharacteristicProps, type HAP, type Service } from 'homebridge'

/** Airthings GATT: radon one-day average, Bq/m³. Eve displays this. */
export const RADON_SHORT_UUID = 'b42e01aa-ade7-11e4-89d3-123b93f75cba'
export const RADON_SHORT = 'Radon'

/** Airthings GATT: radon long-term average, Bq/m³. */
export const RADON_LONG_UUID = 'b42e0a4c-ade7-11e4-89d3-123b93f75cba'
export const RADON_LONG = 'Radon Average'

/** Eve Weather air pressure, hPa. */
export const PRESSURE_UUID = 'e863f10f-079e-48ff-8f27-9c2605a29f52'
export const PRESSURE = 'Air Pressure'

/** Eve Room VOC, ppb. */
export const VOC_PPB_UUID = 'e863f10b-079e-48ff-8f27-9c2605a29f52'
export const VOC_PPB = 'VOC'

/** This plugin. Eve has no PM1 characteristic. */
export const PM1_UUID = '7c2a9e14-5b30-4d8f-9a61-2e0c8b4f6d13'
export const PM1 = 'PM1 Density'

/** This plugin. Mold risk is an index, not a spore count. */
export const MOLD_UUID = '1f6d3b80-9c24-4a57-8e10-5b7a2d9c0e46'
export const MOLD = 'Mold Risk'

/** This plugin. Sound level in dB. */
export const SOUND_UUID = '4e8b1c60-2a75-4f93-b1d8-6c0e9a3f5b27'
export const SOUND = 'Sound Level'

interface Spec {
  name: string
  uuid: string
  unit: string
  format: CharacteristicProps['format']
  minValue: number
  maxValue: number
  minStep: number
}

export function ensureCustom(service: Service, hap: HAP, spec: Spec): void {
  if (service.testCharacteristic(spec.name)) {
    return
  }
  service.addCharacteristic(new hap.Characteristic(spec.name, spec.uuid, {
    format: spec.format,
    perms: [Perms.PAIRED_READ, Perms.NOTIFY],
    unit: spec.unit,
    minValue: spec.minValue,
    maxValue: spec.maxValue,
    minStep: spec.minStep,
  }))
}

export const RADON_SHORT_SPEC: Spec = {
  name: RADON_SHORT, uuid: RADON_SHORT_UUID, unit: 'Bq/m³', format: Formats.UINT16, minValue: 0, maxValue: 20000, minStep: 1,
}
export const RADON_LONG_SPEC: Spec = {
  name: RADON_LONG, uuid: RADON_LONG_UUID, unit: 'Bq/m³', format: Formats.UINT16, minValue: 0, maxValue: 20000, minStep: 1,
}
export const PRESSURE_SPEC: Spec = {
  name: PRESSURE, uuid: PRESSURE_UUID, unit: 'hPa', format: Formats.UINT16, minValue: 500, maxValue: 1200, minStep: 1,
}
export const VOC_PPB_SPEC: Spec = {
  name: VOC_PPB, uuid: VOC_PPB_UUID, unit: 'ppb', format: Formats.UINT16, minValue: 0, maxValue: 65535, minStep: 1,
}
export const PM1_SPEC: Spec = {
  name: PM1, uuid: PM1_UUID, unit: 'µg/m³', format: Formats.FLOAT, minValue: 0, maxValue: 1000, minStep: 0.1,
}
export const MOLD_SPEC: Spec = {
  name: MOLD, uuid: MOLD_UUID, unit: '', format: Formats.UINT8, minValue: 0, maxValue: 10, minStep: 1,
}
export const SOUND_SPEC: Spec = {
  name: SOUND, uuid: SOUND_UUID, unit: 'dB', format: Formats.FLOAT, minValue: 0, maxValue: 120, minStep: 0.1,
}
