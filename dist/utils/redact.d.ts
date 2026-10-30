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
export declare const REDACTED = "[redacted]";
/** Remove a secret that sits next to its field name. Safe on our own log lines. */
export declare function redactSecrets(value: string): string;
/**
 * Remove secrets from text that came from outside the plugin.
 *
 * Same patterns. Kept separate so a later, stricter pass on foreign text
 * does not have to apply to every line we write ourselves.
 */
export declare function redactExternal(value: string): string;
/** Make an untrusted string safe to place in one log line. */
export declare function forLog(value: unknown): string;
