"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AirthingsSignals = exports.CLOUD_OFFLINE_SUMMARY = exports.AUTH_FAILED_SUMMARY = exports.SIGNAL_CLOUD_OFFLINE = exports.SIGNAL_AUTH_FAILED = exports.PAGERDUTY_STARTUP_LOG = void 0;
exports.staleSignalName = staleSignalName;
exports.staleSummary = staleSummary;
exports.createAirthingsSignals = createAirthingsSignals;
const pagerduty_signals_1 = require("./pagerduty-signals");
/** Logged once, when the setting is on, before the first poll. */
exports.PAGERDUTY_STARTUP_LOG = 'homebridge-pagerduty support is enabled (auth-failed, cloud-offline, stale.<serial>)';
exports.SIGNAL_AUTH_FAILED = 'auth-failed';
exports.SIGNAL_CLOUD_OFFLINE = 'cloud-offline';
exports.AUTH_FAILED_SUMMARY = 'Airthings rejected the API client. HomeKit is showing the last readings until the client id and secret work again.';
exports.CLOUD_OFFLINE_SUMMARY = 'Homebridge has not reached Airthings. The monitors are showing their last readings.';
const STALE_SEVERITY = 'warning';
const SIGNAL_NAME = /^[a-z0-9._-]{1,64}$/;
/** `stale.<serial>`. The serial is lowercased so the store's name check accepts it. */
function staleSignalName(serialNumber) {
    return `stale.${serialNumber.toLowerCase()}`;
}
/** A summary that still reads as a fixed PagerDuty message. */
function staleSummary(name, serialNumber) {
    const label = name.trim().length > 0 ? name.trim() : serialNumber;
    return `${label} has not reported a fresh Airthings reading.`;
}
/**
 * Turns poll results into signal rows.
 *
 * The store writer is injected so tests can watch writes without SQLite.
 */
class AirthingsSignals {
    writer;
    summaries = new Map();
    constructor(writer) {
        this.writer = writer;
    }
    record(update) {
        const accountDown = update.authFailed || update.cloudOffline;
        this.writer.write(exports.SIGNAL_AUTH_FAILED, {
            active: update.authFailed,
            severity: 'error',
            summary: exports.AUTH_FAILED_SUMMARY,
        });
        this.writer.write(exports.SIGNAL_CLOUD_OFFLINE, {
            active: update.cloudOffline && !update.authFailed,
            severity: 'error',
            summary: exports.CLOUD_OFFLINE_SUMMARY,
        });
        if (accountDown) {
            this.clearStale();
            return;
        }
        if (update.monitors === undefined) {
            return;
        }
        const present = new Set();
        for (const monitor of update.monitors) {
            present.add(monitor.serialNumber);
            this.writeStale(monitor.serialNumber, monitor.name, !monitor.fresh);
        }
        if (!update.deviceListFresh) {
            return;
        }
        for (const serial of [...this.summaries.keys()]) {
            if (!present.has(serial)) {
                this.writeStale(serial, '', false);
                this.summaries.delete(serial);
            }
        }
    }
    /** Turn a known monitor's stale signal on. Does nothing while the account itself is the page. */
    expire(serial) {
        if (!this.summaries.has(serial)) {
            return;
        }
        this.writeStale(serial, '', true);
    }
    /** Close the store. Does not clear a signal. */
    close() {
        this.writer.close();
    }
    clearStale() {
        for (const serial of this.summaries.keys()) {
            this.writeStale(serial, '', false);
        }
    }
    writeStale(serial, name, active) {
        const signal = staleSignalName(serial);
        if (!SIGNAL_NAME.test(signal)) {
            return;
        }
        const summary = name.trim().length > 0
            ? staleSummary(name, serial)
            : this.summaries.get(serial) ?? staleSummary('', serial);
        this.summaries.set(serial, summary);
        this.writer.write(signal, { active, severity: STALE_SEVERITY, summary });
    }
}
exports.AirthingsSignals = AirthingsSignals;
/** Build the signals for this plugin, backed by the homebridge-pagerduty store. */
function createAirthingsSignals(options) {
    return new AirthingsSignals(new pagerduty_signals_1.PagerDutySignals(options));
}
