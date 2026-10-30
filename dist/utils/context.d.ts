/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * @fileoverview What is stored on a cached accessory.
 *
 * The serial number is the identity. The API name is remembered so a rename
 * in Home is not overwritten the next time Airthings still has the old name,
 * and so an Airthings rename is applied when Home still shows that old name.
 */
import type { PlatformAccessory } from 'homebridge';
import type { AccessoryContext, MonitorSnapshot } from '../types';
export declare function parseAccessoryContext(value: unknown): AccessoryContext | undefined;
export declare function writeContext(accessory: PlatformAccessory, snapshot: MonitorSnapshot, reportsBattery: boolean): void;
/**
 * The name to show. Follow an Airthings rename when Home still has the
 * previous API name. Keep a name the user set in Home.
 */
export declare function resolvedDisplayName(current: string, previousApiName: string | undefined, apiName: string): string;
