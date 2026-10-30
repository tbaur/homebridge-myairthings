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
export declare function errorCode(error: unknown): string | undefined;
/** One line, with the cause chain, safe to log. */
export declare function describeError(error: unknown): string;
/** The host could not be reached, or the exchange did not finish. */
export declare class ConnectionError extends Error {
    constructor(message: string, options?: {
        cause?: unknown;
    });
}
/** The host answered with something this plugin will not use. */
export declare class ProtocolError extends Error {
    constructor(message: string, options?: {
        cause?: unknown;
    });
}
/** A completed HTTP response whose status is not a success. */
export declare class HttpStatusError extends Error {
    readonly status: number;
    constructor(status: number);
}
/** The account list had no usable id. Not an empty home, and not an outage. */
export declare class NoAccountsError extends Error {
    constructor();
}
/** Homebridge asked the in-flight request to stop. Not an outage. */
export declare class AbortedError extends Error {
    constructor();
}
/** The client id or secret was rejected. */
export declare class AuthError extends Error {
    constructor(message?: string);
}
/** The hourly budget is spent. `retryAfterMs` is how long to wait. */
export declare class RateLimitedError extends Error {
    readonly retryAfterMs: number;
    constructor(retryAfterMs: number);
}
