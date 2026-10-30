/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * @fileoverview How long to wait after a rate-limit header.
 *
 * The consumer API sends `X-RateLimit-Remaining`, `X-RateLimit-Reset`, and
 * on 429 `X-RateLimit-Retry-After`. Node lowercases header names.
 */
export declare function rateLimitWaitMs(headers: Readonly<Record<string, string | string[] | undefined>>, now: number): number | undefined;
