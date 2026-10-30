/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * @fileoverview JSON over HTTPS to the Airthings consumer API.
 *
 * A response size cap, applied as bytes arrive.
 *
 * Separate connect and total deadlines.
 *
 * Nothing from this layer quotes a URL, a header, or a body. The request can
 * carry an access token, or the client secret in the token body.
 *
 * Redirects are not followed. Node's `https.request` does not follow them,
 * and a 3xx is returned as a status for the caller to reject.
 */

import https from 'node:https'

import { AbortedError, ConnectionError, ProtocolError } from '../utils/errors'

export interface HttpResponse {
  status: number
  body: string
  headers: Readonly<Record<string, string | string[] | undefined>>
}

export interface JsonRequest {
  method: 'GET' | 'POST'
  url: string
  body?: unknown
  headers?: Readonly<Record<string, string>>
  connectTimeoutMs: number
  totalTimeoutMs: number
  maxBytes: number
  signal?: AbortSignal
}

interface Pending {
  settled: boolean
  signal?: AbortSignal
  connect?: ReturnType<typeof setTimeout>
  total?: ReturnType<typeof setTimeout>
  onAbort?: () => void
}

/** One JSON request. Injectable so tests never need the real Airthings hosts. */
export function requestJson(request: JsonRequest): Promise<HttpResponse> {
  const payload = request.body === undefined ? undefined : JSON.stringify(request.body)
  return new Promise<HttpResponse>((resolve, reject) => {
    if (request.signal?.aborted === true) {
      reject(new AbortedError())
      return
    }
    const pending: Pending = { settled: false }
    const req = https.request(request.url, {
      method: request.method,
      agent: false,
      headers: requestHeaders(request, payload),
    }, (response) => {
      readBody({ response, maxBytes: request.maxBytes, pending, resolve, reject, req })
    })
    arm(req, request, pending, reject)
    req.end(payload)
  })
}

function requestHeaders(request: JsonRequest, payload: string | undefined): Record<string, string> {
  const headers: Record<string, string> = {
    accept: 'application/json',
    ...request.headers,
  }
  if (payload !== undefined) {
    headers['content-type'] = 'application/json'
    headers['content-length'] = String(Buffer.byteLength(payload))
  }
  return headers
}

function readBody(input: {
  response: import('node:http').IncomingMessage
  maxBytes: number
  pending: Pending
  resolve: (response: HttpResponse) => void
  reject: (error: Error) => void
  req: import('node:http').ClientRequest
}): void {
  const { response, maxBytes, pending, resolve, reject, req } = input
  const chunks: Buffer[] = []
  let received = 0
  response.on('data', (chunk: Buffer) => {
    received += chunk.length
    if (received > maxBytes) {
      fail(pending, reject, req, new ProtocolError(`response exceeds ${maxBytes} bytes`))
      return
    }
    chunks.push(chunk)
  })
  response.on('end', () => {
    finish(pending, resolve, {
      status: response.statusCode ?? 0,
      body: Buffer.concat(chunks).toString('utf8'),
      headers: response.headers,
    })
  })
  response.on('error', (error) => {
    fail(pending, reject, req, new ConnectionError('response stream failed', { cause: error }))
  })
}

function arm(
  req: import('node:http').ClientRequest,
  request: JsonRequest,
  pending: Pending,
  reject: (error: Error) => void,
): void {
  pending.connect = setTimeout(() => {
    fail(pending, reject, req, new ConnectionError(`connect timed out after ${request.connectTimeoutMs}ms`))
  }, request.connectTimeoutMs)
  pending.connect.unref()
  req.on('socket', (socket) => {
    const ready = (): void => {
      if (pending.connect !== undefined) {
        clearTimeout(pending.connect)
        pending.connect = undefined
      }
      socket.setNoDelay(true)
    }
    if (socket.connecting) {
      const event = 'encrypted' in socket ? 'secureConnect' : 'connect'
      socket.once(event, ready)
    } else {
      ready()
    }
  })
  req.on('error', (error) => {
    fail(pending, reject, req, new ConnectionError('request failed', { cause: error }))
  })
  pending.total = setTimeout(() => {
    fail(pending, reject, req, new ConnectionError(`request timed out after ${request.totalTimeoutMs}ms`))
  }, request.totalTimeoutMs)
  pending.total.unref()
  if (request.signal !== undefined) {
    pending.signal = request.signal
    pending.onAbort = (): void => {
      fail(pending, reject, req, new AbortedError())
    }
    request.signal.addEventListener('abort', pending.onAbort, { once: true })
  }
}

function finish(pending: Pending, resolve: (response: HttpResponse) => void, response: HttpResponse): void {
  if (pending.settled) {
    return
  }
  pending.settled = true
  cleanup(pending)
  resolve(response)
}

function fail(
  pending: Pending,
  reject: (error: Error) => void,
  req: import('node:http').ClientRequest,
  error: Error,
): void {
  if (pending.settled) {
    return
  }
  pending.settled = true
  cleanup(pending)
  req.destroy()
  reject(error)
}

function cleanup(pending: Pending): void {
  if (pending.connect !== undefined) {
    clearTimeout(pending.connect)
  }
  if (pending.total !== undefined) {
    clearTimeout(pending.total)
  }
  if (pending.onAbort !== undefined) {
    pending.signal?.removeEventListener('abort', pending.onAbort)
    pending.onAbort = undefined
  }
}
