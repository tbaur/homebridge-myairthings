/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * @fileoverview One Airthings monitor.
 *
 * Reads return the last published value. A poll pushes changes. Nothing here
 * waits on the network.
 */
import type { HAP, PlatformAccessory } from 'homebridge';
import type { NormalizedReading } from '../types';
import { BaseAccessory, type MonitorInit } from './base-accessory';
export interface MonitorUpdate {
    sensors: readonly string[];
    battery: boolean;
    reading: NormalizedReading;
}
/** HomeKit accessory for a single monitor. */
export declare class MonitorAccessory extends BaseAccessory {
    private plan;
    private reading;
    private services?;
    private readonly serialNumber;
    private staleTimer?;
    private inactiveLogged;
    constructor(init: MonitorInit);
    /** Rebuild services to match the sensor list, then publish the reading. */
    sync(update: MonitorUpdate): void;
    /** Stop the stale timer. The accessory is about to be removed or replaced. */
    release(): void;
    /** Keep the last numbers and mark every service inactive. */
    markStale(reason?: string): void;
    /** True when the latest sample is still inside the freshness window. */
    isLive(): boolean;
    private armStale;
    private noteInactive;
    private clearStaleTimer;
    private publishAll;
    private publishAir;
    private publishTemperature;
    private publishHumidity;
    private publishCarbonDioxide;
    private publishLight;
    private publishBattery;
    private publishExtras;
    private publishOptional;
    private qualityValue;
    private failReads;
}
/** Numbers already on a cached accessory, so a restart does not invent a reading. */
export declare function readingFromAccessory(accessory: PlatformAccessory, hap: HAP): Partial<NormalizedReading>;
