/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * @fileoverview Names HomeKit will accept, and a model label from the API's device type.
 */

import { MAX_NAME_LENGTH } from '../settings'

const CONTROL = /[\u0000-\u001F\u007F]/g

export function homeKitName(value: string, fallback: string): string {
  const cleaned = value.replace(CONTROL, '').trim()
  const chosen = cleaned.length > 0 ? cleaned : fallback
  return chosen.length > MAX_NAME_LENGTH ? chosen.slice(0, MAX_NAME_LENGTH) : chosen
}

/** `VIEW_PLUS` becomes `View Plus`, from the device `type` string. */
export function modelLabel(type: string): string {
  const words = type.trim().split(/[^A-Za-z0-9]+/).filter((word) => word.length > 0)
  if (words.length === 0) {
    return 'Airthings'
  }
  const label = words.map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`).join(' ')
  return homeKitName(label, 'Airthings')
}
