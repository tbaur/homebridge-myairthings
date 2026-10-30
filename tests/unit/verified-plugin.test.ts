/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  DEFAULT_CO2_DETECTED_PPM,
  DEFAULT_REFRESH_SEC,
  MAX_CO2_DETECTED_PPM,
  MAX_DIAGNOSTICS_INTERVAL_SEC,
  MAX_REFRESH_SEC,
  MIN_CO2_DETECTED_PPM,
  MIN_REFRESH_SEC,
  PLATFORM_NAME,
} from '../../src/settings'

interface SchemaNode {
  type?: string
  anyOf?: unknown
  oneOf?: unknown
  required?: unknown
  default?: unknown
  minimum?: number
  maximum?: number
  properties?: Record<string, SchemaNode>
  items?: SchemaNode
  'x-schema-form'?: { type?: string }
}

interface ConfigSchema {
  pluginAlias: string
  pluginType: string
  singular?: boolean
  layout?: string[]
  schema: SchemaNode & { properties: Record<string, SchemaNode> }
}

interface PackageManifest {
  name?: string
  keywords?: string[]
  engines?: { node?: string, homebridge?: string }
  dependencies?: Record<string, string>
  files?: string[]
}

const ROOT = resolve(__dirname, '../..')
const schema = JSON.parse(readFileSync(resolve(ROOT, 'config.schema.json'), 'utf8')) as ConfigSchema
const manifest = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as PackageManifest

function walk(node: SchemaNode | undefined, visit: (node: SchemaNode) => void): void {
  if (node === undefined) {
    return
  }
  visit(node)
  for (const child of Object.values(node.properties ?? {})) {
    walk(child, visit)
  }
  walk(node.items, visit)
}

describe('config.schema.json', () => {
  const props = schema.schema.properties

  it('declares one platform and requires only the name', () => {
    expect(schema.pluginAlias).toBe(PLATFORM_NAME)
    expect(schema.pluginType).toBe('platform')
    expect(schema.singular).toBe(true)
    expect(schema.schema.required).toEqual(['name'])
  })

  it('never declares required as a boolean', () => {
    walk(schema.schema, (node) => {
      if ('required' in node) {
        expect(Array.isArray(node.required)).toBe(true)
      }
    })
  })

  it('gives every setting a single type, so the Homebridge UI draws an input for it', () => {
    for (const [key, node] of Object.entries(props)) {
      expect({ key, type: typeof node.type }).toEqual({ key, type: 'string' })
      expect({ key, anyOf: node.anyOf, oneOf: node.oneOf }).toEqual({ key, anyOf: undefined, oneOf: undefined })
    }
  })

  it('matches the runtime bounds and hides the secret', () => {
    expect(props.refreshInterval).toMatchObject({
      default: DEFAULT_REFRESH_SEC,
      minimum: MIN_REFRESH_SEC,
      maximum: MAX_REFRESH_SEC,
    })
    expect(props.co2DetectedThreshold).toMatchObject({
      default: DEFAULT_CO2_DETECTED_PPM,
      minimum: MIN_CO2_DETECTED_PPM,
      maximum: MAX_CO2_DETECTED_PPM,
    })
    expect(props.diagnosticsInterval).toMatchObject({
      type: 'integer',
      default: 0,
      minimum: 0,
      maximum: MAX_DIAGNOSTICS_INTERVAL_SEC,
    })
    expect(props.clientSecret?.['x-schema-form']).toEqual({ type: 'password' })
    expect(props.pagerdutySignals?.default).toBe(false)
    expect(schema.layout).toContain('pagerdutySignals')
  })
})

describe('package.json', () => {
  it('is a Homebridge plugin with no runtime dependencies', () => {
    expect(manifest.keywords).toEqual(expect.arrayContaining(['homebridge-plugin']))
    expect(manifest.engines?.homebridge).toBe('^2.0.0')
    expect(manifest.dependencies).toBeUndefined()
    expect(manifest.files).toEqual(expect.arrayContaining(['dist/**/*', 'config.schema.json']))
  })
})
