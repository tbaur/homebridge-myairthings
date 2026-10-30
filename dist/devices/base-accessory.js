"use strict";
/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * @fileoverview What every monitor accessory shares.
 *
 * Unavailable means No Response. A cloud blip does not use that path: the
 * sensor stays up and StatusActive goes false, so the last reading remains.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseAccessory = void 0;
const settings_1 = require("../settings");
class BaseAccessory {
    host;
    accessory;
    displayName;
    unavailable;
    constructor(init) {
        this.host = init.host;
        this.accessory = init.accessory;
        this.displayName = init.displayName;
        this.unavailable = init.unavailable;
        this.configureInformation(init);
    }
    /** Refresh Accessory Information after a later poll renames the monitor. */
    updateIdentity(input) {
        this.displayName = input.displayName;
        this.configureInformation({
            host: this.host,
            accessory: this.accessory,
            displayName: input.displayName,
            model: input.model,
            serialNumber: input.serialNumber,
            unavailable: this.unavailable,
        });
    }
    requireAvailable() {
        if (this.unavailable) {
            throw new this.host.api.hap.HapStatusError(-70402 /* this.host.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE */);
        }
    }
    publish(service, characteristic, value) {
        const name = characteristic;
        const current = service.getCharacteristic(name);
        if (current === undefined || current.value === value) {
            return;
        }
        service.updateCharacteristic(name, value);
    }
    configureInformation(init) {
        const { Characteristic, Service: HapService } = this.host.hap;
        const service = this.accessory.getService(HapService.AccessoryInformation)
            ?? this.accessory.addService(HapService.AccessoryInformation);
        service
            .setCharacteristic(Characteristic.Manufacturer, settings_1.MANUFACTURER)
            .setCharacteristic(Characteristic.Model, init.model)
            .setCharacteristic(Characteristic.SerialNumber, init.serialNumber)
            .setCharacteristic(Characteristic.FirmwareRevision, this.host.pluginVersion)
            .setCharacteristic(Characteristic.Name, this.displayName);
    }
}
exports.BaseAccessory = BaseAccessory;
