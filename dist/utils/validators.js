"use strict";
/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * @fileoverview Check platform config before any network call.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateConfig = validateConfig;
const settings_1 = require("../settings");
const CONTROL = /[\u0000-\u001F\u007F]/;
function validateConfig(input) {
    const config = isRecord(input) ? input : {};
    const errors = [];
    const warnings = [];
    const name = readName(config.name, warnings, errors);
    const clientId = credential(config.clientId, 'AIRTHINGS_CLIENT_ID');
    const clientSecret = credential(config.clientSecret, 'AIRTHINGS_CLIENT_SECRET');
    if (clientId === undefined && clientSecret === undefined) {
        return { status: 'notConfigured', errors, warnings };
    }
    if (clientId === undefined) {
        errors.push('clientId is missing');
    }
    if (clientSecret === undefined) {
        errors.push('clientSecret is missing');
    }
    if (clientId !== undefined) {
        rejectSecret(clientId, 'clientId', errors);
    }
    if (clientSecret !== undefined) {
        rejectSecret(clientSecret, 'clientSecret', errors);
    }
    const refreshIntervalSec = readRefresh(config.refreshInterval, warnings);
    const co2DetectedPpm = readCo2(config.co2DetectedThreshold, warnings);
    const debug = readDebug(config.debug, warnings);
    const diagnosticsIntervalSec = readDiagnostics(config.diagnosticsInterval, warnings);
    const pagerdutySignals = readFlag(config.pagerdutySignals, 'pagerdutySignals', warnings);
    if (errors.length > 0 || clientId === undefined || clientSecret === undefined) {
        return { status: 'invalid', errors, warnings };
    }
    const resolved = {
        name,
        clientId,
        clientSecret,
        refreshIntervalSec,
        co2DetectedPpm,
        debug,
        diagnosticsIntervalSec,
        pagerdutySignals,
    };
    return { status: 'ok', config: resolved, errors, warnings };
}
function readName(value, warnings, errors) {
    if (value === undefined || value === '') {
        return settings_1.DEFAULT_NAME;
    }
    if (typeof value !== 'string') {
        errors.push('name must be a string');
        return settings_1.DEFAULT_NAME;
    }
    const cleaned = value.replace(CONTROL, '').trim();
    if (cleaned.length > settings_1.MAX_NAME_LENGTH) {
        const shortened = cleaned.slice(0, settings_1.MAX_NAME_LENGTH);
        warnings.push(`platform name is longer than ${settings_1.MAX_NAME_LENGTH} characters and was shortened to "${shortened}"`);
        return shortened;
    }
    return cleaned.length > 0 ? cleaned : settings_1.DEFAULT_NAME;
}
function credential(value, envName) {
    const fromEnv = process.env[envName];
    if (typeof fromEnv === 'string' && fromEnv.trim().length > 0) {
        return fromEnv.trim();
    }
    if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
    }
    return undefined;
}
function rejectSecret(value, name, errors) {
    if (value.length > 256) {
        errors.push(`${name} is longer than 256 characters`);
    }
    if (CONTROL.test(value)) {
        errors.push(`${name} contains a control character`);
    }
}
function readRefresh(value, warnings) {
    return readBounded({ value, name: 'refreshInterval', fallback: settings_1.DEFAULT_REFRESH_SEC, min: settings_1.MIN_REFRESH_SEC, max: settings_1.MAX_REFRESH_SEC, warnings });
}
function readCo2(value, warnings) {
    return readBounded({
        value,
        name: 'co2DetectedThreshold',
        fallback: settings_1.DEFAULT_CO2_DETECTED_PPM,
        min: settings_1.MIN_CO2_DETECTED_PPM,
        max: settings_1.MAX_CO2_DETECTED_PPM,
        warnings,
    });
}
function readDiagnostics(value, warnings) {
    if (value === undefined || value === 0) {
        return 0;
    }
    if (typeof value === 'number' && (!Number.isInteger(value) || value < 0)) {
        warnings.push('diagnosticsInterval must be 0 or from 30 to 3600; using 0');
        return 0;
    }
    return readBounded({
        value,
        name: 'diagnosticsInterval',
        fallback: 0,
        min: settings_1.MIN_DIAGNOSTICS_INTERVAL_SEC,
        max: settings_1.MAX_DIAGNOSTICS_INTERVAL_SEC,
        warnings,
    });
}
function readBounded(input) {
    const { value, name, fallback, min, max, warnings } = input;
    if (value === undefined) {
        return fallback;
    }
    if (typeof value !== 'number' || !Number.isInteger(value)) {
        warnings.push(`${name} must be an integer; using ${fallback}`);
        return fallback;
    }
    if (value < min) {
        warnings.push(`${name} ${value} is below ${min}; using ${min}`);
        return min;
    }
    if (value > max) {
        warnings.push(`${name} ${value} is above ${max}; using ${max}`);
        return max;
    }
    return value;
}
function readDebug(value, warnings) {
    return readFlag(value, 'debug', warnings);
}
function readFlag(value, name, warnings) {
    if (value === undefined) {
        return false;
    }
    if (typeof value !== 'boolean') {
        warnings.push(`${name} must be true or false; using false`);
        return false;
    }
    return value;
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
