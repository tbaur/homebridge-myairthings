/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * @fileoverview Which signal is on, without opening the SQLite file.
 */

import {
  AirthingsSignals,
  AUTH_FAILED_SUMMARY,
  CLOUD_OFFLINE_SUMMARY,
  staleSignalName,
  staleSummary,
} from '../../src/airthings-signals'
import type { SignalWriter } from '../../src/airthings-signals'
import type { SignalState } from '../../src/pagerduty-signals'

interface WriteCall {
  signal: string
  state: SignalState
}

class MemoryWriter implements SignalWriter {
  readonly writes: WriteCall[] = []
  closed = false

  write(signal: string, state: SignalState): void {
    this.writes.push({ signal, state: { ...state } })
  }

  close(): void {
    this.closed = true
  }
}

function last(writer: MemoryWriter, signal: string): SignalState | undefined {
  return writer.writes.filter((call) => call.signal === signal).at(-1)?.state
}

describe('AirthingsSignals', () => {
  const zoneOne = { serialNumber: '2960000001', name: 'Zone One', fresh: false }
  const zoneTwo = { serialNumber: '2989000001', name: 'Zone Two', fresh: true }

  it('pages a rejected client and turns the cloud and the monitors off', () => {
    const writer = new MemoryWriter()
    const signals = new AirthingsSignals(writer)
    signals.record({
      authFailed: false,
      cloudOffline: false,
      deviceListFresh: true,
      monitors: [zoneOne],
    })
    signals.record({ authFailed: true, cloudOffline: true, deviceListFresh: false })

    expect(last(writer, 'auth-failed')).toEqual({ active: true, severity: 'error', summary: AUTH_FAILED_SUMMARY })
    expect(last(writer, 'cloud-offline')).toEqual({ active: false, severity: 'error', summary: CLOUD_OFFLINE_SUMMARY })
    expect(last(writer, staleSignalName(zoneOne.serialNumber))).toEqual({
      active: false,
      severity: 'warning',
      summary: staleSummary('Zone One', zoneOne.serialNumber),
    })
  })

  it('pages the cloud after the account is unreachable and turns stale rows off', () => {
    const writer = new MemoryWriter()
    const signals = new AirthingsSignals(writer)
    signals.record({
      authFailed: false,
      cloudOffline: false,
      deviceListFresh: true,
      monitors: [zoneOne],
    })
    signals.record({ authFailed: false, cloudOffline: true, deviceListFresh: false })

    expect(last(writer, 'cloud-offline')?.active).toBe(true)
    expect(last(writer, 'auth-failed')?.active).toBe(false)
    expect(last(writer, staleSignalName(zoneOne.serialNumber))?.active).toBe(false)
  })

  it('pages only the monitor whose sample is stale while the account answers', () => {
    const writer = new MemoryWriter()
    const signals = new AirthingsSignals(writer)
    signals.record({
      authFailed: false,
      cloudOffline: false,
      deviceListFresh: true,
      monitors: [zoneOne, zoneTwo],
    })

    expect(last(writer, staleSignalName(zoneOne.serialNumber))?.active).toBe(true)
    expect(last(writer, staleSignalName(zoneTwo.serialNumber))?.active).toBe(false)
    expect(last(writer, 'cloud-offline')?.active).toBe(false)
  })

  it('lowercases the serial and clears a monitor the fresh device list omitted', () => {
    const writer = new MemoryWriter()
    const signals = new AirthingsSignals(writer)
    signals.record({
      authFailed: false,
      cloudOffline: false,
      deviceListFresh: true,
      monitors: [{ serialNumber: '2960ABCD01', name: 'Zone One', fresh: false }],
    })
    const kept = writer.writes.filter((call) => call.signal.startsWith('stale.')).length
    signals.record({
      authFailed: false,
      cloudOffline: false,
      deviceListFresh: false,
      monitors: [],
    })
    expect(writer.writes.filter((call) => call.signal.startsWith('stale.')).length).toBe(kept)
    signals.record({
      authFailed: false,
      cloudOffline: false,
      deviceListFresh: true,
      monitors: [],
    })

    expect(staleSignalName('2960ABCD01')).toBe('stale.2960abcd01')
    expect(last(writer, 'stale.2960abcd01')).toEqual({
      active: false,
      severity: 'warning',
      summary: staleSummary('Zone One', '2960ABCD01'),
    })
  })

  it('skips a serial the store would reject', () => {
    const writer = new MemoryWriter()
    const signals = new AirthingsSignals(writer)
    signals.record({
      authFailed: false,
      cloudOffline: false,
      deviceListFresh: true,
      monitors: [{ serialNumber: 'nope!', name: 'Zone One', fresh: false }],
    })

    expect(writer.writes.map((call) => call.signal)).toEqual(['auth-failed', 'cloud-offline'])
  })

  it('leaves known monitors alone when this poll has no device list', () => {
    const writer = new MemoryWriter()
    const signals = new AirthingsSignals(writer)
    signals.record({
      authFailed: false,
      cloudOffline: false,
      deviceListFresh: true,
      monitors: [zoneOne],
    })
    const staleWrites = writer.writes.filter((call) => call.signal.startsWith('stale.')).length
    signals.record({ authFailed: false, cloudOffline: false, deviceListFresh: false })

    expect(writer.writes.filter((call) => call.signal.startsWith('stale.')).length).toBe(staleWrites)
    expect(last(writer, 'auth-failed')?.active).toBe(false)
  })

  it('uses the serial when the monitor has no name', () => {
    const writer = new MemoryWriter()
    const signals = new AirthingsSignals(writer)
    signals.record({
      authFailed: false,
      cloudOffline: false,
      deviceListFresh: true,
      monitors: [{ serialNumber: '2960000001', name: '   ', fresh: false }],
    })

    expect(last(writer, staleSignalName('2960000001'))).toEqual({
      active: true,
      severity: 'warning',
      summary: staleSummary('', '2960000001'),
    })
  })

  it('turns a known monitor stale when its sample expires, and ignores an unknown serial', () => {
    const writer = new MemoryWriter()
    const signals = new AirthingsSignals(writer)
    signals.expire(zoneTwo.serialNumber)
    expect(writer.writes.filter((call) => call.signal.startsWith('stale.'))).toEqual([])

    signals.record({
      authFailed: false,
      cloudOffline: false,
      deviceListFresh: true,
      monitors: [zoneTwo],
    })
    signals.expire(zoneTwo.serialNumber)

    expect(last(writer, staleSignalName(zoneTwo.serialNumber))?.active).toBe(true)
  })

  it('closes the writer', () => {
    const writer = new MemoryWriter()
    new AirthingsSignals(writer).close()
    expect(writer.closed).toBe(true)
  })
})
