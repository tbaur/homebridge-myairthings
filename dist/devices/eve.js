"use strict";
/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * @fileoverview Characteristics Eve already knows, and three this plugin owns.
 *
 * HAP looks a string up as a display name, not as a UUID. These names are
 * the lookup keys. The UUIDs are what Eve matches.
 *
 * Radon UUIDs are the Airthings GATT characteristics. Pressure and VOC ppb
 * are Eve's. PM1, mold risk, and sound have no Eve UUID; they are labeled
 * for apps that show every characteristic.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SOUND_SPEC = exports.MOLD_SPEC = exports.PM1_SPEC = exports.VOC_PPB_SPEC = exports.PRESSURE_SPEC = exports.RADON_LONG_SPEC = exports.RADON_SHORT_SPEC = exports.SOUND = exports.SOUND_UUID = exports.MOLD = exports.MOLD_UUID = exports.PM1 = exports.PM1_UUID = exports.VOC_PPB = exports.VOC_PPB_UUID = exports.PRESSURE = exports.PRESSURE_UUID = exports.RADON_LONG = exports.RADON_LONG_UUID = exports.RADON_SHORT = exports.RADON_SHORT_UUID = void 0;
exports.ensureCustom = ensureCustom;
/** Airthings GATT: radon one-day average, Bq/m³. Eve displays this. */
exports.RADON_SHORT_UUID = 'b42e01aa-ade7-11e4-89d3-123b93f75cba';
exports.RADON_SHORT = 'Radon';
/** Airthings GATT: radon long-term average, Bq/m³. */
exports.RADON_LONG_UUID = 'b42e0a4c-ade7-11e4-89d3-123b93f75cba';
exports.RADON_LONG = 'Radon Average';
/** Eve Weather air pressure, hPa. */
exports.PRESSURE_UUID = 'e863f10f-079e-48ff-8f27-9c2605a29f52';
exports.PRESSURE = 'Air Pressure';
/** Eve Room VOC, ppb. */
exports.VOC_PPB_UUID = 'e863f10b-079e-48ff-8f27-9c2605a29f52';
exports.VOC_PPB = 'VOC';
/** This plugin. Eve has no PM1 characteristic. */
exports.PM1_UUID = '7c2a9e14-5b30-4d8f-9a61-2e0c8b4f6d13';
exports.PM1 = 'PM1 Density';
/** This plugin. Mold risk is an index, not a spore count. */
exports.MOLD_UUID = '1f6d3b80-9c24-4a57-8e10-5b7a2d9c0e46';
exports.MOLD = 'Mold Risk';
/** This plugin. Sound level in dB. */
exports.SOUND_UUID = '4e8b1c60-2a75-4f93-b1d8-6c0e9a3f5b27';
exports.SOUND = 'Sound Level';
function ensureCustom(service, hap, spec) {
    if (service.testCharacteristic(spec.name)) {
        return;
    }
    service.addCharacteristic(new hap.Characteristic(spec.name, spec.uuid, {
        format: spec.format,
        perms: ["pr" /* Perms.PAIRED_READ */, "ev" /* Perms.NOTIFY */],
        unit: spec.unit,
        minValue: spec.minValue,
        maxValue: spec.maxValue,
        minStep: spec.minStep,
    }));
}
exports.RADON_SHORT_SPEC = {
    name: exports.RADON_SHORT, uuid: exports.RADON_SHORT_UUID, unit: 'Bq/m³', format: "uint16" /* Formats.UINT16 */, minValue: 0, maxValue: 20000, minStep: 1,
};
exports.RADON_LONG_SPEC = {
    name: exports.RADON_LONG, uuid: exports.RADON_LONG_UUID, unit: 'Bq/m³', format: "uint16" /* Formats.UINT16 */, minValue: 0, maxValue: 20000, minStep: 1,
};
exports.PRESSURE_SPEC = {
    name: exports.PRESSURE, uuid: exports.PRESSURE_UUID, unit: 'hPa', format: "uint16" /* Formats.UINT16 */, minValue: 500, maxValue: 1200, minStep: 1,
};
exports.VOC_PPB_SPEC = {
    name: exports.VOC_PPB, uuid: exports.VOC_PPB_UUID, unit: 'ppb', format: "uint16" /* Formats.UINT16 */, minValue: 0, maxValue: 65535, minStep: 1,
};
exports.PM1_SPEC = {
    name: exports.PM1, uuid: exports.PM1_UUID, unit: 'µg/m³', format: "float" /* Formats.FLOAT */, minValue: 0, maxValue: 1000, minStep: 0.1,
};
exports.MOLD_SPEC = {
    name: exports.MOLD, uuid: exports.MOLD_UUID, unit: '', format: "uint8" /* Formats.UINT8 */, minValue: 0, maxValue: 10, minStep: 1,
};
exports.SOUND_SPEC = {
    name: exports.SOUND, uuid: exports.SOUND_UUID, unit: 'dB', format: "float" /* Formats.FLOAT */, minValue: 0, maxValue: 120, minStep: 0.1,
};
