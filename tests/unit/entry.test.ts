/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 */

import type { API } from 'homebridge'

import register from '../../src/index'
import { AirthingsPlatform } from '../../src/platform'
import { PLATFORM_NAME, PLUGIN_NAME } from '../../src/settings'

describe('the plugin entry point', () => {
  it('registers the platform under the name the config schema uses', () => {
    const registerPlatform = jest.fn()
    register({ registerPlatform } as unknown as API)
    expect(registerPlatform).toHaveBeenCalledWith(PLUGIN_NAME, PLATFORM_NAME, AirthingsPlatform)
  })

  it('uses the package name', () => {
    const manifest = require('../../package.json') as { name: string }
    expect(PLUGIN_NAME).toBe(manifest.name)
  })
})
