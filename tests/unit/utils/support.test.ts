/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 */

import { DiagnosticsCollector } from '../../../src/diagnostics/collector'
import { parseAccessoryContext, resolvedDisplayName } from '../../../src/utils/context'
import { AuthError, describeError, RateLimitedError } from '../../../src/utils/errors'
import { homeKitName, modelLabel } from '../../../src/utils/names'
import { forLog, redactSecrets } from '../../../src/utils/redact'
import { startupLines } from '../../../src/utils/startup-report'
import { validateConfig } from '../../../src/utils/validators'

describe('redaction and errors', () => {
  it('removes tokens and keeps a log line on one line', () => {
    const dirty = 'authorization: Bearer abc.def.ghi client_secret=super-secret\nnext'
    expect(redactSecrets(dirty)).not.toContain('super-secret')
    const token = ['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiIxIn0', 'signature'].join('.')
    expect(redactSecrets(token)).toContain('[redacted]')
    expect(forLog(`hello\n${'x'.repeat(200)}`)).not.toContain('\n')
    expect(forLog('short')).toBe('short')
  })

  it('describes a cause chain without the token', () => {
    const error = new AuthError()
    error.cause = new Error('access_token=test-token')
    expect(describeError(error)).not.toContain('test-token')
    expect(new RateLimitedError(1500).message).toContain('Retry in 2s')
  })
})

describe('names and context', () => {
  it('labels a device type without a serial table', () => {
    expect(modelLabel('VIEW_PLUS')).toBe('View Plus')
    expect(modelLabel('')).toBe('Airthings')
    expect(homeKitName(' Zone One\n', 'fallback')).toBe('Zone One')
  })

  it('keeps a Home rename and follows an Airthings rename', () => {
    expect(resolvedDisplayName('Zone One', 'Zone One', 'Cook')).toBe('Cook')
    expect(resolvedDisplayName('My Zone One', 'Zone One', 'Cook')).toBe('My Zone One')
    expect(parseAccessoryContext({ serialNumber: '2960000001', sensors: ['temp', 1] })?.sensors).toEqual(['temp'])
    expect(parseAccessoryContext({ serialNumber: '**' })).toBeUndefined()
  })
})

describe('config', () => {
  it('stays idle without credentials and clamps a fast refresh', () => {
    expect(validateConfig({ name: 'MyAirthings' }).status).toBe('notConfigured')
    const fast = validateConfig({ name: 'MyAirthings', clientId: 'id', clientSecret: 'secret', refreshInterval: 1 })
    expect(fast.status).toBe('ok')
    expect(fast.config?.refreshIntervalSec).toBe(60)
    expect(fast.config?.pagerdutySignals).toBe(false)
    expect(fast.warnings.length).toBeGreaterThan(0)
    expect(validateConfig({ name: 'MyAirthings', clientId: 'id' }).status).toBe('invalid')
    const messy = validateConfig({
      name: `${'n'.repeat(80)}\n`,
      clientId: 'id',
      clientSecret: 'secret',
      refreshInterval: 99_999,
      co2DetectedThreshold: 1.5,
      debug: 'yes',
      diagnosticsInterval: 1,
      pagerdutySignals: 'yes',
    })
    expect(messy.status).toBe('ok')
    expect(messy.config?.name.length).toBeLessThanOrEqual(64)
    expect(messy.config?.debug).toBe(false)
    expect(messy.config?.pagerdutySignals).toBe(false)
    expect(messy.warnings.some((warning) => warning.includes('pagerdutySignals'))).toBe(true)
    expect(messy.config?.diagnosticsIntervalSec).toBe(30)
    expect(validateConfig({ name: 1, clientId: 'id', clientSecret: 'secret' }).errors).toContain('name must be a string')
    expect(validateConfig({ name: 'MyAirthings', clientId: 'bad\nid', clientSecret: 'secret' }).errors)
      .toContain('clientId contains a control character')
    expect(validateConfig({ name: 'MyAirthings', clientId: 'x'.repeat(257), clientSecret: 'secret' }).errors)
      .toContain('clientId is longer than 256 characters')
  })

  it('lets the environment override the config values', () => {
    process.env.AIRTHINGS_CLIENT_ID = 'from-env-id'
    process.env.AIRTHINGS_CLIENT_SECRET = 'from-env-secret'
    try {
      const result = validateConfig({ name: 'MyAirthings', clientId: 'file-id', clientSecret: 'file-secret' })
      expect(result.config?.clientId).toBe('from-env-id')
      expect(result.config?.clientSecret).toBe('from-env-secret')
    } finally {
      delete process.env.AIRTHINGS_CLIENT_ID
      delete process.env.AIRTHINGS_CLIENT_SECRET
    }
  })
})

describe('startup and diagnostics', () => {
  it('summarises the monitors and counts polls', () => {
    const lines = startupLines({
      version: '0.1.0',
      name: 'My Airthings',
      refreshIntervalSec: 300,
      created: 1,
      removed: 0,
      monitors: [{
        accountId: '00000000-0000-0000-0000-000000000001',
        serialNumber: '2960000001',
        name: 'Zone One',
        type: 'VIEW_PLUS',
        sensors: [],
        samplePresent: true,
        reading: { active: true },
      }],
    })
    expect(lines[0]).toBe('My Airthings 0.1.0')
    expect(lines.some((line: string) => line.includes('View Plus'))).toBe(true)
    const removed = startupLines({
      version: '0.1.0', name: 'My Airthings', refreshIntervalSec: 300, created: 0, removed: 2, monitors: [],
    })
    expect(removed.some((line: string) => line.includes('removed 2'))).toBe(true)
    expect(homeKitName('x'.repeat(80), 'fallback').length).toBe(64)

    const diagnostics = new DiagnosticsCollector()
    diagnostics.apiRequest(10, 'ok')
    diagnostics.apiRequest(30, 'error')
    expect(diagnostics.line({
      msg: 'health',
      devicesOnline: 1,
      devicesTotal: 1,
      restState: 'running',
    })).toBe('Health: healthy | devices 1/1 | rest live | api p50 10ms p95 30ms (req 2, err 1)')
    expect(diagnostics.line({
      msg: 'diagnostics.start',
      devicesOnline: 0,
      devicesTotal: 1,
      restState: 'running',
    })).toBe('Diagnostics start: degraded [devicesInactive] | devices 0/1 | rest live | api p50 10ms p95 30ms (req 2, err 1)')
    expect(diagnostics.line({
      msg: 'diagnostics.start',
      devicesOnline: 1,
      devicesTotal: 1,
      restState: 'auth-failed',
    })).toBe('Diagnostics start: degraded [authFailed] | devices 1/1 | rest auth-failed | api p50 10ms p95 30ms (req 2, err 1)')
    expect(diagnostics.line({
      msg: 'diagnostics.start',
      devicesOnline: 0,
      devicesTotal: 0,
      restState: 'connecting',
    })).toBe('Diagnostics start: healthy | devices 0/0 | rest connecting | api p50 10ms p95 30ms (req 2, err 1)')
    expect(diagnostics.line({
      msg: 'diagnostics.stop',
      devicesOnline: 1,
      devicesTotal: 1,
      restState: 'stopped',
    })).toBe('Diagnostics stop: healthy | devices 1/1 | rest stopped | api p50 10ms p95 30ms (req 2, err 1)')
  })
})
