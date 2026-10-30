"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_DIAGNOSTICS_INTERVAL_SEC = exports.MIN_DIAGNOSTICS_INTERVAL_SEC = exports.MAX_RATE_LIMIT_WAIT_MS = exports.DEFAULT_RATE_LIMIT_WAIT_MS = exports.FAILURES_BEFORE_STALE = exports.MAX_CO2_DETECTED_PPM = exports.MIN_CO2_DETECTED_PPM = exports.DEFAULT_CO2_DETECTED_PPM = exports.MAX_RESPONSE_BYTES = exports.REQUEST_TIMEOUT_MS = exports.CONNECT_TIMEOUT_MS = exports.FUTURE_SKEW_MS = exports.STALE_AFTER_MS = exports.MAX_SENSOR_PAGES = exports.DEVICE_LIST_EVERY = exports.MAX_REFRESH_SEC = exports.MIN_REFRESH_SEC = exports.DEFAULT_REFRESH_SEC = exports.API_ORIGIN = exports.TOKEN_SCOPE = exports.TOKEN_URL = exports.MAX_LOG_FIELD_LENGTH = exports.MAX_NAME_LENGTH = exports.UNKNOWN_PLUGIN_VERSION = exports.MANUFACTURER = exports.UUID_PREFIX = exports.DEFAULT_NAME = exports.PLATFORM_NAME = exports.PLUGIN_NAME = void 0;
exports.readPluginVersion = readPluginVersion;
/** npm package name. Must match `package.json` `name`. */
exports.PLUGIN_NAME = 'homebridge-myairthings';
/** Platform alias in `config.json` and `config.schema.json`. */
exports.PLATFORM_NAME = 'MyAirthings';
/** Default `name`. Homebridge prints this in the log. */
exports.DEFAULT_NAME = 'My Airthings';
/**
 * Namespace for accessory UUIDs.
 *
 * The serial number is the only identity. A renamed monitor keeps its room.
 */
exports.UUID_PREFIX = 'homebridge-myairthings:';
exports.MANUFACTURER = 'Airthings';
exports.UNKNOWN_PLUGIN_VERSION = '0.0.0';
/** Longest HomeKit name, model, or serial. */
exports.MAX_NAME_LENGTH = 64;
/** Longest untrusted string placed in a log line. */
exports.MAX_LOG_FIELD_LENGTH = 100;
// --- Airthings ----------------------------------------------------------------
/** Consumer token endpoint. Credentials travel in the JSON body, never in the URL. */
exports.TOKEN_URL = 'https://accounts-api.airthings.com/v1/token';
/** The only scope the consumer API documents for reading samples. */
exports.TOKEN_SCOPE = 'read:device:current_values';
/** Consumer API origin. Device and sensor paths are built under this host. */
exports.API_ORIGIN = 'https://consumer-api.airthings.com';
/**
 * Default poll interval.
 *
 * Airthings allows 120 requests an hour, shared by accounts, devices, and
 * sensors. One sensor read every five minutes is 12 an hour, plus an account
 * and device list a few times an hour.
 */
exports.DEFAULT_REFRESH_SEC = 300;
/** Floor. At 60 seconds a poll is about 80 of the 120 hourly requests once device lists are counted. */
exports.MIN_REFRESH_SEC = 60;
/** Ceiling, one day. Above this, Node's timer delay collapses. */
exports.MAX_REFRESH_SEC = 86_400;
/** How many successful polls between device-list refreshes. */
exports.DEVICE_LIST_EVERY = 6;
/** Sensor pages of 50. A home does not have 250 monitors; more is a loop. */
exports.MAX_SENSOR_PAGES = 5;
/** A reading older than this is inactive. Radon itself updates about hourly. */
exports.STALE_AFTER_MS = 3 * 60 * 60_000;
/** How far in the future a timestamp may be and still count as fresh. */
exports.FUTURE_SKEW_MS = 5 * 60_000;
/** Connect deadline. An unreachable host fails quickly. */
exports.CONNECT_TIMEOUT_MS = 5_000;
/** Deadline for one request. */
exports.REQUEST_TIMEOUT_MS = 30_000;
/** Largest response accepted. Device and sensor payloads are a few kilobytes. */
exports.MAX_RESPONSE_BYTES = 262_144;
/** CO₂ detected threshold, ppm. Airthings calls 1000 ppm poor. */
exports.DEFAULT_CO2_DETECTED_PPM = 1_000;
exports.MIN_CO2_DETECTED_PPM = 400;
exports.MAX_CO2_DETECTED_PPM = 5_000;
/** Consecutive unreachable polls before a sensor stops claiming to be live. */
exports.FAILURES_BEFORE_STALE = 3;
/** Wait after a rate-limit response when the headers do not say. */
exports.DEFAULT_RATE_LIMIT_WAIT_MS = 60_000;
/** Longest rate-limit wait we will honour. */
exports.MAX_RATE_LIMIT_WAIT_MS = 15 * 60_000;
/** Diagnostics heartbeat. Off unless configured. */
exports.MIN_DIAGNOSTICS_INTERVAL_SEC = 30;
exports.MAX_DIAGNOSTICS_INTERVAL_SEC = 3_600;
let cachedVersion;
/**
 * This plugin's version, published as FirmwareRevision.
 *
 * `package.json` sits outside `rootDir`, so it is loaded with `require`.
 */
function readPluginVersion(log) {
    if (cachedVersion !== undefined) {
        return cachedVersion;
    }
    try {
        const pkg = require('../package.json');
        cachedVersion = typeof pkg.version === 'string' && pkg.version.length > 0
            ? pkg.version
            : exports.UNKNOWN_PLUGIN_VERSION;
    }
    catch (error) {
        log?.debug(`could not read plugin version: ${String(error)}`);
        cachedVersion = exports.UNKNOWN_PLUGIN_VERSION;
    }
    return cachedVersion;
}
