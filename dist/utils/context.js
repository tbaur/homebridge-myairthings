"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseAccessoryContext = parseAccessoryContext;
exports.writeContext = writeContext;
exports.resolvedDisplayName = resolvedDisplayName;
function parseAccessoryContext(value) {
    if (typeof value !== 'object' || value === null) {
        return undefined;
    }
    const record = value;
    if (typeof record.serialNumber !== 'string' || !/^[0-9A-Za-z]{4,32}$/.test(record.serialNumber)) {
        return undefined;
    }
    return {
        serialNumber: record.serialNumber,
        apiName: typeof record.apiName === 'string' ? record.apiName : record.serialNumber,
        deviceType: typeof record.deviceType === 'string' ? record.deviceType : '',
        sensors: Array.isArray(record.sensors) ? record.sensors.filter((sensor) => typeof sensor === 'string') : [],
        reportsBattery: record.reportsBattery === true,
        recordedAt: typeof record.recordedAt === 'number' && Number.isFinite(record.recordedAt) ? record.recordedAt : undefined,
    };
}
function writeContext(accessory, snapshot, reportsBattery) {
    const context = {
        serialNumber: snapshot.serialNumber,
        apiName: snapshot.name,
        deviceType: snapshot.type,
        sensors: [...snapshot.sensors],
        reportsBattery,
        recordedAt: snapshot.reading.recordedAt,
    };
    accessory.context = context;
}
/**
 * The name to show. Follow an Airthings rename when Home still has the
 * previous API name. Keep a name the user set in Home.
 */
function resolvedDisplayName(current, previousApiName, apiName) {
    if (previousApiName === undefined || current === previousApiName) {
        return apiName;
    }
    return current;
}
