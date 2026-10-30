"use strict";
/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * @fileoverview One sample payload, in canonical units, plus anything skipped.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeSample = normalizeSample;
exports.parseRecordedAt = parseRecordedAt;
exports.isFresh = isFresh;
exports.inactiveReason = inactiveReason;
const settings_1 = require("../settings");
const units_1 = require("./units");
function normalizeSample(record, now) {
    const reading = {
        active: isFresh(record.recordedAt, now),
        recordedAt: record.recordedAt,
    };
    if (record.batteryPercent !== undefined) {
        reading.batteryPercent = record.batteryPercent;
    }
    const ignored = [];
    for (const sensor of record.sensors) {
        const converted = (0, units_1.convertSensor)(sensor);
        if (converted === undefined) {
            ignored.push(`${record.serialNumber}\t${sensor.sensorType}\t${sensor.unit}`);
            continue;
        }
        Object.assign(reading, converted);
    }
    return { reading, ignored };
}
function parseRecordedAt(value) {
    const withZone = /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}Z`;
    const ms = Date.parse(withZone);
    return Number.isNaN(ms) ? undefined : ms;
}
function isFresh(recordedAt, now) {
    return inactiveReason(recordedAt, now) === undefined;
}
/** Why a sample is not fresh, or undefined when it still is. */
function inactiveReason(recordedAt, now) {
    if (recordedAt === undefined) {
        return 'timestamp missing';
    }
    const skew = now - recordedAt;
    if (skew > settings_1.STALE_AFTER_MS) {
        return 'sample older than three hours';
    }
    if (skew < -settings_1.FUTURE_SKEW_MS) {
        return 'timestamp ahead of this clock';
    }
    return undefined;
}
