"use strict";
/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * @fileoverview One poll: device list, samples, and the wait until the next one.
 *
 * A sensor page and the token refresh are one poll. Retries inside a poll
 * do not exist. The next poll waits the interval, unless the client was
 * rejected or the hourly budget was spent.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CloudSession = void 0;
exports.backoffMs = backoffMs;
const plan_1 = require("./readings/plan");
const settings_1 = require("./settings");
const errors_1 = require("./utils/errors");
const redact_1 = require("./utils/redact");
const BACKOFF_MS = [5_000, 15_000, 30_000, 60_000, 120_000, 300_000];
/** Polls Airthings and turns failures into a wait, not a tight loop. */
class CloudSession {
    options;
    devices;
    polls = 0;
    /** Rejected-client polls in a row. Cleared only by an accepted poll. */
    authStreak = 0;
    authOpen = false;
    /** Unreachable polls in a row. A rejected client does not count. */
    outageStreak = 0;
    authLogged = false;
    outageLogged = false;
    announcedUnknown = new Set();
    constructor(options) {
        this.options = options;
    }
    abort() {
        this.options.client.abort();
    }
    async poll() {
        const now = this.now();
        const blocked = this.options.client.blockedForMs(now);
        if (blocked > 0) {
            return idle(blocked);
        }
        try {
            const view = await this.load();
            this.authStreak = 0;
            this.authOpen = false;
            this.outageStreak = 0;
            this.noteRecovery();
            return {
                waitMs: this.options.intervalMs,
                unreachable: false,
                authFailed: false,
                cloudOffline: false,
                reportSignals: true,
                countAs: 'ok',
                view,
            };
        }
        catch (error) {
            return this.fail(error);
        }
    }
    async load() {
        let deviceListFresh = false;
        if (this.devices === undefined || this.polls % settings_1.DEVICE_LIST_EVERY === 0) {
            try {
                const listed = retainSensors(await this.options.client.listDevices(), this.devices);
                this.devices = dedupe(listed, this.options.log);
                deviceListFresh = true;
                this.polls = 0;
            }
            catch (error) {
                if (error instanceof errors_1.NoAccountsError && this.devices !== undefined) {
                    // This poll stops before samples. The remembered device list stays.
                    // polls = 1 keeps the later sample cadence, and the account list is tried again on that cadence.
                    this.polls = 1;
                }
                throw error;
            }
        }
        const accountIds = this.devices.map((device) => device.accountId);
        const batch = await this.options.client.listSamples(accountIds);
        this.polls += 1;
        this.logUnmapped(this.devices);
        this.logIgnored(batch.ignored);
        return {
            deviceListFresh,
            ignored: batch.ignored,
            listedSerials: this.devices.map((device) => device.serialNumber),
            monitors: this.devices.flatMap((device) => publishable(device, batch.readings)),
        };
    }
    fail(error) {
        if (error instanceof errors_1.AbortedError) {
            return idle(this.options.intervalMs);
        }
        if (error instanceof errors_1.RateLimitedError) {
            this.options.log.info(error.message);
            return idle(error.retryAfterMs);
        }
        if (error instanceof errors_1.AuthError) {
            this.logAuth();
            this.authStreak += 1;
            this.authOpen = true;
            return {
                waitMs: backoffMs(this.authStreak),
                unreachable: this.authStreak >= settings_1.FAILURES_BEFORE_STALE,
                authFailed: true,
                cloudOffline: false,
                reportSignals: true,
                countAs: 'error',
            };
        }
        if (error instanceof errors_1.NoAccountsError) {
            return {
                waitMs: this.options.intervalMs,
                unreachable: false,
                authFailed: this.authOpen,
                cloudOffline: false,
                reportSignals: false,
                countAs: 'error',
            };
        }
        if (countsAsOutage(error)) {
            this.logOutage(error);
            this.outageStreak += 1;
            const cloudOffline = !this.authOpen && this.outageStreak >= settings_1.FAILURES_BEFORE_STALE;
            return {
                waitMs: this.options.intervalMs,
                unreachable: this.outageStreak >= settings_1.FAILURES_BEFORE_STALE,
                authFailed: this.authOpen,
                cloudOffline,
                reportSignals: true,
                countAs: 'error',
            };
        }
        this.options.log.error(`Airthings poll failed: ${(0, errors_1.describeError)(error)}`);
        return {
            waitMs: this.options.intervalMs,
            unreachable: false,
            authFailed: this.authOpen,
            cloudOffline: false,
            reportSignals: false,
            countAs: 'error',
        };
    }
    logAuth() {
        if (this.authLogged) {
            return;
        }
        this.authLogged = true;
        this.options.log.error('Airthings rejected the client credentials');
    }
    logOutage(error) {
        const line = `Airthings is unreachable: ${(0, errors_1.describeError)(error)}`;
        if (this.outageLogged) {
            this.options.log.debug(line);
            return;
        }
        this.outageLogged = true;
        this.options.log.warn(line);
    }
    noteRecovery() {
        if (!this.authLogged && !this.outageLogged) {
            return;
        }
        this.authLogged = false;
        this.outageLogged = false;
        this.options.log.info('Airthings is reachable again');
    }
    logUnmapped(devices) {
        for (const device of devices) {
            const names = (0, plan_1.unknownSensorNames)(device.sensors);
            if (names.length === 0) {
                continue;
            }
            const key = `${device.serialNumber}:${names.join(',')}`;
            if (this.announcedUnknown.has(key)) {
                continue;
            }
            this.announcedUnknown.add(key);
            this.options.log.info(`${(0, redact_1.forLog)(device.name)} reports unmapped sensors: ${names.map((name) => (0, redact_1.forLog)(name)).join(', ')}`);
        }
    }
    logIgnored(tokens) {
        for (const token of tokens) {
            if (this.announcedUnknown.has(token)) {
                continue;
            }
            this.announcedUnknown.add(token);
            const [serial = '', sensorType = '', unit = ''] = token.split('\t');
            const device = this.devices?.find((item) => item.serialNumber === serial);
            const who = device !== undefined && device.name.trim().length > 0 ? device.name : serial;
            const unitText = unit.length > 0 ? `unit "${(0, redact_1.forLog)(unit)}"` : 'no unit';
            this.options.log.info(`${(0, redact_1.forLog)(who)} did not use ${(0, redact_1.forLog)(sensorType)}; ${unitText} is not converted`);
        }
    }
    now() {
        return this.options.now?.() ?? Date.now();
    }
}
exports.CloudSession = CloudSession;
function backoffMs(failures) {
    const index = Math.min(Math.max(failures, 1), BACKOFF_MS.length) - 1;
    return BACKOFF_MS[index] ?? BACKOFF_MS[BACKOFF_MS.length - 1] ?? 300_000;
}
/** A poll that did not learn whether Airthings is up. The last signal rows stay. */
function idle(waitMs) {
    return {
        waitMs,
        unreachable: false,
        authFailed: false,
        cloudOffline: false,
        reportSignals: false,
        countAs: 'wait',
    };
}
function countsAsOutage(error) {
    if (error instanceof errors_1.AuthError || error instanceof errors_1.RateLimitedError) {
        return false;
    }
    if (error instanceof errors_1.ConnectionError || error instanceof errors_1.ProtocolError) {
        return true;
    }
    if (error instanceof errors_1.HttpStatusError) {
        return error.status >= 500 || error.status === 408;
    }
    return false;
}
function retainSensors(incoming, previous) {
    const prior = new Map((previous ?? []).map((device) => [device.serialNumber, device]));
    return incoming.map((device) => {
        if (!device.sensorsOmitted) {
            return device;
        }
        const kept = prior.get(device.serialNumber);
        if (kept === undefined) {
            return { ...device, sensors: [] };
        }
        return { ...device, sensors: kept.sensors, sensorsOmitted: false };
    });
}
function dedupe(devices, log) {
    const seen = new Set();
    const unique = [];
    for (const device of devices) {
        if (seen.has(device.serialNumber)) {
            log.warn(`duplicate serial ${(0, redact_1.forLog)(device.serialNumber)} ignored`);
            continue;
        }
        seen.add(device.serialNumber);
        unique.push(device);
    }
    return unique;
}
function publishable(device, readings) {
    if (!(0, plan_1.hasPublishableSensor)((0, plan_1.planFor)(device.sensors))) {
        return [];
    }
    return [{
            accountId: device.accountId,
            serialNumber: device.serialNumber,
            name: device.name,
            type: device.type,
            sensors: device.sensors,
            samplePresent: readings.has(device.serialNumber),
            reading: readings.get(device.serialNumber) ?? { active: false },
        }];
}
