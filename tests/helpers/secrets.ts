/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * Credentials built at runtime so the source tree never contains one.
 */

export function fakeClientId(): string {
  return `id-${'a'.repeat(12)}`
}

export function fakeClientSecret(): string {
  return `secret-${'b'.repeat(12)}`
}
