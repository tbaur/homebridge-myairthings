"use strict";
/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * @fileoverview One Airthings monitor.
 *
 * Reads return the last published value. A poll pushes changes. Nothing here
 * waits on the network.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MonitorAccessory = void 0;
exports.readingFromAccessory = readingFromAccessory;
const quality_1 = require("../readings/quality");
const sample_1 = require("../readings/sample");
const settings_1 = require("../settings");
const base_accessory_1 = require("./base-accessory");
const eve_1 = require("./eve");
const layout_1 = require("./layout");
const redact_1 = require("../utils/redact");
const plan_1 = require("../readings/plan");
/** HomeKit accessory for a single monitor. */
class MonitorAccessory extends base_accessory_1.BaseAccessory {
    plan = (0, plan_1.planFor)([]);
    reading = { active: false };
    services;
    serialNumber;
    staleTimer;
    inactiveLogged = false;
    constructor(init) {
        super(init);
        this.serialNumber = init.serialNumber;
        if (init.unavailable) {
            this.failReads();
        }
    }
    /** Rebuild services to match the sensor list, then publish the reading. */
    sync(update) {
        this.plan = (0, plan_1.planFor)(update.sensors);
        this.reading = update.reading;
        this.services = (0, layout_1.arrangeServices)({
            hap: this.host.hap,
            accessory: this.accessory,
            plan: this.plan,
            battery: update.battery || update.reading.batteryPercent !== undefined,
        });
        if (!this.unavailable) {
            this.publishAll();
        }
        this.armStale();
        if (this.reading.active) {
            this.inactiveLogged = false;
        }
        else {
            this.noteInactive((0, sample_1.inactiveReason)(this.reading.recordedAt, Date.now()) ?? 'sample older than three hours');
        }
    }
    /** Stop the stale timer. The accessory is about to be removed or replaced. */
    release() {
        this.clearStaleTimer();
    }
    /** Keep the last numbers and mark every service inactive. */
    markStale(reason = 'three unreachable polls') {
        this.clearStaleTimer();
        this.reading = { ...this.reading, active: false };
        if (!this.unavailable) {
            this.publishAll();
        }
        this.noteInactive(reason);
    }
    /** True when the latest sample is still inside the freshness window. */
    isLive() {
        return !this.unavailable && this.reading.active;
    }
    armStale() {
        this.clearStaleTimer();
        const recordedAt = this.reading.recordedAt;
        if (recordedAt === undefined || !this.reading.active || this.unavailable) {
            return;
        }
        const delay = recordedAt + settings_1.STALE_AFTER_MS - Date.now();
        if (delay <= 0) {
            this.markStale('sample older than three hours');
            return;
        }
        this.staleTimer = setTimeout(() => {
            this.staleTimer = undefined;
            this.reading = { ...this.reading, active: false };
            if (!this.unavailable) {
                this.publishAll();
            }
            this.host.noteSampleExpired?.(this.serialNumber);
            this.noteInactive('sample older than three hours');
        }, delay);
        this.staleTimer.unref();
    }
    noteInactive(reason) {
        if (this.inactiveLogged) {
            return;
        }
        this.inactiveLogged = true;
        this.host.log.info(`${(0, redact_1.forLog)(this.displayName)} inactive: ${reason}`);
    }
    clearStaleTimer() {
        if (this.staleTimer !== undefined) {
            clearTimeout(this.staleTimer);
            this.staleTimer = undefined;
        }
    }
    publishAll() {
        const services = this.services;
        if (services === undefined) {
            return;
        }
        this.publishAir(services.air);
        this.publishTemperature(services.temperature);
        this.publishHumidity(services.humidity);
        this.publishCarbonDioxide(services.carbonDioxide);
        this.publishLight(services.light);
        this.publishBattery(services.battery);
        this.publishExtras(services);
    }
    publishAir(service) {
        const { Characteristic } = this.host.hap;
        this.publish(service, Characteristic.AirQuality, this.qualityValue((0, quality_1.airQuality)(this.plan, this.reading)));
        this.publish(service, Characteristic.StatusActive, this.reading.active);
        this.publishOptional({ service, characteristic: Characteristic.PM2_5Density, value: this.reading.pm25Micrograms, min: 0, max: 1000 });
        this.publishOptional({ service, characteristic: Characteristic.VOCDensity, value: this.reading.vocMicrograms, min: 0, max: 100_000 });
        if (this.plan.voc) {
            this.publishOptional({ service, characteristic: eve_1.VOC_PPB, value: this.reading.vocPpb, min: 0, max: 65535, round: true });
        }
        if (this.plan.radonShort) {
            this.publishOptional({ service, characteristic: eve_1.RADON_SHORT, value: this.reading.radonShortBq, min: 0, max: 20000, round: true, spec: eve_1.RADON_SHORT_SPEC });
        }
        if (this.plan.radonLong) {
            this.publishOptional({ service, characteristic: eve_1.RADON_LONG, value: this.reading.radonLongBq, min: 0, max: 20000, round: true, spec: eve_1.RADON_LONG_SPEC });
        }
        if (this.plan.pm1) {
            this.publishOptional({ service, characteristic: eve_1.PM1, value: this.reading.pm1Micrograms, min: 0, max: 1000 });
        }
        if (this.plan.mold) {
            this.publishOptional({ service, characteristic: eve_1.MOLD, value: this.reading.mold, min: 0, max: 10, round: true });
        }
        if (this.plan.sound) {
            this.publishOptional({ service, characteristic: eve_1.SOUND, value: this.reading.soundDb, min: 0, max: 120 });
        }
    }
    publishTemperature(service) {
        if (service === undefined) {
            return;
        }
        const { Characteristic } = this.host.hap;
        this.publishOptional({ service, characteristic: Characteristic.CurrentTemperature, value: this.reading.temperatureC, min: -270, max: 100 });
        this.publish(service, Characteristic.StatusActive, this.reading.active && this.reading.temperatureC !== undefined);
    }
    publishHumidity(service) {
        if (service === undefined) {
            return;
        }
        const { Characteristic } = this.host.hap;
        this.publishOptional({ service, characteristic: Characteristic.CurrentRelativeHumidity, value: this.reading.humidityPercent, min: 0, max: 100 });
        this.publish(service, Characteristic.StatusActive, this.reading.active && this.reading.humidityPercent !== undefined);
    }
    publishCarbonDioxide(service) {
        if (service === undefined) {
            return;
        }
        const { Characteristic } = this.host.hap;
        const ppm = this.reading.co2Ppm;
        if (ppm !== undefined) {
            const detected = ppm >= this.host.co2DetectedPpm
                ? Characteristic.CarbonDioxideDetected.CO2_LEVELS_ABNORMAL
                : Characteristic.CarbonDioxideDetected.CO2_LEVELS_NORMAL;
            this.publish(service, Characteristic.CarbonDioxideDetected, detected);
            this.publish(service, Characteristic.CarbonDioxideLevel, clamp(ppm, 0, 100_000));
        }
        this.publish(service, Characteristic.StatusActive, this.reading.active && ppm !== undefined);
    }
    publishLight(service) {
        if (service === undefined) {
            return;
        }
        const { Characteristic } = this.host.hap;
        const lux = this.reading.lux;
        if (lux !== undefined) {
            this.publish(service, Characteristic.CurrentAmbientLightLevel, clamp(Math.max(lux, 0.0001), 0.0001, 100_000));
        }
        this.publish(service, Characteristic.StatusActive, this.reading.active && lux !== undefined);
    }
    publishBattery(service) {
        if (service === undefined || this.reading.batteryPercent === undefined) {
            return;
        }
        const { Characteristic } = this.host.hap;
        const level = Math.round(clamp(this.reading.batteryPercent, 0, 100));
        this.publish(service, Characteristic.BatteryLevel, level);
        this.publish(service, Characteristic.StatusLowBattery, level <= 10
            ? Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
            : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL);
        this.publish(service, Characteristic.ChargingState, Characteristic.ChargingState.NOT_CHARGING);
    }
    publishExtras(services) {
        const host = services.pressure;
        if (host === undefined || this.reading.pressureHpa === undefined) {
            return;
        }
        (0, layout_1.placePressure)(this.host.hap, services.air, host, services.temperature);
        this.publishOptional({ service: host, characteristic: eve_1.PRESSURE, value: this.reading.pressureHpa, min: 500, max: 1200, round: true, spec: eve_1.PRESSURE_SPEC });
    }
    publishOptional(input) {
        const { service, characteristic, value, min, max, round = false, spec } = input;
        if (value === undefined) {
            return;
        }
        if (spec !== undefined) {
            (0, eve_1.ensureCustom)(service, this.host.hap, spec);
        }
        if (!service.testCharacteristic(characteristic)) {
            return;
        }
        const next = round ? Math.round(clamp(value, min, max)) : clamp(value, min, max);
        this.publish(service, characteristic, next);
    }
    qualityValue(word) {
        const air = this.host.hap.Characteristic.AirQuality;
        switch (word) {
            case 'good':
                return air.GOOD;
            case 'fair':
                return air.FAIR;
            case 'poor':
                return air.POOR;
            default:
                return air.UNKNOWN;
        }
    }
    failReads() {
        for (const service of this.accessory.services) {
            for (const characteristic of service.characteristics) {
                characteristic.onGet(() => {
                    this.requireAvailable();
                    return characteristic.value;
                });
            }
        }
    }
}
exports.MonitorAccessory = MonitorAccessory;
function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
/** Numbers already on a cached accessory, so a restart does not invent a reading. */
function readingFromAccessory(accessory, hap) {
    const air = accessory.getService(hap.Service.AirQualitySensor);
    const temperature = accessory.getService(hap.Service.TemperatureSensor);
    const humidity = accessory.getService(hap.Service.HumiditySensor);
    const carbon = accessory.getService(hap.Service.CarbonDioxideSensor);
    const light = accessory.getService(hap.Service.LightSensor);
    const battery = accessory.getService(hap.Service.Battery);
    return {
        radonShortBq: readNumber(air, eve_1.RADON_SHORT),
        radonLongBq: readNumber(air, eve_1.RADON_LONG),
        vocPpb: readNumber(air, eve_1.VOC_PPB),
        pm1Micrograms: readNumber(air, eve_1.PM1),
        mold: readNumber(air, eve_1.MOLD),
        soundDb: readNumber(air, eve_1.SOUND),
        pm25Micrograms: readNumber(air, hap.Characteristic.PM2_5Density),
        vocMicrograms: readNumber(air, hap.Characteristic.VOCDensity),
        pressureHpa: readNumber(temperature, eve_1.PRESSURE) ?? readNumber(air, eve_1.PRESSURE),
        temperatureC: readNumber(temperature, hap.Characteristic.CurrentTemperature),
        humidityPercent: readNumber(humidity, hap.Characteristic.CurrentRelativeHumidity),
        co2Ppm: readNumber(carbon, hap.Characteristic.CarbonDioxideLevel),
        lux: readNumber(light, hap.Characteristic.CurrentAmbientLightLevel),
        batteryPercent: readNumber(battery, hap.Characteristic.BatteryLevel),
    };
}
function readNumber(service, characteristic) {
    const lookup = characteristic;
    if (service === undefined || !service.testCharacteristic(lookup)) {
        return undefined;
    }
    const value = service.getCharacteristic(lookup)?.value;
    return typeof value === 'number' ? value : undefined;
}
