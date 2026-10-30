/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * @fileoverview Build the services for one monitor.
 *
 * Air Quality is the primary service, and the others are linked to it, so
 * Home shows one tile. Extra services follow the sensors on that device.
 */
import type { HAP, PlatformAccessory, Service } from 'homebridge';
import type { SensorPlan } from '../types';
export interface ArrangedServices {
    air: Service;
    temperature?: Service;
    humidity?: Service;
    carbonDioxide?: Service;
    light?: Service;
    battery?: Service;
    /** Where the Eve pressure characteristic lives. */
    pressure?: Service;
}
export declare function arrangeServices(input: {
    hap: HAP;
    accessory: PlatformAccessory;
    plan: SensorPlan;
    battery: boolean;
}): ArrangedServices;
/** Move pressure onto the service that should show it, once a real value exists. */
export declare function placePressure(hap: HAP, air: Service, host: Service, temperature: Service | undefined): void;
