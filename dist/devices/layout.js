"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.arrangeServices = arrangeServices;
exports.placePressure = placePressure;
const eve_1 = require("./eve");
function arrangeServices(input) {
    const { hap, accessory, plan } = input;
    const air = requireService(accessory, hap.Service.AirQualitySensor, 'Air Quality');
    air.setPrimaryService(true);
    const temperature = optional(accessory, hap.Service.TemperatureSensor, 'Temperature', plan.temperature);
    const humidity = optional(accessory, hap.Service.HumiditySensor, 'Humidity', plan.humidity);
    const carbonDioxide = optional(accessory, hap.Service.CarbonDioxideSensor, 'Carbon Dioxide', plan.carbonDioxide);
    const light = optional(accessory, hap.Service.LightSensor, 'Light', plan.light);
    const battery = optional(accessory, hap.Service.Battery, 'Battery', input.battery);
    decorateAir(hap, air, plan);
    const pressure = pressureService({ hap, accessory, air, temperature, wanted: plan.pressure });
    for (const service of [temperature, humidity, carbonDioxide, light, battery]) {
        if (service !== undefined) {
            link(air, service);
        }
    }
    dropUnused(hap, accessory, [air, temperature, humidity, carbonDioxide, light, battery]);
    return { air, temperature, humidity, carbonDioxide, light, battery, pressure };
}
function decorateAir(hap, air, plan) {
    if (plan.pm25) {
        air.getCharacteristic(hap.Characteristic.PM2_5Density).setProps({ maxValue: 1000, minValue: 0, minStep: 1 });
    }
    if (plan.voc) {
        air.getCharacteristic(hap.Characteristic.VOCDensity).setProps({ maxValue: 100_000, minValue: 0, minStep: 1 });
        (0, eve_1.ensureCustom)(air, hap, eve_1.VOC_PPB_SPEC);
    }
    if (plan.pm1) {
        (0, eve_1.ensureCustom)(air, hap, eve_1.PM1_SPEC);
    }
    if (plan.mold) {
        (0, eve_1.ensureCustom)(air, hap, eve_1.MOLD_SPEC);
    }
    if (plan.sound) {
        (0, eve_1.ensureCustom)(air, hap, eve_1.SOUND_SPEC);
    }
    if (!plan.pm25) {
        forget(air, 'PM2.5 Density');
    }
    if (!plan.voc) {
        forget(air, 'VOC Density');
        forget(air, eve_1.VOC_PPB);
    }
    if (!plan.radonShort) {
        forget(air, eve_1.RADON_SHORT);
    }
    if (!plan.radonLong) {
        forget(air, eve_1.RADON_LONG);
    }
    if (!plan.pm1) {
        forget(air, eve_1.PM1);
    }
    if (!plan.mold) {
        forget(air, eve_1.MOLD);
    }
    if (!plan.sound) {
        forget(air, eve_1.SOUND);
    }
}
function pressureService(input) {
    const { hap, accessory, air, temperature, wanted } = input;
    const existingTemperature = accessory.getService(hap.Service.TemperatureSensor);
    if (!wanted) {
        forget(air, eve_1.PRESSURE);
        if (existingTemperature !== undefined) {
            forget(existingTemperature, eve_1.PRESSURE);
        }
        return undefined;
    }
    return temperature ?? air;
}
/** Move pressure onto the service that should show it, once a real value exists. */
function placePressure(hap, air, host, temperature) {
    if (host === air) {
        if (temperature !== undefined) {
            forget(temperature, eve_1.PRESSURE);
        }
    }
    else {
        forget(air, eve_1.PRESSURE);
    }
    (0, eve_1.ensureCustom)(host, hap, eve_1.PRESSURE_SPEC);
}
function optional(accessory, type, name, wanted) {
    if (!wanted) {
        return undefined;
    }
    return requireService(accessory, type, name);
}
function requireService(accessory, type, name) {
    const existing = accessory.getService(type);
    if (existing !== undefined) {
        return existing;
    }
    const created = new type(name);
    return accessory.addService(created);
}
function forget(service, characteristic) {
    if (!service.testCharacteristic(characteristic)) {
        return;
    }
    const current = service.getCharacteristic(characteristic);
    if (current !== undefined) {
        service.removeCharacteristic(current);
    }
}
function link(primary, child) {
    if (!primary.linkedServices.includes(child)) {
        primary.addLinkedService(child);
    }
}
function dropUnused(hap, accessory, keep) {
    const managed = new Set([
        hap.Service.AirQualitySensor.UUID,
        hap.Service.TemperatureSensor.UUID,
        hap.Service.HumiditySensor.UUID,
        hap.Service.CarbonDioxideSensor.UUID,
        hap.Service.LightSensor.UUID,
        hap.Service.Battery.UUID,
    ]);
    const kept = new Set(keep.flatMap((service) => service === undefined ? [] : [service.UUID]));
    for (const service of [...accessory.services]) {
        if (managed.has(service.UUID) && !kept.has(service.UUID)) {
            accessory.removeService(service);
        }
    }
}
