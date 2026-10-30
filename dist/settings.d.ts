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
import type { PluginLogger } from './types';
/** npm package name. Must match `package.json` `name`. */
export declare const PLUGIN_NAME = "homebridge-myairthings";
/** Platform alias in `config.json` and `config.schema.json`. */
export declare const PLATFORM_NAME = "MyAirthings";
/** Default `name`. Homebridge prints this in the log. */
export declare const DEFAULT_NAME = "My Airthings";
/**
 * Namespace for accessory UUIDs.
 *
 * The serial number is the only identity. A renamed monitor keeps its room.
 */
export declare const UUID_PREFIX = "homebridge-myairthings:";
export declare const MANUFACTURER = "Airthings";
export declare const UNKNOWN_PLUGIN_VERSION = "0.0.0";
/** Longest HomeKit name, model, or serial. */
export declare const MAX_NAME_LENGTH = 64;
/** Longest untrusted string placed in a log line. */
export declare const MAX_LOG_FIELD_LENGTH = 100;
/** Consumer token endpoint. Credentials travel in the JSON body, never in the URL. */
export declare const TOKEN_URL = "https://accounts-api.airthings.com/v1/token";
/** The only scope the consumer API documents for reading samples. */
export declare const TOKEN_SCOPE = "read:device:current_values";
/** Consumer API origin. Device and sensor paths are built under this host. */
export declare const API_ORIGIN = "https://consumer-api.airthings.com";
/**
 * Default poll interval.
 *
 * Airthings allows 120 requests an hour, shared by accounts, devices, and
 * sensors. One sensor read every five minutes is 12 an hour, plus an account
 * and device list a few times an hour.
 */
export declare const DEFAULT_REFRESH_SEC = 300;
/** Floor. At 60 seconds a poll is about 80 of the 120 hourly requests once device lists are counted. */
export declare const MIN_REFRESH_SEC = 60;
/** Ceiling, one day. Above this, Node's timer delay collapses. */
export declare const MAX_REFRESH_SEC = 86400;
/** How many successful polls between device-list refreshes. */
export declare const DEVICE_LIST_EVERY = 6;
/** Sensor pages of 50. A home does not have 250 monitors; more is a loop. */
export declare const MAX_SENSOR_PAGES = 5;
/** A reading older than this is inactive. Radon itself updates about hourly. */
export declare const STALE_AFTER_MS: number;
/** How far in the future a timestamp may be and still count as fresh. */
export declare const FUTURE_SKEW_MS: number;
/** Connect deadline. An unreachable host fails quickly. */
export declare const CONNECT_TIMEOUT_MS = 5000;
/** Deadline for one request. */
export declare const REQUEST_TIMEOUT_MS = 30000;
/** Largest response accepted. Device and sensor payloads are a few kilobytes. */
export declare const MAX_RESPONSE_BYTES = 262144;
/** CO₂ detected threshold, ppm. Airthings calls 1000 ppm poor. */
export declare const DEFAULT_CO2_DETECTED_PPM = 1000;
export declare const MIN_CO2_DETECTED_PPM = 400;
export declare const MAX_CO2_DETECTED_PPM = 5000;
/** Consecutive unreachable polls before a sensor stops claiming to be live. */
export declare const FAILURES_BEFORE_STALE = 3;
/** Wait after a rate-limit response when the headers do not say. */
export declare const DEFAULT_RATE_LIMIT_WAIT_MS = 60000;
/** Longest rate-limit wait we will honour. */
export declare const MAX_RATE_LIMIT_WAIT_MS: number;
/** Diagnostics heartbeat. Off unless configured. */
export declare const MIN_DIAGNOSTICS_INTERVAL_SEC = 30;
export declare const MAX_DIAGNOSTICS_INTERVAL_SEC = 3600;
/**
 * This plugin's version, published as FirmwareRevision.
 *
 * `package.json` sits outside `rootDir`, so it is loaded with `require`.
 */
export declare function readPluginVersion(log?: PluginLogger): string;
