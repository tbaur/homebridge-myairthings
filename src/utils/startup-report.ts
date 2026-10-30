/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * @fileoverview The lines written once a device list has been applied.
 */

import type { MonitorSnapshot } from '../types'
import { forLog } from './redact'
import { modelLabel } from './names'

export function startupLines(input: {
  version: string
  name: string
  monitors: readonly MonitorSnapshot[]
  refreshIntervalSec: number
  created: number
  removed: number
}): string[] {
  const lines = [
    `${input.name} ${input.version}`,
    `${input.monitors.length} monitor(s), refresh ${input.refreshIntervalSec}s`,
  ]
  if (input.created > 0) {
    lines.push(`created ${input.created}`)
  }
  if (input.removed > 0) {
    lines.push(`removed ${input.removed}`)
  }
  for (const monitor of input.monitors) {
    lines.push(`${forLog(modelLabel(monitor.type))} ${forLog(monitor.serialNumber)} ${forLog(monitor.name)}`)
  }
  return lines
}
