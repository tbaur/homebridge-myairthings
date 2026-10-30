/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 */

import type { HttpResponse, JsonRequest } from '../../../src/api/http'
import { AirthingsClient } from '../../../src/api/client'
import { rateLimitWaitMs } from '../../../src/api/rate-limit'
import { parseAccounts, parseDevices, parseSensors, parseToken } from '../../../src/api/parse'
import { accountsUrl, devicesUrl, sensorsUrl } from '../../../src/api/urls'
import { parseRecordedAt } from '../../../src/readings/sample'
import { AuthError, HttpStatusError, NoAccountsError, ProtocolError, RateLimitedError } from '../../../src/utils/errors'
import { fakeClientId, fakeClientSecret } from '../../helpers/secrets'

const ACCOUNT = '00000000-0000-0000-0000-000000000001'

function json(status: number, body: unknown, headers: Record<string, string> = {}): HttpResponse {
  return { status, body: JSON.stringify(body), headers }
}

describe('urls', () => {
  it('builds the consumer paths and refuses an account id that could change the path', () => {
    expect(accountsUrl()).toBe('https://consumer-api.airthings.com/v1/accounts')
    expect(devicesUrl(ACCOUNT)).toContain(`/accounts/${ACCOUNT}/devices`)
    expect(devicesUrl('account_01')).toContain('/accounts/account_01/devices')
    expect(sensorsUrl(ACCOUNT, 2)).toContain('unit=metric')
    expect(sensorsUrl(ACCOUNT, 2)).toContain('pageNumber=2')
    for (const unsafe of ['', '../etc', 'a/b', 'a%2Fb', 'a?b', 'a#b', 'a.b', 'x'.repeat(129)]) {
      expect(() => devicesUrl(unsafe)).toThrow(ProtocolError)
    }
  })
})

describe('rate limit headers', () => {
  const now = Date.parse('2026-01-01T00:00:00Z')

  it('waits until reset when the budget is spent', () => {
    expect(rateLimitWaitMs({ 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String((now / 1000) + 30) }, now)).toBe(30_000)
    expect(rateLimitWaitMs({ 'retry-after': '15' }, now)).toBe(15_000)
    expect(rateLimitWaitMs({ 'x-ratelimit-remaining': '4' }, now)).toBeUndefined()
  })
})

describe('parse', () => {
  it('reads a token, accounts, devices, and a sensor page', () => {
    expect(parseToken(JSON.stringify({ access_token: 'test-token', token_type: 'Bearer', expires_in: 10 })).token).toBe('test-token')
    expect(parseAccounts(JSON.stringify({ accounts: [{ id: ACCOUNT }, { id: '' }] }))).toEqual([{ id: ACCOUNT }])
    expect(parseDevices(JSON.stringify({
      devices: [{ serialNumber: '2960000001', name: 'Zone One', type: 'VIEW_PLUS', sensors: ['temp', 1] }, { serialNumber: 'no' }],
    }))).toEqual({
      received: 2,
      rejected: ['no'],
      devices: [{ serialNumber: '2960000001', name: 'Zone One', type: 'VIEW_PLUS', sensors: ['temp'] }],
    })
    const page = parseSensors(JSON.stringify({
      results: [{ serialNumber: '2960000001', recorded: '2026-01-01T00:00:00', batteryPercentage: 90, sensors: [{ sensorType: 'temp', value: 21, unit: 'c' }] }],
      hasNext: true,
    }), parseRecordedAt)
    expect(page.hasNext).toBe(true)
    expect(page.results[0]?.batteryPercent).toBe(90)
    expect(parseSensors(JSON.stringify({
      results: [{ serialNumber: '2960ABCD01', recorded: '2026-01-01T00:00:00Z', sensors: [] }],
    }), parseRecordedAt).results[0]?.serialNumber).toBe('2960abcd01')
  })

  it('rejects a body that is not the documented shape', () => {
    expect(() => parseToken(JSON.stringify({ access_token: 'bad\ntoken', expires_in: 10 }))).toThrow(ProtocolError)
    expect(() => parseAccounts('{}')).toThrow(ProtocolError)
    expect(() => parseDevices('[]')).toThrow(ProtocolError)
    expect(() => parseSensors('{"results":1}', parseRecordedAt)).toThrow(ProtocolError)
  })
})

describe('AirthingsClient', () => {
  const calls: JsonRequest[] = []

  function client(handler: (request: JsonRequest) => HttpResponse | Promise<HttpResponse>): AirthingsClient {
    calls.length = 0
    return new AirthingsClient({
      clientId: fakeClientId(),
      clientSecret: fakeClientSecret(),
      now: () => Date.parse('2026-01-01T00:00:00Z'),
      transport: async (request) => {
        calls.push(request)
        return handler(request)
      },
    })
  }

  it('sends the documented token body and bearer for the API, and does not put the secret in the URL', async () => {
    const api = client((request) => {
      if (request.url.endsWith('/token')) {
        return json(200, { access_token: 'test-token', token_type: 'Bearer', expires_in: 3600 })
      }
      if (request.url.endsWith('/accounts')) {
        return json(200, { accounts: [{ id: ACCOUNT }] })
      }
      return json(200, { devices: [] })
    })

    await api.listDevices()

    const tokenCall = calls[0]
    expect(tokenCall?.url).toBe('https://accounts-api.airthings.com/v1/token')
    expect(tokenCall?.method).toBe('POST')
    expect(tokenCall?.body).toEqual({
      grant_type: 'client_credentials',
      client_id: fakeClientId(),
      client_secret: fakeClientSecret(),
      scope: ['read:device:current_values'],
    })
    expect(tokenCall?.headers?.authorization).toBeUndefined()
    expect(tokenCall?.url.includes(fakeClientSecret())).toBe(false)
    expect(calls[1]?.headers?.authorization).toBe('Bearer test-token')
    expect(calls).toHaveLength(3)
    await api.listDevices()
    expect(calls.filter((call) => call.url.endsWith('/token'))).toHaveLength(1)
  })

  it('retries once after a 401 and pages sensors', async () => {
    let devices = 0
    const api = client((request) => {
      if (request.url.endsWith('/token')) {
        return json(200, { access_token: 'test-token', token_type: 'Bearer', expires_in: 3600 })
      }
      if (request.url.endsWith('/accounts')) {
        return json(200, { accounts: [{ id: ACCOUNT }] })
      }
      if (request.url.endsWith('/devices')) {
        devices += 1
        return json(devices === 1 ? 401 : 200, { devices: [] })
      }
      if (request.url.includes('pageNumber=1')) {
        return json(200, {
          hasNext: true,
          results: [{ serialNumber: '2960000001', sensors: [{ sensorType: 'radonShortTermAvg', value: 1, unit: 'pci' }] }],
        })
      }
      return json(200, { hasNext: false, results: [] })
    })

    await expect(api.listDevices()).resolves.toEqual([])
    const batch = await api.listSamples([ACCOUNT, ACCOUNT])
    expect(batch.readings.get('2960000001')?.radonShortBq).toBe(37)
    expect(calls.filter((call) => call.url.includes('/sensors'))).toHaveLength(2)
  })

  it('stops when the hourly budget is spent', async () => {
    const api = client((request) => {
      if (request.url.endsWith('/token')) {
        return json(200, { access_token: 'test-token', token_type: 'Bearer', expires_in: 3600 })
      }
      return json(200, { results: [], hasNext: false }, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1767225660' })
    })
    await api.listSamples([ACCOUNT])
    await expect(api.listSamples([ACCOUNT])).rejects.toBeInstanceOf(RateLimitedError)
  })

  it('keeps a 15 second Retry-After on a 429', async () => {
    const api = client((request) => (
      request.url.endsWith('/token')
        ? json(200, { access_token: 'test-token', token_type: 'Bearer', expires_in: 3600 })
        : json(429, {}, { 'retry-after': '15' })
    ))
    await expect(api.listDevices()).rejects.toMatchObject({ retryAfterMs: 15_000 })
  })

  it('rejects a redirect and an empty account list', async () => {
    const redirecting = client((request) => (
      request.url.endsWith('/token')
        ? json(200, { access_token: 'test-token', token_type: 'Bearer', expires_in: 3600 })
        : json(302, {})
    ))
    await expect(redirecting.listDevices()).rejects.toThrow('Airthings returned 302')

    const empty = client((request) => (
      request.url.endsWith('/token')
        ? json(200, { access_token: 'test-token', token_type: 'Bearer', expires_in: 3600 })
        : json(200, { accounts: [] })
    ))
    await expect(empty.listDevices()).rejects.toBeInstanceOf(NoAccountsError)

    const denied = client(() => json(401, { access_token: 'should-not-leak' }))
    await expect(denied.listDevices()).rejects.toBeInstanceOf(AuthError)
    await expect(denied.listDevices()).rejects.not.toThrow('should-not-leak')
  })

  it('treats a 400 from the token endpoint as a rejected client, and a 400 elsewhere as a status', async () => {
    const invalidClient = client(() => json(400, { error: 'invalid_client' }))
    await expect(invalidClient.listDevices()).rejects.toBeInstanceOf(AuthError)

    const badRead = client((request) => (
      request.url.endsWith('/token')
        ? json(200, { access_token: 'test-token', token_type: 'Bearer', expires_in: 3600 })
        : json(400, {})
    ))
    await expect(badRead.listDevices()).rejects.toBeInstanceOf(HttpStatusError)
  })
})
