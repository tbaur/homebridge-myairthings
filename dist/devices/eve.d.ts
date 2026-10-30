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
import { type CharacteristicProps, type HAP, type Service } from 'homebridge';
/** Airthings GATT: radon one-day average, Bq/m³. Eve displays this. */
export declare const RADON_SHORT_UUID = "b42e01aa-ade7-11e4-89d3-123b93f75cba";
export declare const RADON_SHORT = "Radon";
/** Airthings GATT: radon long-term average, Bq/m³. */
export declare const RADON_LONG_UUID = "b42e0a4c-ade7-11e4-89d3-123b93f75cba";
export declare const RADON_LONG = "Radon Average";
/** Eve Weather air pressure, hPa. */
export declare const PRESSURE_UUID = "e863f10f-079e-48ff-8f27-9c2605a29f52";
export declare const PRESSURE = "Air Pressure";
/** Eve Room VOC, ppb. */
export declare const VOC_PPB_UUID = "e863f10b-079e-48ff-8f27-9c2605a29f52";
export declare const VOC_PPB = "VOC";
/** This plugin. Eve has no PM1 characteristic. */
export declare const PM1_UUID = "7c2a9e14-5b30-4d8f-9a61-2e0c8b4f6d13";
export declare const PM1 = "PM1 Density";
/** This plugin. Mold risk is an index, not a spore count. */
export declare const MOLD_UUID = "1f6d3b80-9c24-4a57-8e10-5b7a2d9c0e46";
export declare const MOLD = "Mold Risk";
/** This plugin. Sound level in dB. */
export declare const SOUND_UUID = "4e8b1c60-2a75-4f93-b1d8-6c0e9a3f5b27";
export declare const SOUND = "Sound Level";
interface Spec {
    name: string;
    uuid: string;
    unit: string;
    format: CharacteristicProps['format'];
    minValue: number;
    maxValue: number;
    minStep: number;
}
export declare function ensureCustom(service: Service, hap: HAP, spec: Spec): void;
export declare const RADON_SHORT_SPEC: Spec;
export declare const RADON_LONG_SPEC: Spec;
export declare const PRESSURE_SPEC: Spec;
export declare const VOC_PPB_SPEC: Spec;
export declare const PM1_SPEC: Spec;
export declare const MOLD_SPEC: Spec;
export declare const SOUND_SPEC: Spec;
export {};
