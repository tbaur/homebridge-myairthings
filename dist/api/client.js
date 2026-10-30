"use strict";
/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * @fileoverview Consumer API client.
 *
 * One logical operation is a device list or a sensor page. The session, not
 * this class, decides whether an error is an outage.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AirthingsClient = void 0;
const http_1 = require("./http");
const rate_limit_1 = require("./rate-limit");
const parse_1 = require("./parse");
const urls_1 = require("./urls");
const sample_1 = require("../readings/sample");
const settings_1 = require("../settings");
const errors_1 = require("../utils/errors");
const redact_1 = require("../utils/redact");
/** Talks to the consumer API. Holds the access token and the rate-limit clock. */
class AirthingsClient {
    options;
    transport;
    now;
    token;
    notBefore = 0;
    abortController = new AbortController();
    constructor(options) {
        this.options = options;
        this.transport = options.transport ?? http_1.requestJson;
        this.now = options.now ?? Date.now;
    }
    blockedForMs(now) {
        return Math.max(0, this.notBefore - now);
    }
    abort() {
        this.abortController.abort();
        this.abortController = new AbortController();
    }
    async listDevices() {
        const accounts = (0, parse_1.parseAccounts)((await this.authorized((0, urls_1.accountsUrl)())).body);
        if (accounts.length === 0) {
            // No account id was read, so this is not an empty home. Cached monitors stay.
            this.options.log?.info('Airthings returned no accounts');
            throw new errors_1.NoAccountsError();
        }
        const devices = [];
        let received = 0;
        for (const account of accounts) {
            const parsed = (0, parse_1.parseDevices)((await this.authorized((0, urls_1.devicesUrl)(account.id))).body);
            received += parsed.received;
            for (const serial of parsed.rejected) {
                this.options.log?.warn(rejectedDeviceLine(serial));
            }
            for (const row of parsed.devices) {
                devices.push({
                    accountId: account.id,
                    serialNumber: row.serialNumber,
                    name: row.name,
                    type: row.type,
                    sensors: row.sensors ?? [],
                    sensorsOmitted: row.sensors === undefined,
                });
            }
        }
        if (received > 0 && devices.length === 0) {
            throw new Error('Airthings device list could not be used');
        }
        return devices;
    }
    async listSamples(accountIds) {
        const readings = new Map();
        const ignored = [];
        for (const accountId of unique(accountIds)) {
            const page = await this.sensorPages(accountId);
            for (const [serial, reading] of page.readings) {
                readings.set(serial, reading);
            }
            ignored.push(...page.ignored);
        }
        return { readings, ignored };
    }
    async sensorPages(accountId) {
        const readings = new Map();
        const ignored = [];
        for (let page = 1; page <= settings_1.MAX_SENSOR_PAGES; page += 1) {
            this.assertBudget();
            const body = (await this.authorized((0, urls_1.sensorsUrl)(accountId, page))).body;
            const parsed = (0, parse_1.parseSensors)(body, sample_1.parseRecordedAt);
            for (const record of parsed.results) {
                const normalized = (0, sample_1.normalizeSample)(record, this.now());
                readings.set(record.serialNumber, normalized.reading);
                ignored.push(...normalized.ignored);
            }
            if (!parsed.hasNext) {
                return { readings, ignored };
            }
        }
        this.options.log?.error('Airthings sensor results exceeded the page cap');
        return { readings, ignored };
    }
    assertBudget() {
        const wait = this.blockedForMs(this.now());
        if (wait > 0) {
            throw new errors_1.RateLimitedError(wait);
        }
    }
    async authorized(url, allowRetry = true) {
        await this.ensureToken();
        const token = this.token;
        if (token === undefined) {
            throw new errors_1.AuthError();
        }
        try {
            return await this.call('GET', url, undefined, {
                authorization: `${token.type} ${token.value}`,
            });
        }
        catch (error) {
            if (allowRetry && error instanceof errors_1.AuthError && this.token !== undefined) {
                this.token = undefined;
                return this.authorized(url, false);
            }
            throw error;
        }
    }
    async ensureToken() {
        const now = this.now();
        if (this.token !== undefined && this.token.expiresAt - 60_000 > now) {
            return;
        }
        const response = await this.requestToken();
        const parsed = (0, parse_1.parseToken)(response.body);
        this.token = {
            value: parsed.token,
            type: parsed.type,
            expiresAt: this.now() + parsed.expiresInSec * 1000,
        };
    }
    /**
     * The documented client-credentials body. Airthings answers an unknown
     * client or a wrong secret with 400, not 401, and this body is otherwise
     * fixed, so a 400 here is the credentials.
     */
    async requestToken() {
        try {
            return await this.call('POST', settings_1.TOKEN_URL, {
                grant_type: 'client_credentials',
                client_id: this.options.clientId,
                client_secret: this.options.clientSecret,
                scope: [settings_1.TOKEN_SCOPE],
            });
        }
        catch (error) {
            if (error instanceof errors_1.HttpStatusError && error.status === 400) {
                throw new errors_1.AuthError();
            }
            throw error;
        }
    }
    async call(method, url, body, headers) {
        const response = await this.transport({
            method,
            url,
            body,
            headers,
            connectTimeoutMs: settings_1.CONNECT_TIMEOUT_MS,
            totalTimeoutMs: settings_1.REQUEST_TIMEOUT_MS,
            maxBytes: settings_1.MAX_RESPONSE_BYTES,
            signal: this.abortController.signal,
        });
        this.note(response.headers);
        return this.interpret(response);
    }
    note(headers) {
        const wait = (0, rate_limit_1.rateLimitWaitMs)(headers, this.now());
        if (wait !== undefined) {
            this.notBefore = Math.max(this.notBefore, this.now() + wait);
        }
    }
    interpret(response) {
        if (response.status === 401 || response.status === 403) {
            throw new errors_1.AuthError();
        }
        if (response.status === 429) {
            const waited = this.blockedForMs(this.now());
            throw new errors_1.RateLimitedError(waited > 0 ? waited : settings_1.DEFAULT_RATE_LIMIT_WAIT_MS);
        }
        if (response.status < 200 || response.status >= 300) {
            throw new errors_1.HttpStatusError(response.status);
        }
        return response;
    }
}
exports.AirthingsClient = AirthingsClient;
function unique(values) {
    return [...new Set(values)];
}
function rejectedDeviceLine(serial) {
    if (serial === '(unreadable)') {
        return 'a device was skipped; its record could not be read';
    }
    if (serial === '(missing serial)') {
        return 'a device was skipped; it had no serial number';
    }
    return `device serial "${(0, redact_1.forLog)(serial)}" was skipped; a serial is 4 to 32 letters or digits`;
}
