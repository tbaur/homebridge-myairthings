"use strict";
/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * @fileoverview Convert a sensor value into the unit HomeKit or Eve expects.
 *
 * The consumer API names the unit on each value. Metric is requested, and
 * the other spellings are accepted so a sample is not dropped when the unit
 * token differs.
 *
 * VOC is reported in ppb. HomeKit's VOC density is micrograms per cubic
 * metre. Airthings does not publish a molar mass, so the mass value uses
 * isobutylene at 25°C, the reference gas VOC sensors are calibrated against.
 * Eve receives the unmodified ppb value.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ppbToMicrograms = ppbToMicrograms;
exports.microgramsToPpb = microgramsToPpb;
exports.convertSensor = convertSensor;
/** Grams per mole of isobutylene (2-methylpropene), the usual VOC reference gas. */
const ISOBUTYLENE_GRAMS_PER_MOLE = 56.106;
/** Litres per mole of an ideal gas at 25°C and 101.325 kPa. */
const LITERS_PER_MOLE_AT_25C = 24.465;
/** 1 pCi/L = 37 Bq/m³. */
const BQ_PER_PCI = 37;
/** 1 inHg in hPa. */
const HPA_PER_INHG = 33.8639;
function ppbToMicrograms(ppb) {
    return ppb * ISOBUTYLENE_GRAMS_PER_MOLE / LITERS_PER_MOLE_AT_25C;
}
function microgramsToPpb(micrograms) {
    return micrograms * LITERS_PER_MOLE_AT_25C / ISOBUTYLENE_GRAMS_PER_MOLE;
}
/** The fields this value contributes, or undefined when the unit is unknown. */
function convertSensor(sensor) {
    const unit = sensor.unit.trim().toLowerCase();
    switch (sensor.sensorType) {
        case 'temp':
            return temperature(sensor.value, unit);
        case 'humidity':
            return unit === '' || unit === 'pct' || unit === '%'
                ? { humidityPercent: sensor.value }
                : undefined;
        case 'radonShortTermAvg':
            return radon(sensor.value, unit, 'radonShortBq');
        case 'radonLongTermAvg':
            return radon(sensor.value, unit, 'radonLongBq');
        case 'co2':
            return unit === '' || unit === 'ppm' ? { co2Ppm: sensor.value } : undefined;
        case 'voc':
            return voc(sensor.value, unit);
        case 'pm25':
            return mass(sensor.value, unit, 'pm25Micrograms');
        case 'pm1':
            return mass(sensor.value, unit, 'pm1Micrograms');
        case 'pressure':
            return pressure(sensor.value, unit);
        case 'mold':
            return unit === '' || unit === 'index' ? { mold: sensor.value } : undefined;
        case 'lux':
        case 'light':
            return unit === '' || unit === 'lux' ? { lux: sensor.value } : undefined;
        case 'sla':
        case 'soundLevel':
            return unit === '' || unit === 'db' || unit === 'dba' ? { soundDb: sensor.value } : undefined;
        default:
            return undefined;
    }
}
function temperature(value, unit) {
    if (unit === '' || unit === 'c') {
        return { temperatureC: value };
    }
    if (unit === 'f') {
        return { temperatureC: (value - 32) * 5 / 9 };
    }
    return undefined;
}
function radon(value, unit, field) {
    if (unit === '' || unit === 'bq' || unit === 'bqm3') {
        return { [field]: value };
    }
    if (unit === 'pci' || unit === 'pcil') {
        return { [field]: value * BQ_PER_PCI };
    }
    return undefined;
}
function voc(value, unit) {
    if (unit === '' || unit === 'ppb') {
        return { vocPpb: value, vocMicrograms: ppbToMicrograms(value) };
    }
    if (unit === 'ugm3' || unit === 'ug/m3' || unit === 'µg/m³' || unit === 'mgpc') {
        return { vocMicrograms: value, vocPpb: microgramsToPpb(value) };
    }
    return undefined;
}
function mass(value, unit, field) {
    if (unit === '' || unit === 'ugm3' || unit === 'ug/m3' || unit === 'µg/m³' || unit === 'mgpc') {
        return { [field]: value };
    }
    return undefined;
}
function pressure(value, unit) {
    if (unit === '' || unit === 'hpa' || unit === 'mbar') {
        return { pressureHpa: value };
    }
    if (unit === 'pa') {
        return { pressureHpa: value / 100 };
    }
    if (unit === 'inhg') {
        return { pressureHpa: value * HPA_PER_INHG };
    }
    return undefined;
}
