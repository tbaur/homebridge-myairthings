/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * @fileoverview What every monitor accessory shares.
 *
 * Unavailable means No Response. A cloud blip does not use that path: the
 * sensor stays up and StatusActive goes false, so the last reading remains.
 */
import type { Characteristic, CharacteristicValue, PlatformAccessory, Service, WithUUID } from 'homebridge';
import type { AccessoryHost } from './host';
export type ServiceConstructor = {
    UUID: string;
    new (displayName?: string, subtype?: string): Service;
};
type CharacteristicLike = string | WithUUID<typeof Characteristic>;
export interface MonitorInit {
    host: AccessoryHost;
    accessory: PlatformAccessory;
    displayName: string;
    model: string;
    serialNumber: string;
    unavailable: boolean;
}
export declare abstract class BaseAccessory {
    protected readonly host: AccessoryHost;
    protected readonly accessory: PlatformAccessory;
    displayName: string;
    protected readonly unavailable: boolean;
    constructor(init: MonitorInit);
    /** Refresh Accessory Information after a later poll renames the monitor. */
    updateIdentity(input: {
        displayName: string;
        model: string;
        serialNumber: string;
    }): void;
    protected requireAvailable(): void;
    protected publish(service: Service, characteristic: CharacteristicLike, value: CharacteristicValue): void;
    private configureInformation;
}
export {};
