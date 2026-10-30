/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * @fileoverview How long to wait after a rate-limit header.
 *
 * The consumer API sends `X-RateLimit-Remaining`, `X-RateLimit-Reset`, and
 * on 429 `X-RateLimit-Retry-After`. Node lowercases header names.
 */

import { DEFAULT_RATE_LIMIT_WAIT_MS, MAX_RATE_LIMIT_WAIT_MS } from '../settings'

export function rateLimitWaitMs(
  headers: Readonly<Record<string, string | string[] | undefined>>,
  now: number,
): number | undefined {
  const remaining = header(headers, 'x-ratelimit-remaining')
  const retryAfter = header(headers, 'x-ratelimit-retry-after') ?? header(headers, 'retry-after')
  const reset = header(headers, 'x-ratelimit-reset')
  if (remaining !== '0' && retryAfter === undefined) {
    return undefined
  }
  const fromRetry = retryAfter === undefined ? undefined : deltaMs(retryAfter, now)
  const fromReset = reset === undefined ? undefined : deltaMs(reset, now)
  const wait = fromRetry ?? fromReset ?? DEFAULT_RATE_LIMIT_WAIT_MS
  return Math.min(Math.max(0, wait), MAX_RATE_LIMIT_WAIT_MS)
}

function header(
  headers: Readonly<Record<string, string | string[] | undefined>>,
  name: string,
): string | undefined {
  const value = headers[name]
  if (Array.isArray(value)) {
    return value[0]
  }
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/**
 * A small number is a delay in seconds. A large number is a unix time.
 * Anything else is an HTTP date.
 */
function deltaMs(value: string, now: number): number | undefined {
  const trimmed = value.trim()
  if (/^[+-]?\d+(?:\.\d+)?$/.test(trimmed)) {
    const numeric = Number(trimmed)
    if (numeric >= 1e12) {
      return numeric - now
    }
    if (numeric >= 1e9) {
      return numeric * 1000 - now
    }
    return numeric * 1000
  }
  const dateMs = Date.parse(trimmed)
  return Number.isNaN(dateMs) ? undefined : dateMs - now
}
