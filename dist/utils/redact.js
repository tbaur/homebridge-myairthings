"use strict";
/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * @fileoverview Keeping the client secret and access token out of logs.
 *
 * Patterns match the shape of a credential, so the secret does not have to
 * be passed to every log site.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.REDACTED = void 0;
exports.redactSecrets = redactSecrets;
exports.redactExternal = redactExternal;
exports.forLog = forLog;
const settings_1 = require("../settings");
exports.REDACTED = '[redacted]';
const SECRET_FIELDS = [
    'client_secret',
    'clientSecret',
    'client_id',
    'clientId',
    'access_token',
    'accessToken',
    'refresh_token',
    'authorization',
    'Authorization',
];
const KEYED = new RegExp(`("?(?:${SECRET_FIELDS.join('|')})"?\\s*[:=]\\s*)"?[^\\s"',}&]+"?`, 'gi');
const BEARER = /Bearer\s+[A-Za-z0-9._~+/-]+=*/gi;
const BASIC = /Basic\s+[A-Za-z0-9+/=]+/gi;
/** A JWT: three base64url segments. */
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+/g;
const CONTROL = /[\u0000-\u001F\u007F]/g;
function replaceAll(value, patterns) {
    let result = value;
    for (const pattern of patterns) {
        pattern.lastIndex = 0;
        result = result.replace(pattern, (_match, prefix) => (typeof prefix === 'string' ? `${prefix}${exports.REDACTED}` : exports.REDACTED));
    }
    return result;
}
/** Remove a secret that sits next to its field name. Safe on our own log lines. */
function redactSecrets(value) {
    return replaceAll(value, [KEYED, BEARER, BASIC, JWT]);
}
/**
 * Remove secrets from text that came from outside the plugin.
 *
 * Same patterns. Kept separate so a later, stricter pass on foreign text
 * does not have to apply to every line we write ourselves.
 */
function redactExternal(value) {
    return redactSecrets(value);
}
/** Make an untrusted string safe to place in one log line. */
function forLog(value) {
    const text = typeof value === 'string' ? value : String(value);
    const sanitized = redactSecrets(text).replace(CONTROL, '\uFFFD');
    return sanitized.length > settings_1.MAX_LOG_FIELD_LENGTH
        ? `${sanitized.slice(0, settings_1.MAX_LOG_FIELD_LENGTH)}\u2026`
        : sanitized;
}
