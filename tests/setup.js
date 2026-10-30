/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * Fails fast if the suite is run without NODE_ENV=test, or with real
 * Airthings credentials in the environment.
 */

if (process.env.NODE_ENV !== 'test') {
  throw new Error('Tests must run with NODE_ENV=test. Use: NODE_ENV=test npm test')
}

for (const name of ['AIRTHINGS_CLIENT_ID', 'AIRTHINGS_CLIENT_SECRET']) {
  if (process.env[name] !== undefined) {
    throw new Error(
      `${name} is set. The test suite must not run with real Airthings credentials in the `
      + 'environment; unset it and run again.',
    )
  }
}
