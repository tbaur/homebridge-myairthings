/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * @fileoverview Paths on the consumer API. Account ids are checked before
 * they are placed in a URL.
 */

import { API_ORIGIN } from '../settings'
import { ProtocolError } from '../utils/errors'

/**
 * The API documents the account id only as a string. Consumer ids are UUIDs
 * today, so this allows that shape without depending on it, and refuses
 * anything that could change the path: `/`, `.`, `%`, `?`, or `#`.
 */
const ACCOUNT_ID = /^[0-9A-Za-z_-]{1,128}$/

export function accountsUrl(): string {
  return `${API_ORIGIN}/v1/accounts`
}

export function devicesUrl(accountId: string): string {
  return `${API_ORIGIN}/v1/accounts/${requireAccountId(accountId)}/devices`
}

export function sensorsUrl(accountId: string, page: number): string {
  const params = new URLSearchParams({
    unit: 'metric',
    pageNumber: String(page),
  })
  return `${API_ORIGIN}/v1/accounts/${requireAccountId(accountId)}/sensors?${params.toString()}`
}

function requireAccountId(accountId: string): string {
  if (!ACCOUNT_ID.test(accountId)) {
    throw new ProtocolError('Airthings returned an account id this plugin will not put in a URL')
  }
  return accountId
}
