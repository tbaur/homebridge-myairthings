/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 */

import type { CloudClient } from '../../src/api/client'
import { CloudSession } from '../../src/session'
import { AuthError, ConnectionError, NoAccountsError, RateLimitedError } from '../../src/utils/errors'
import type { ListedDevice, PluginLogger } from '../../src/types'

const PLUS: ListedDevice = {
  accountId: '00000000-0000-0000-0000-000000000001',
  serialNumber: '2960000001',
  name: 'Zone One',
  type: 'VIEW_PLUS',
  sensors: ['radonShortTermAvg', 'co2', 'virusRisk'],
}

function logger(): PluginLogger & { lines: string[] } {
  const lines: string[] = []
  const write = (level: string) => (message: string) => {
    lines.push(`${level} ${message}`)
  }
  return { lines, info: write('info'), warn: write('warn'), error: write('error'), debug: write('debug') }
}

function client(overrides: Partial<CloudClient> = {}): CloudClient & { devices: jest.Mock, samples: jest.Mock } {
  return {
    blockedForMs: () => 0,
    listDevices: jest.fn().mockResolvedValue([PLUS]),
    listSamples: jest.fn().mockResolvedValue({ readings: new Map(), ignored: ['2960000001\ttemp\tk'] }),
    abort: () => undefined,
    ...overrides,
    devices: undefined as never,
    samples: undefined as never,
  }
}

describe('CloudSession', () => {
  it('publishes a monitor and logs an unmapped sensor once', async () => {
    const log = logger()
    const api = client()
    const session = new CloudSession({ client: api, log, intervalMs: 300_000, now: () => 0 })

    const first = await session.poll()
    await session.poll()

    expect(first.view?.monitors).toHaveLength(1)
    expect(first.view?.listedSerials).toEqual([PLUS.serialNumber])
    expect(first.view?.monitors[0]?.samplePresent).toBe(false)
    expect(first.view?.deviceListFresh).toBe(true)
    expect(first.authFailed).toBe(false)
    expect(first.cloudOffline).toBe(false)
    expect(first.reportSignals).toBe(true)
    expect(log.lines.filter((line) => line.includes('unmapped'))).toHaveLength(1)
    expect(log.lines.filter((line) => line.includes('did not use temp'))).toEqual([
      'info Zone One did not use temp; unit "k" is not converted',
    ])
  })

  it('keeps the monitor list when a later account list has no ids', async () => {
    const log = logger()
    const listDevices = jest.fn()
      .mockResolvedValueOnce([PLUS])
      .mockRejectedValueOnce(new NoAccountsError())
    const session = new CloudSession({
      client: client({ listDevices }),
      log,
      intervalMs: 300_000,
      now: () => 0,
    })

    const first = await session.poll()
    for (let poll = 0; poll < 5; poll += 1) {
      await session.poll()
    }
    const empty = await session.poll()
    const again = await session.poll()

    expect(first.view?.monitors).toHaveLength(1)
    expect(empty.view).toBeUndefined()
    expect(empty.reportSignals).toBe(false)
    expect(empty.unreachable).toBe(false)
    expect(empty.authFailed).toBe(false)
    expect(again.view?.monitors).toHaveLength(1)
    expect(listDevices).toHaveBeenCalledTimes(2)
  })

  it('keeps an unmapped sensor name on one log line', async () => {
    const log = logger()
    const session = new CloudSession({
      client: client({
        listDevices: jest.fn().mockResolvedValue([{ ...PLUS, sensors: ['temp', 'bad\nname'] }]),
      }),
      log,
      intervalMs: 300_000,
      now: () => 0,
    })

    await session.poll()
    const line = log.lines.find((entry) => entry.includes('unmapped'))
    expect(line).toBe('info Zone One reports unmapped sensors: bad\uFFFDname')
  })

  it('does not treat a rate limit or a rejected secret as the cloud being offline', async () => {
    const log = logger()
    const listDevices = jest.fn()
      .mockRejectedValueOnce(new RateLimitedError(5_000))
      .mockRejectedValue(new AuthError())
    const session = new CloudSession({
      client: client({ listDevices }),
      log,
      intervalMs: 300_000,
      now: () => 0,
    })

    const limited = await session.poll()
    const rejected = await session.poll()
    await session.poll()
    const stillRejected = await session.poll()

    expect(limited.waitMs).toBe(5_000)
    expect(limited.reportSignals).toBe(false)
    expect(limited.cloudOffline).toBe(false)
    expect(rejected.authFailed).toBe(true)
    expect(rejected.cloudOffline).toBe(false)
    expect(rejected.reportSignals).toBe(true)
    expect(stillRejected.unreachable).toBe(true)
    expect(stillRejected.authFailed).toBe(true)
    expect(stillRejected.cloudOffline).toBe(false)
    expect(stillRejected.waitMs).toBe(30_000)
    expect(log.lines.filter((line) => line.includes('rejected the client credentials'))).toHaveLength(1)
  })

  it('reports the cloud offline after three unreachable polls', async () => {
    const log = logger()
    const session = new CloudSession({
      client: client({ listDevices: jest.fn().mockRejectedValue(new ConnectionError('down')) }),
      log,
      intervalMs: 300_000,
      now: () => 0,
    })

    const first = await session.poll()
    const second = await session.poll()
    const third = await session.poll()

    expect(first.cloudOffline).toBe(false)
    expect(first.authFailed).toBe(false)
    expect(first.reportSignals).toBe(true)
    expect(second.cloudOffline).toBe(false)
    expect(third.cloudOffline).toBe(true)
    expect(third.unreachable).toBe(true)
    expect(third.waitMs).toBe(300_000)
  })

  it('warns once for a duplicate serial and does not treat a bug as an outage', async () => {
    const log = logger()
    const twin = { ...PLUS, name: 'Other' }
    const listDevices = jest.fn().mockResolvedValue([PLUS, twin])
    const listSamples = jest.fn()
      .mockResolvedValueOnce({ readings: new Map(), ignored: [] })
      .mockRejectedValueOnce(new Error('bug'))
    const session = new CloudSession({
      client: client({ listDevices, listSamples }),
      log,
      intervalMs: 300_000,
      now: () => 0,
    })
    const view = await session.poll()
    expect(view.view?.monitors).toHaveLength(1)
    expect(log.lines.some((line) => line.includes('duplicate serial'))).toBe(true)
    const failed = await session.poll()
    expect(failed.reportSignals).toBe(false)
    expect(failed.cloudOffline).toBe(false)
    expect(failed.authFailed).toBe(false)
    expect(log.lines.some((line) => line.includes('poll failed'))).toBe(true)
  })

  it('says when the API is reachable again', async () => {
    const log = logger()
    const listDevices = jest.fn()
      .mockRejectedValueOnce(new ConnectionError('down'))
      .mockResolvedValue([PLUS])
    const session = new CloudSession({
      client: client({ listDevices }),
      log,
      intervalMs: 300_000,
      now: () => 0,
    })

    await session.poll()
    const recovered = await session.poll()

    expect(recovered.view?.monitors).toHaveLength(1)
    expect(log.lines).toContain('info Airthings is reachable again')
  })
})
