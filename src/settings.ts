/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * @fileoverview Plugin-wide constants.
 *
 * Numbers that come from Airthings or from HomeKit say so. The rest are
 * policy for this plugin.
 */

import type { PluginLogger } from './types'

/** npm package name. Must match `package.json` `name`. */
export const PLUGIN_NAME = 'homebridge-myairthings'

/** Platform alias in `config.json` and `config.schema.json`. */
export const PLATFORM_NAME = 'MyAirthings'

/** Default `name`. Homebridge prints this in the log. */
export const DEFAULT_NAME = 'My Airthings'

/**
 * Namespace for accessory UUIDs.
 *
 * The serial number is the only identity. A renamed monitor keeps its room.
 */
export const UUID_PREFIX = 'homebridge-myairthings:'

export const MANUFACTURER = 'Airthings'

export const UNKNOWN_PLUGIN_VERSION = '0.0.0'

/** Longest HomeKit name, model, or serial. */
export const MAX_NAME_LENGTH = 64

/** Longest untrusted string placed in a log line. */
export const MAX_LOG_FIELD_LENGTH = 100

// --- Airthings ----------------------------------------------------------------

/** Consumer token endpoint. Credentials travel in the JSON body, never in the URL. */
export const TOKEN_URL = 'https://accounts-api.airthings.com/v1/token'

/** The only scope the consumer API documents for reading samples. */
export const TOKEN_SCOPE = 'read:device:current_values'

/** Consumer API origin. Device and sensor paths are built under this host. */
export const API_ORIGIN = 'https://consumer-api.airthings.com'

/**
 * Default poll interval.
 *
 * Airthings allows 120 requests an hour, shared by accounts, devices, and
 * sensors. One sensor read every five minutes is 12 an hour, plus an account
 * and device list a few times an hour.
 */
export const DEFAULT_REFRESH_SEC = 300

/** Floor. At 60 seconds a poll is about 80 of the 120 hourly requests once device lists are counted. */
export const MIN_REFRESH_SEC = 60

/** Ceiling, one day. Above this, Node's timer delay collapses. */
export const MAX_REFRESH_SEC = 86_400

/** How many successful polls between device-list refreshes. */
export const DEVICE_LIST_EVERY = 6

/** Sensor pages of 50. A home does not have 250 monitors; more is a loop. */
export const MAX_SENSOR_PAGES = 5

/** A reading older than this is inactive. Radon itself updates about hourly. */
export const STALE_AFTER_MS = 3 * 60 * 60_000

/** How far in the future a timestamp may be and still count as fresh. */
export const FUTURE_SKEW_MS = 5 * 60_000

/** Connect deadline. An unreachable host fails quickly. */
export const CONNECT_TIMEOUT_MS = 5_000

/** Deadline for one request. */
export const REQUEST_TIMEOUT_MS = 30_000

/** Largest response accepted. Device and sensor payloads are a few kilobytes. */
export const MAX_RESPONSE_BYTES = 262_144

/** CO₂ detected threshold, ppm. Airthings calls 1000 ppm poor. */
export const DEFAULT_CO2_DETECTED_PPM = 1_000

export const MIN_CO2_DETECTED_PPM = 400

export const MAX_CO2_DETECTED_PPM = 5_000

/** Consecutive unreachable polls before a sensor stops claiming to be live. */
export const FAILURES_BEFORE_STALE = 3

/** Wait after a rate-limit response when the headers do not say. */
export const DEFAULT_RATE_LIMIT_WAIT_MS = 60_000

/** Longest rate-limit wait we will honour. */
export const MAX_RATE_LIMIT_WAIT_MS = 15 * 60_000

/** Diagnostics heartbeat. Off unless configured. */
export const MIN_DIAGNOSTICS_INTERVAL_SEC = 30

export const MAX_DIAGNOSTICS_INTERVAL_SEC = 3_600

let cachedVersion: string | undefined

/**
 * This plugin's version, published as FirmwareRevision.
 *
 * `package.json` sits outside `rootDir`, so it is loaded with `require`.
 */
export function readPluginVersion(log?: PluginLogger): string {
  if (cachedVersion !== undefined) {
    return cachedVersion
  }
  try {
    const pkg = require('../package.json') as { version?: unknown }
    cachedVersion = typeof pkg.version === 'string' && pkg.version.length > 0
      ? pkg.version
      : UNKNOWN_PLUGIN_VERSION
  } catch (error) {
    log?.debug(`could not read plugin version: ${String(error)}`)
    cachedVersion = UNKNOWN_PLUGIN_VERSION
  }
  return cachedVersion
}
