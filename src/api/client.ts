/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * @fileoverview Consumer API client.
 *
 * One logical operation is a device list or a sensor page. The session, not
 * this class, decides whether an error is an outage.
 */

import type { HttpResponse, JsonRequest } from './http'
import { requestJson } from './http'
import { rateLimitWaitMs } from './rate-limit'
import { parseAccounts, parseDevices, parseSensors, parseToken } from './parse'
import { accountsUrl, devicesUrl, sensorsUrl } from './urls'
import { normalizeSample, parseRecordedAt } from '../readings/sample'
import {
  CONNECT_TIMEOUT_MS,
  DEFAULT_RATE_LIMIT_WAIT_MS,
  MAX_RESPONSE_BYTES,
  MAX_SENSOR_PAGES,
  REQUEST_TIMEOUT_MS,
  TOKEN_SCOPE,
  TOKEN_URL,
} from '../settings'
import type { ListedDevice, NormalizedReading, PluginLogger } from '../types'
import { AuthError, HttpStatusError, NoAccountsError, RateLimitedError } from '../utils/errors'
import { forLog } from '../utils/redact'

export interface SampleBatch {
  readings: ReadonlyMap<string, NormalizedReading>
  ignored: readonly string[]
}

/** What the session needs from the API. */
export interface CloudClient {
  blockedForMs(now: number): number
  listDevices(): Promise<ListedDevice[]>
  listSamples(accountIds: readonly string[]): Promise<SampleBatch>
  abort(): void
}

interface Token {
  value: string
  type: string
  expiresAt: number
}

interface ClientOptions {
  clientId: string
  clientSecret: string
  transport?: (request: JsonRequest) => Promise<HttpResponse>
  now?: () => number
  log?: PluginLogger
}

/** Talks to the consumer API. Holds the access token and the rate-limit clock. */
export class AirthingsClient implements CloudClient {
  private readonly transport: (request: JsonRequest) => Promise<HttpResponse>
  private readonly now: () => number
  private token?: Token
  private notBefore = 0
  private abortController = new AbortController()

  constructor(private readonly options: ClientOptions) {
    this.transport = options.transport ?? requestJson
    this.now = options.now ?? Date.now
  }

  blockedForMs(now: number): number {
    return Math.max(0, this.notBefore - now)
  }

  abort(): void {
    this.abortController.abort()
    this.abortController = new AbortController()
  }

  async listDevices(): Promise<ListedDevice[]> {
    const accounts = parseAccounts((await this.authorized(accountsUrl())).body)
    if (accounts.length === 0) {
      // No account id was read, so this is not an empty home. Cached monitors stay.
      this.options.log?.info('Airthings returned no accounts')
      throw new NoAccountsError()
    }
    const devices: ListedDevice[] = []
    let received = 0
    for (const account of accounts) {
      const parsed = parseDevices((await this.authorized(devicesUrl(account.id))).body)
      received += parsed.received
      for (const serial of parsed.rejected) {
        this.options.log?.warn(rejectedDeviceLine(serial))
      }
      for (const row of parsed.devices) {
        devices.push({
          accountId: account.id,
          serialNumber: row.serialNumber,
          name: row.name,
          type: row.type,
          sensors: row.sensors ?? [],
          sensorsOmitted: row.sensors === undefined,
        })
      }
    }
    if (received > 0 && devices.length === 0) {
      throw new Error('Airthings device list could not be used')
    }
    return devices
  }

  async listSamples(accountIds: readonly string[]): Promise<SampleBatch> {
    const readings = new Map<string, NormalizedReading>()
    const ignored: string[] = []
    for (const accountId of unique(accountIds)) {
      const page = await this.sensorPages(accountId)
      for (const [serial, reading] of page.readings) {
        readings.set(serial, reading)
      }
      ignored.push(...page.ignored)
    }
    return { readings, ignored }
  }

  private async sensorPages(accountId: string): Promise<SampleBatch> {
    const readings = new Map<string, NormalizedReading>()
    const ignored: string[] = []
    for (let page = 1; page <= MAX_SENSOR_PAGES; page += 1) {
      this.assertBudget()
      const body = (await this.authorized(sensorsUrl(accountId, page))).body
      const parsed = parseSensors(body, parseRecordedAt)
      for (const record of parsed.results) {
        const normalized = normalizeSample(record, this.now())
        readings.set(record.serialNumber, normalized.reading)
        ignored.push(...normalized.ignored)
      }
      if (!parsed.hasNext) {
        return { readings, ignored }
      }
    }
    this.options.log?.error('Airthings sensor results exceeded the page cap')
    return { readings, ignored }
  }

  private assertBudget(): void {
    const wait = this.blockedForMs(this.now())
    if (wait > 0) {
      throw new RateLimitedError(wait)
    }
  }

  private async authorized(url: string, allowRetry = true): Promise<HttpResponse> {
    await this.ensureToken()
    const token = this.token
    if (token === undefined) {
      throw new AuthError()
    }
    try {
      return await this.call('GET', url, undefined, {
        authorization: `${token.type} ${token.value}`,
      })
    } catch (error) {
      if (allowRetry && error instanceof AuthError && this.token !== undefined) {
        this.token = undefined
        return this.authorized(url, false)
      }
      throw error
    }
  }

  private async ensureToken(): Promise<void> {
    const now = this.now()
    if (this.token !== undefined && this.token.expiresAt - 60_000 > now) {
      return
    }
    const response = await this.requestToken()
    const parsed = parseToken(response.body)
    this.token = {
      value: parsed.token,
      type: parsed.type,
      expiresAt: this.now() + parsed.expiresInSec * 1000,
    }
  }

  /**
   * The documented client-credentials body. Airthings answers an unknown
   * client or a wrong secret with 400, not 401, and this body is otherwise
   * fixed, so a 400 here is the credentials.
   */
  private async requestToken(): Promise<HttpResponse> {
    try {
      return await this.call('POST', TOKEN_URL, {
        grant_type: 'client_credentials',
        client_id: this.options.clientId,
        client_secret: this.options.clientSecret,
        scope: [TOKEN_SCOPE],
      })
    } catch (error) {
      if (error instanceof HttpStatusError && error.status === 400) {
        throw new AuthError()
      }
      throw error
    }
  }

  private async call(
    method: 'GET' | 'POST',
    url: string,
    body?: unknown,
    headers?: Readonly<Record<string, string>>,
  ): Promise<HttpResponse> {
    const response = await this.transport({
      method,
      url,
      body,
      headers,
      connectTimeoutMs: CONNECT_TIMEOUT_MS,
      totalTimeoutMs: REQUEST_TIMEOUT_MS,
      maxBytes: MAX_RESPONSE_BYTES,
      signal: this.abortController.signal,
    })
    this.note(response.headers)
    return this.interpret(response)
  }

  private note(headers: HttpResponse['headers']): void {
    const wait = rateLimitWaitMs(headers, this.now())
    if (wait !== undefined) {
      this.notBefore = Math.max(this.notBefore, this.now() + wait)
    }
  }

  private interpret(response: HttpResponse): HttpResponse {
    if (response.status === 401 || response.status === 403) {
      throw new AuthError()
    }
    if (response.status === 429) {
      const waited = this.blockedForMs(this.now())
      throw new RateLimitedError(waited > 0 ? waited : DEFAULT_RATE_LIMIT_WAIT_MS)
    }
    if (response.status < 200 || response.status >= 300) {
      throw new HttpStatusError(response.status)
    }
    return response
  }
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)]
}

function rejectedDeviceLine(serial: string): string {
  if (serial === '(unreadable)') {
    return 'a device was skipped; its record could not be read'
  }
  if (serial === '(missing serial)') {
    return 'a device was skipped; it had no serial number'
  }
  return `device serial "${forLog(serial)}" was skipped; a serial is 4 to 32 letters or digits`
}
