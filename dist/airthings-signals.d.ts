/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * @fileoverview The three conditions this plugin pages through homebridge-pagerduty.
 *
 * A rejected client is `auth-failed`. The account being unreachable is
 * `cloud-offline`. One monitor with an old sample, while the account itself
 * answers, is `stale.<serial>`. The account-level signals suppress the
 * per-monitor ones, so one outage is one page.
 */
import type { PagerDutySignalsOptions, SignalState } from './pagerduty-signals';
/** Logged once, when the setting is on, before the first poll. */
export declare const PAGERDUTY_STARTUP_LOG = "homebridge-pagerduty support is enabled (auth-failed, cloud-offline, stale.<serial>)";
export declare const SIGNAL_AUTH_FAILED = "auth-failed";
export declare const SIGNAL_CLOUD_OFFLINE = "cloud-offline";
export declare const AUTH_FAILED_SUMMARY = "Airthings rejected the API client. HomeKit is showing the last readings until the client id and secret work again.";
export declare const CLOUD_OFFLINE_SUMMARY = "Homebridge has not reached Airthings. The monitors are showing their last readings.";
export interface SignalWriter {
    write(signal: string, state: SignalState): void;
    close(): void;
}
export interface StaleMonitor {
    serialNumber: string;
    name: string;
    /** True when the latest sample is inside the freshness window. */
    fresh: boolean;
}
export interface SignalUpdate {
    authFailed: boolean;
    cloudOffline: boolean;
    monitors?: readonly StaleMonitor[];
    /** Drop stale rows for serials absent from `monitors`. */
    deviceListFresh: boolean;
}
/** `stale.<serial>`. The serial is lowercased so the store's name check accepts it. */
export declare function staleSignalName(serialNumber: string): string;
/** A summary that still reads as a fixed PagerDuty message. */
export declare function staleSummary(name: string, serialNumber: string): string;
/**
 * Turns poll results into signal rows.
 *
 * The store writer is injected so tests can watch writes without SQLite.
 */
export declare class AirthingsSignals {
    private readonly writer;
    private readonly summaries;
    constructor(writer: SignalWriter);
    record(update: SignalUpdate): void;
    /** Turn a known monitor's stale signal on. Does nothing while the account itself is the page. */
    expire(serial: string): void;
    /** Close the store. Does not clear a signal. */
    close(): void;
    private clearStale;
    private writeStale;
}
/** Build the signals for this plugin, backed by the homebridge-pagerduty store. */
export declare function createAirthingsSignals(options: PagerDutySignalsOptions): AirthingsSignals;
