/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * @fileoverview Turn consumer API JSON into the fields this plugin uses.
 *
 * A bad payload throws. It does not throw the payload: the body can echo a
 * token, and the message would end up in a log.
 */

import type { SensorRecord, SensorValue } from '../types'
import { ProtocolError } from '../utils/errors'

export interface AccessToken {
  token: string
  type: string
  expiresInSec: number
}

export interface AccountRow {
  id: string
}

export interface DeviceRow {
  serialNumber: string
  name: string
  type: string
  /** Undefined when the payload omitted `sensors`. An empty array was present. */
  sensors?: string[]
}

export interface ParsedDeviceList {
  devices: DeviceRow[]
  rejected: string[]
  received: number
}

export interface SensorPage {
  results: SensorRecord[]
  hasNext: boolean
}

export function parseToken(body: string): AccessToken {
  const record = object(body, 'token response')
  const token = text(record, 'access_token')
  const type = text(record, 'token_type') ?? 'Bearer'
  const expires = number(record, 'expires_in')
  if (token === undefined || expires === undefined || expires <= 0 || !headerToken(token) || !headerToken(type)) {
    throw new ProtocolError('Airthings returned a token response this plugin could not use')
  }
  return { token, type, expiresInSec: expires }
}

export function parseAccounts(body: string): AccountRow[] {
  const record = object(body, 'account list')
  const accounts = record.accounts
  if (!Array.isArray(accounts)) {
    throw new ProtocolError('Airthings returned an account list this plugin could not use')
  }
  return accounts.flatMap((entry) => {
    if (!isRecord(entry)) {
      return []
    }
    const id = text(entry, 'id')
    return id === undefined ? [] : [{ id }]
  })
}

export function parseDevices(body: string): ParsedDeviceList {
  const record = object(body, 'device list')
  const devices = record.devices
  if (!Array.isArray(devices)) {
    throw new ProtocolError('Airthings returned a device list this plugin could not use')
  }
  const parsed: DeviceRow[] = []
  const rejected: string[] = []
  for (const entry of devices) {
    if (!isRecord(entry)) {
      rejected.push('(unreadable)')
      continue
    }
    const serialNumber = text(entry, 'serialNumber')
    if (serialNumber === undefined || !/^[0-9A-Za-z]{4,32}$/.test(serialNumber)) {
      rejected.push(serialNumber ?? '(missing serial)')
      continue
    }
    const sensors = Array.isArray(entry.sensors)
      ? entry.sensors.filter((sensor): sensor is string => typeof sensor === 'string')
      : undefined
    parsed.push({
      serialNumber: serialNumber.toLowerCase(),
      name: text(entry, 'name') ?? '',
      type: text(entry, 'type') ?? '',
      sensors,
    })
  }
  return { devices: parsed, rejected, received: devices.length }
}

export function parseSensors(body: string, recordedAt: (value: string) => number | undefined): SensorPage {
  const record = object(body, 'sensor results')
  const results = record.results
  if (!Array.isArray(results)) {
    throw new ProtocolError('Airthings returned sensor results this plugin could not use')
  }
  return {
    hasNext: record.hasNext === true,
    results: results.flatMap((entry) => parseOneSample(entry, recordedAt)),
  }
}

function parseOneSample(
  entry: unknown,
  recordedAt: (value: string) => number | undefined,
): SensorRecord[] {
  if (!isRecord(entry)) {
    return []
  }
  const serialNumber = text(entry, 'serialNumber')
  if (serialNumber === undefined || !/^[0-9A-Za-z]{4,32}$/.test(serialNumber)) {
    return []
  }
  const sensors = Array.isArray(entry.sensors) ? entry.sensors.flatMap(parseSensor) : []
  const recorded = text(entry, 'recorded')
  const battery = number(entry, 'batteryPercentage')
  return [{
    serialNumber: serialNumber.toLowerCase(),
    sensors,
    recordedAt: recorded === undefined ? undefined : recordedAt(recorded),
    batteryPercent: battery === undefined ? undefined : clamp(battery, 0, 100),
  }]
}

function parseSensor(entry: unknown): SensorValue[] {
  if (!isRecord(entry)) {
    return []
  }
  const sensorType = text(entry, 'sensorType')
  const value = number(entry, 'value')
  const unit = text(entry, 'unit') ?? ''
  if (sensorType === undefined || value === undefined) {
    return []
  }
  return [{ sensorType, value, unit }]
}

function object(body: string, what: string): Record<string, unknown> {
  let parsed: unknown
  try {
    parsed = JSON.parse(body) as unknown
  } catch {
    throw new ProtocolError(`Airthings returned a ${what} that was not JSON`)
  }
  if (!isRecord(parsed)) {
    throw new ProtocolError(`Airthings returned a ${what} this plugin could not use`)
  }
  return parsed
}

function headerToken(value: string): boolean {
  return /^[\x21-\x7E]+$/.test(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function number(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
