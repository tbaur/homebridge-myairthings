"use strict";
/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * @fileoverview Error types and a log-safe description.
 *
 * Descriptions go through redaction. An error message is text the plugin did
 * not write, and it is the route by which a token could reach a log line.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimitedError = exports.AuthError = exports.AbortedError = exports.NoAccountsError = exports.HttpStatusError = exports.ProtocolError = exports.ConnectionError = void 0;
exports.errorCode = errorCode;
exports.describeError = describeError;
const redact_1 = require("./redact");
const MAX_DESCRIPTION_LENGTH = 300;
function errorCode(error) {
    if (typeof error !== 'object' || error === null) {
        return undefined;
    }
    const code = error.code;
    return typeof code === 'string' && code.length > 0 ? code : undefined;
}
function messageOf(error) {
    if (error instanceof Error) {
        const code = errorCode(error);
        return code !== undefined ? `${error.message} (${code})` : error.message;
    }
    if (typeof error === 'string') {
        return error;
    }
    return 'unknown error';
}
/** One line, with the cause chain, safe to log. */
function describeError(error) {
    const parts = [];
    let current = error;
    const seen = new Set();
    while (current !== undefined && current !== null && !seen.has(current)) {
        seen.add(current);
        const text = messageOf(current);
        if (text.length > 0 && !parts.includes(text)) {
            parts.push(text);
        }
        current = current instanceof Error ? current.cause : undefined;
    }
    const joined = parts.length > 0 ? parts.join(': ') : 'unknown error';
    const sanitized = (0, redact_1.redactExternal)(joined).replace(/[\u0000-\u001F\u007F]/g, '\uFFFD');
    return sanitized.length > MAX_DESCRIPTION_LENGTH
        ? `${sanitized.slice(0, MAX_DESCRIPTION_LENGTH)}\u2026`
        : sanitized;
}
/** The host could not be reached, or the exchange did not finish. */
class ConnectionError extends Error {
    constructor(message, options) {
        super(message, options);
        this.name = 'ConnectionError';
    }
}
exports.ConnectionError = ConnectionError;
/** The host answered with something this plugin will not use. */
class ProtocolError extends Error {
    constructor(message, options) {
        super(message, options);
        this.name = 'ProtocolError';
    }
}
exports.ProtocolError = ProtocolError;
/** A completed HTTP response whose status is not a success. */
class HttpStatusError extends Error {
    status;
    constructor(status) {
        super(`Airthings returned ${status}`);
        this.name = 'HttpStatusError';
        this.status = status;
    }
}
exports.HttpStatusError = HttpStatusError;
/** The account list had no usable id. Not an empty home, and not an outage. */
class NoAccountsError extends Error {
    constructor() {
        super('Airthings returned no accounts');
        this.name = 'NoAccountsError';
    }
}
exports.NoAccountsError = NoAccountsError;
/** Homebridge asked the in-flight request to stop. Not an outage. */
class AbortedError extends Error {
    constructor() {
        super('request aborted');
        this.name = 'AbortedError';
    }
}
exports.AbortedError = AbortedError;
/** The client id or secret was rejected. */
class AuthError extends Error {
    constructor(message = 'Airthings rejected the client credentials') {
        super(message);
        this.name = 'AuthError';
    }
}
exports.AuthError = AuthError;
/** The hourly budget is spent. `retryAfterMs` is how long to wait. */
class RateLimitedError extends Error {
    retryAfterMs;
    constructor(retryAfterMs) {
        super(`Airthings rate limit reached. Retry in ${Math.max(1, Math.ceil(retryAfterMs / 1000))}s`);
        this.name = 'RateLimitedError';
        this.retryAfterMs = retryAfterMs;
    }
}
exports.RateLimitedError = RateLimitedError;
