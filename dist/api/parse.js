"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseToken = parseToken;
exports.parseAccounts = parseAccounts;
exports.parseDevices = parseDevices;
exports.parseSensors = parseSensors;
const errors_1 = require("../utils/errors");
function parseToken(body) {
    const record = object(body, 'token response');
    const token = text(record, 'access_token');
    const type = text(record, 'token_type') ?? 'Bearer';
    const expires = number(record, 'expires_in');
    if (token === undefined || expires === undefined || expires <= 0 || !headerToken(token) || !headerToken(type)) {
        throw new errors_1.ProtocolError('Airthings returned a token response this plugin could not use');
    }
    return { token, type, expiresInSec: expires };
}
function parseAccounts(body) {
    const record = object(body, 'account list');
    const accounts = record.accounts;
    if (!Array.isArray(accounts)) {
        throw new errors_1.ProtocolError('Airthings returned an account list this plugin could not use');
    }
    return accounts.flatMap((entry) => {
        if (!isRecord(entry)) {
            return [];
        }
        const id = text(entry, 'id');
        return id === undefined ? [] : [{ id }];
    });
}
function parseDevices(body) {
    const record = object(body, 'device list');
    const devices = record.devices;
    if (!Array.isArray(devices)) {
        throw new errors_1.ProtocolError('Airthings returned a device list this plugin could not use');
    }
    const parsed = [];
    const rejected = [];
    for (const entry of devices) {
        if (!isRecord(entry)) {
            rejected.push('(unreadable)');
            continue;
        }
        const serialNumber = text(entry, 'serialNumber');
        if (serialNumber === undefined || !/^[0-9A-Za-z]{4,32}$/.test(serialNumber)) {
            rejected.push(serialNumber ?? '(missing serial)');
            continue;
        }
        const sensors = Array.isArray(entry.sensors)
            ? entry.sensors.filter((sensor) => typeof sensor === 'string')
            : undefined;
        parsed.push({
            serialNumber: serialNumber.toLowerCase(),
            name: text(entry, 'name') ?? '',
            type: text(entry, 'type') ?? '',
            sensors,
        });
    }
    return { devices: parsed, rejected, received: devices.length };
}
function parseSensors(body, recordedAt) {
    const record = object(body, 'sensor results');
    const results = record.results;
    if (!Array.isArray(results)) {
        throw new errors_1.ProtocolError('Airthings returned sensor results this plugin could not use');
    }
    return {
        hasNext: record.hasNext === true,
        results: results.flatMap((entry) => parseOneSample(entry, recordedAt)),
    };
}
function parseOneSample(entry, recordedAt) {
    if (!isRecord(entry)) {
        return [];
    }
    const serialNumber = text(entry, 'serialNumber');
    if (serialNumber === undefined || !/^[0-9A-Za-z]{4,32}$/.test(serialNumber)) {
        return [];
    }
    const sensors = Array.isArray(entry.sensors) ? entry.sensors.flatMap(parseSensor) : [];
    const recorded = text(entry, 'recorded');
    const battery = number(entry, 'batteryPercentage');
    return [{
            serialNumber: serialNumber.toLowerCase(),
            sensors,
            recordedAt: recorded === undefined ? undefined : recordedAt(recorded),
            batteryPercent: battery === undefined ? undefined : clamp(battery, 0, 100),
        }];
}
function parseSensor(entry) {
    if (!isRecord(entry)) {
        return [];
    }
    const sensorType = text(entry, 'sensorType');
    const value = number(entry, 'value');
    const unit = text(entry, 'unit') ?? '';
    if (sensorType === undefined || value === undefined) {
        return [];
    }
    return [{ sensorType, value, unit }];
}
function object(body, what) {
    let parsed;
    try {
        parsed = JSON.parse(body);
    }
    catch {
        throw new errors_1.ProtocolError(`Airthings returned a ${what} that was not JSON`);
    }
    if (!isRecord(parsed)) {
        throw new errors_1.ProtocolError(`Airthings returned a ${what} this plugin could not use`);
    }
    return parsed;
}
function headerToken(value) {
    return /^[\x21-\x7E]+$/.test(value);
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function text(record, key) {
    const value = record[key];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}
function number(record, key) {
    const value = record[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
