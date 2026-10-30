/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * @fileoverview The platform. It owns which accessories exist, and nothing else.
 *
 * A monitor's identity is its serial number. Adopting a cached accessory keeps
 * the room and the automations. A bad config leaves those accessories
 * registered and answering No Response. A failed poll does not remove one.
 * A monitor is removed only after a device list that succeeded and omitted it.
 */
import type { API, DynamicPlatformPlugin, Logging, PlatformAccessory, PlatformConfig } from 'homebridge';
import type { AccessoryHost } from './devices/host';
import type { PluginLogger } from './types';
/** Homebridge's dynamic platform for an Airthings account. */
export declare class AirthingsPlatform implements DynamicPlatformPlugin, AccessoryHost {
    readonly api: API;
    readonly log: Logging;
    readonly pluginVersion: string;
    private readonly restored;
    private readonly handlers;
    private readonly diagnostics;
    private config?;
    private session?;
    private timer?;
    private diagnosticsTimer?;
    private signals?;
    private pagerDutyLogged;
    /** The last completed poll was a rejected client. */
    private authFailed;
    private cloudOffline;
    private launched;
    private stopped;
    private announced;
    private cyclePromise;
    constructor(log: Logging, platformConfig: PlatformConfig, api: API);
    get hap(): API['hap'];
    get co2DetectedPpm(): number;
    /** Resolves when the current poll has finished. */
    settled(): Promise<void>;
    configureAccessory(accessory: PlatformAccessory): void;
    /** Handlers for accessories Homebridge restored, so an outage can mark them inactive before the next good poll. */
    private attachRestored;
    noteSampleExpired(serialNumber: string): void;
    private cycle;
    private applyOutcome;
    private noteSignals;
    private logPagerDuty;
    private applyView;
    private createAccessory;
    private adopt;
    private removeMissing;
    private report;
    /** Info, not debug: the setting is the opt-in, and Homebridge hides debug lines unless it runs with -D. */
    private logReadings;
    private keepRestoredUnavailable;
    private markStale;
    private schedule;
    private startDiagnostics;
    private diagnosticsLine;
    private restState;
    private stop;
    private uuid;
}
export type { PluginLogger };
