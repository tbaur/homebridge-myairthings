"use strict";
/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * @fileoverview Which services a device's sensor list needs.
 *
 * The list is the `sensors` array on the device payload.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.planFor = planFor;
exports.hasPublishableSensor = hasPublishableSensor;
exports.unknownSensorNames = unknownSensorNames;
const RECOGNIZED = new Set([
    'radonShortTermAvg',
    'radonLongTermAvg',
    'temp',
    'humidity',
    'pressure',
    'co2',
    'voc',
    'pm1',
    'pm25',
    'mold',
    'lux',
    'light',
    'sla',
    'soundLevel',
]);
function planFor(sensors) {
    const has = (name) => sensors.includes(name);
    return {
        radonShort: has('radonShortTermAvg'),
        radonLong: has('radonLongTermAvg'),
        temperature: has('temp'),
        humidity: has('humidity'),
        carbonDioxide: has('co2'),
        voc: has('voc'),
        pm25: has('pm25'),
        pm1: has('pm1'),
        pressure: has('pressure'),
        mold: has('mold'),
        light: has('lux') || has('light'),
        sound: has('sla') || has('soundLevel'),
    };
}
function hasPublishableSensor(plan) {
    return Object.values(plan).some((present) => present);
}
/** Sensor names the device reported that this plugin does not map yet. */
function unknownSensorNames(sensors) {
    return [...new Set(sensors.filter((name) => !RECOGNIZED.has(name)))];
}
