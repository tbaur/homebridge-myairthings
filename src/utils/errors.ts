/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * @fileoverview Error types and a log-safe description.
 *
 * Descriptions go through redaction. An error message is text the plugin did
 * not write, and it is the route by which a token could reach a log line.
 */

import { redactExternal } from './redact'

const MAX_DESCRIPTION_LENGTH = 300

export function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined
  }
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' && code.length > 0 ? code : undefined
}

function messageOf(error: unknown): string {
  if (error instanceof Error) {
    const code = errorCode(error)
    return code !== undefined ? `${error.message} (${code})` : error.message
  }
  if (typeof error === 'string') {
    return error
  }
  return 'unknown error'
}

/** One line, with the cause chain, safe to log. */
export function describeError(error: unknown): string {
  const parts: string[] = []
  let current: unknown = error
  const seen = new Set<unknown>()
  while (current !== undefined && current !== null && !seen.has(current)) {
    seen.add(current)
    const text = messageOf(current)
    if (text.length > 0 && !parts.includes(text)) {
      parts.push(text)
    }
    current = current instanceof Error ? (current as { cause?: unknown }).cause : undefined
  }
  const joined = parts.length > 0 ? parts.join(': ') : 'unknown error'
  const sanitized = redactExternal(joined).replace(/[\u0000-\u001F\u007F]/g, '\uFFFD')
  return sanitized.length > MAX_DESCRIPTION_LENGTH
    ? `${sanitized.slice(0, MAX_DESCRIPTION_LENGTH)}\u2026`
    : sanitized
}

/** The host could not be reached, or the exchange did not finish. */
export class ConnectionError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'ConnectionError'
  }
}

/** The host answered with something this plugin will not use. */
export class ProtocolError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'ProtocolError'
  }
}

/** A completed HTTP response whose status is not a success. */
export class HttpStatusError extends Error {
  readonly status: number

  constructor(status: number) {
    super(`Airthings returned ${status}`)
    this.name = 'HttpStatusError'
    this.status = status
  }
}

/** The account list had no usable id. Not an empty home, and not an outage. */
export class NoAccountsError extends Error {
  constructor() {
    super('Airthings returned no accounts')
    this.name = 'NoAccountsError'
  }
}

/** Homebridge asked the in-flight request to stop. Not an outage. */
export class AbortedError extends Error {
  constructor() {
    super('request aborted')
    this.name = 'AbortedError'
  }
}

/** The client id or secret was rejected. */
export class AuthError extends Error {
  constructor(message = 'Airthings rejected the client credentials') {
    super(message)
    this.name = 'AuthError'
  }
}

/** The hourly budget is spent. `retryAfterMs` is how long to wait. */
export class RateLimitedError extends Error {
  readonly retryAfterMs: number

  constructor(retryAfterMs: number) {
    super(`Airthings rate limit reached. Retry in ${Math.max(1, Math.ceil(retryAfterMs / 1000))}s`)
    this.name = 'RateLimitedError'
    this.retryAfterMs = retryAfterMs
  }
}
