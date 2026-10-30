/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 */

import http from 'node:http'
import https from 'node:https'
import type { AddressInfo } from 'node:net'

import { requestJson } from '../../../src/api/http'
import { AbortedError, ConnectionError, ProtocolError } from '../../../src/utils/errors'

function listen(): Promise<{ server: http.Server, origin: string }> {
  const server = http.createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => {
      if (request.url === '/big') {
        response.end('x'.repeat(100))
        return
      }
      response.writeHead(200, { 'content-type': 'application/json', 'x-ratelimit-remaining': '9' })
      response.end(JSON.stringify({ ok: true, saw: Buffer.concat(chunks).toString('utf8') }))
    })
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as AddressInfo
      resolve({ server, origin: `https://127.0.0.1:${address.port}` })
    })
  })
}

describe('requestJson', () => {
  let server: http.Server
  let origin = ''

  beforeEach(() => {
    jest.spyOn(https, 'request').mockImplementation((url, options, handle) => {
      const target = new URL(String(url))
      target.protocol = 'http:'
      return http.request(target, options, handle)
    })
  })

  beforeAll(async () => {
    const started = await listen()
    server = started.server
    origin = started.origin
  })

  afterAll(async () => {
    jest.restoreAllMocks()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  it('posts JSON and returns the body and headers', async () => {
    const response = await requestJson({
      method: 'POST',
      url: `${origin}/token`,
      body: { grant_type: 'client_credentials' },
      connectTimeoutMs: 1_000,
      totalTimeoutMs: 1_000,
      maxBytes: 1024,
    })
    expect(response.status).toBe(200)
    expect(JSON.parse(response.body)).toMatchObject({ ok: true })
    expect(response.headers['x-ratelimit-remaining']).toBe('9')
  })

  it('rejects a body over the cap and a connect that never finishes', async () => {
    await expect(requestJson({
      method: 'GET',
      url: `${origin}/big`,
      connectTimeoutMs: 1_000,
      totalTimeoutMs: 1_000,
      maxBytes: 10,
    })).rejects.toBeInstanceOf(ProtocolError)

    jest.mocked(https.request).mockImplementationOnce(() => {
      const fake = new (require('node:events').EventEmitter)()
      fake.destroy = () => undefined
      fake.end = () => undefined
      fake.on = fake.addListener
      return fake
    })
    await expect(requestJson({
      method: 'GET',
      url: `${origin}/hang`,
      connectTimeoutMs: 20,
      totalTimeoutMs: 50,
      maxBytes: 10,
    })).rejects.toBeInstanceOf(ConnectionError)
  })

  it('reports an abort before the request starts as an abort, not an outage', async () => {
    const signal = AbortSignal.abort()
    await expect(requestJson({
      method: 'GET',
      url: `${origin}/token`,
      connectTimeoutMs: 1_000,
      totalTimeoutMs: 1_000,
      maxBytes: 10,
      signal,
    })).rejects.toBeInstanceOf(AbortedError)
  })
})
