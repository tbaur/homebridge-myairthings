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
import type { CloudClient } from './api/client';
import type { PluginLogger, PollOutcome } from './types';
interface SessionOptions {
    client: CloudClient;
    log: PluginLogger;
    intervalMs: number;
    now?: () => number;
}
/** Polls Airthings and turns failures into a wait, not a tight loop. */
export declare class CloudSession {
    private readonly options;
    private devices;
    private polls;
    /** Rejected-client polls in a row. Cleared only by an accepted poll. */
    private authStreak;
    private authOpen;
    /** Unreachable polls in a row. A rejected client does not count. */
    private outageStreak;
    private authLogged;
    private outageLogged;
    private readonly announcedUnknown;
    constructor(options: SessionOptions);
    abort(): void;
    poll(): Promise<PollOutcome>;
    private load;
    private fail;
    private logAuth;
    private logOutage;
    private noteRecovery;
    private logUnmapped;
    private logIgnored;
    private now;
}
export declare function backoffMs(failures: number): number;
export {};
