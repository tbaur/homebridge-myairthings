/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * End-to-end check of the built plugin against a real Airthings account.
 * Read-only: it never calls the remote-control endpoint, so it cannot change
 * a monitor or a purifier.
 *
 * It runs one poll through the compiled session: the token request, the
 * account and device lists, one sensor page, unit conversion, and the tile
 * word. Unit tests can only fake those against a stand-in transport.
 *
 *   node scripts/smoke.js
 *   node scripts/smoke.js --verbose
 *
 * The client comes from AIRTHINGS_CLIENT_ID / AIRTHINGS_CLIENT_SECRET, or a
 * prompt. Never a command-line flag for the secret.
 *
 * One run is a token request plus three of the 120 requests Airthings allows
 * an hour: accounts, devices, and one sensor page per account.
 *
 * Output describes your account: monitor names, types and readings. Serial
 * numbers are masked. Read it before attaching it to a public issue.
 */
const { consoleLogger, parseFlags, requireBuild, resolveClient, run } = require('./lib/common')

const OPTIONS = {
  verbose: 'boolean',
}

/** Which reading each planned sensor should fill. */
const PLAN_FIELDS = {
  radonShort: 'radonShortBq',
  radonLong: 'radonLongBq',
  temperature: 'temperatureC',
  humidity: 'humidityPercent',
  carbonDioxide: 'co2Ppm',
  voc: 'vocPpb',
  pm25: 'pm25Micrograms',
  pm1: 'pm1Micrograms',
  pressure: 'pressureHpa',
  mold: 'mold',
  light: 'lux',
  sound: 'soundDb',
}

function maskSerial(serial) {
  return `****${serial.slice(-4)}`
}

function sampleAge(recordedAt) {
  if (recordedAt === undefined) {
    return 'no timestamp'
  }
  return `${Math.round((Date.now() - recordedAt) / 60_000)} min old`
}

function describeReading(reading) {
  return Object.entries(reading)
    .filter(([key]) => key !== 'active' && key !== 'recordedAt')
    .map(([key, value]) => `${key}=${Number.isInteger(value) ? value : value.toFixed(1)}`)
    .join(' ')
}

/** Print one monitor. Returns the planned sensors this sample did not fill. */
function describeMonitor(build, monitor) {
  const plan = build.planFor(monitor.sensors)
  const missing = Object.entries(PLAN_FIELDS)
    .filter(([planKey, field]) => plan[planKey] && monitor.reading[field] === undefined)
    .map(([planKey]) => planKey)
  console.log(`  ${build.forLog(build.modelLabel(monitor.type))}  ${maskSerial(monitor.serialNumber)}  ${build.forLog(monitor.name)}`)
  console.log(`    sensors  ${monitor.sensors.join(', ') || '(none)'}`)
  console.log(`    sample   ${monitor.samplePresent ? sampleAge(monitor.reading.recordedAt) : 'none this poll'}, ${monitor.reading.active ? 'active' : 'inactive'}`)
  console.log(`    readings ${describeReading(monitor.reading) || '(none)'}`)
  console.log(`    tile     ${build.airQuality(plan, monitor.reading)}`)
  if (missing.length > 0) {
    console.log(`    missing  ${missing.join(', ')} (listed by the device, absent from the sample)`)
  }
  return missing
}

async function main() {
  const flags = parseFlags(process.argv.slice(2), OPTIONS)
  const build = requireBuild(['api/client', 'session', 'readings/plan', 'readings/quality', 'utils/names', 'utils/redact'])
  const log = consoleLogger({ verbose: flags.verbose === true })
  const credentials = await resolveClient()

  console.log('\n=== token, accounts, devices, samples ===')
  const client = new build.AirthingsClient({ ...credentials, log })
  const session = new build.CloudSession({ client, log, intervalMs: 300_000 })
  const outcome = await session.poll()
  if (outcome.authFailed) {
    throw new Error('Airthings rejected the client id or secret')
  }
  if (outcome.view === undefined) {
    throw new Error(outcome.countAs === 'wait'
      ? 'the hourly request budget is spent. Try again later'
      : 'the poll did not complete. The lines above say why')
  }

  const { monitors, listedSerials } = outcome.view
  console.log(`  ${listedSerials.length} device(s) listed, ${monitors.length} published`)
  if (monitors.length === 0) {
    throw new Error('no device on the account has a sensor this plugin maps')
  }

  console.log('\n=== monitors ===')
  let gaps = 0
  for (const monitor of monitors) {
    gaps += describeMonitor(build, monitor).length
  }
  console.log(gaps === 0
    ? '\nsmoke test complete'
    : '\nsmoke test complete, with sensors the sample did not fill. See "missing" above')
}

run(main)
