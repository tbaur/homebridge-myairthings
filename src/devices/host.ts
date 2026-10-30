/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * @fileoverview The contract between a monitor accessory and the platform.
 */

import type { API, HAP } from 'homebridge'

import type { PluginLogger } from '../types'

export interface AccessoryHost {
  readonly api: API
  readonly hap: HAP
  readonly log: PluginLogger
  readonly pluginVersion: string
  readonly co2DetectedPpm: number
  noteSampleExpired?(serialNumber: string): void
}
