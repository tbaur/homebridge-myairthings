/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * @fileoverview Paths on the consumer API. Account ids are checked before
 * they are placed in a URL.
 */
export declare function accountsUrl(): string;
export declare function devicesUrl(accountId: string): string;
export declare function sensorsUrl(accountId: string, page: number): string;
