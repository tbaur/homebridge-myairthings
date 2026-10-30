/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * @fileoverview Turn consumer API JSON into the fields this plugin uses.
 *
 * A bad payload throws. It does not throw the payload: the body can echo a
 * token, and the message would end up in a log.
 */
import type { SensorRecord } from '../types';
export interface AccessToken {
    token: string;
    type: string;
    expiresInSec: number;
}
export interface AccountRow {
    id: string;
}
export interface DeviceRow {
    serialNumber: string;
    name: string;
    type: string;
    /** Undefined when the payload omitted `sensors`. An empty array was present. */
    sensors?: string[];
}
export interface ParsedDeviceList {
    devices: DeviceRow[];
    rejected: string[];
    received: number;
}
export interface SensorPage {
    results: SensorRecord[];
    hasNext: boolean;
}
export declare function parseToken(body: string): AccessToken;
export declare function parseAccounts(body: string): AccountRow[];
export declare function parseDevices(body: string): ParsedDeviceList;
export declare function parseSensors(body: string, recordedAt: (value: string) => number | undefined): SensorPage;
