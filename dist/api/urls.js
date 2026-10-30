"use strict";
/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * @fileoverview Paths on the consumer API. Account ids are checked before
 * they are placed in a URL.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.accountsUrl = accountsUrl;
exports.devicesUrl = devicesUrl;
exports.sensorsUrl = sensorsUrl;
const settings_1 = require("../settings");
const errors_1 = require("../utils/errors");
/**
 * The API documents the account id only as a string. Consumer ids are UUIDs
 * today, so this allows that shape without depending on it, and refuses
 * anything that could change the path: `/`, `.`, `%`, `?`, or `#`.
 */
const ACCOUNT_ID = /^[0-9A-Za-z_-]{1,128}$/;
function accountsUrl() {
    return `${settings_1.API_ORIGIN}/v1/accounts`;
}
function devicesUrl(accountId) {
    return `${settings_1.API_ORIGIN}/v1/accounts/${requireAccountId(accountId)}/devices`;
}
function sensorsUrl(accountId, page) {
    const params = new URLSearchParams({
        unit: 'metric',
        pageNumber: String(page),
    });
    return `${settings_1.API_ORIGIN}/v1/accounts/${requireAccountId(accountId)}/sensors?${params.toString()}`;
}
function requireAccountId(accountId) {
    if (!ACCOUNT_ID.test(accountId)) {
        throw new errors_1.ProtocolError('Airthings returned an account id this plugin will not put in a URL');
    }
    return accountId;
}
