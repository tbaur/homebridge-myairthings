"use strict";
/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * @fileoverview The Home tile.
 *
 * When a monitor reports radon, the Good / Fair / Poor value is that radon reading.
 * CO₂, particles, and VOC stay on their own services.
 *
 * A monitor with no radon uses the worst of CO₂, PM2.5, and VOC.
 * Humidity stays on the humidity service.
 *
 * Bands are Airthings' published thresholds.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.airQuality = airQuality;
exports.qualityCause = qualityCause;
const RADON_FAIR_BQ = 100;
const RADON_POOR_BQ = 150;
const PM_FAIR = 10;
const PM_POOR = 25;
const VOC_FAIR_PPB = 250;
const VOC_POOR_PPB = 2000;
const CO2_FAIR_PPM = 800;
const CO2_POOR_PPM = 1000;
const RANK = {
    unknown: 0,
    good: 1,
    fair: 2,
    poor: 3,
};
function airQuality(plan, reading) {
    if (plan.radonShort || plan.radonLong) {
        const becquerels = reading.radonShortBq ?? reading.radonLongBq;
        return becquerels === undefined ? 'unknown' : band(becquerels, RADON_FAIR_BQ, RADON_POOR_BQ);
    }
    return worse([
        reading.co2Ppm === undefined ? undefined : band(reading.co2Ppm, CO2_FAIR_PPM, CO2_POOR_PPM),
        reading.pm25Micrograms === undefined ? undefined : band(reading.pm25Micrograms, PM_FAIR, PM_POOR),
        reading.vocPpb === undefined ? undefined : band(reading.vocPpb, VOC_FAIR_PPB, VOC_POOR_PPB),
    ]);
}
/** The reading that set the tile's level, for a log line: `radon 160 Bq/m³`. */
function qualityCause(plan, reading) {
    if (plan.radonShort || plan.radonLong) {
        const becquerels = reading.radonShortBq ?? reading.radonLongBq;
        return becquerels === undefined ? undefined : `radon ${Math.round(becquerels)} Bq/m³`;
    }
    const candidates = [];
    if (reading.co2Ppm !== undefined) {
        candidates.push({ level: band(reading.co2Ppm, CO2_FAIR_PPM, CO2_POOR_PPM), text: `CO2 ${Math.round(reading.co2Ppm)} ppm` });
    }
    if (reading.pm25Micrograms !== undefined) {
        candidates.push({ level: band(reading.pm25Micrograms, PM_FAIR, PM_POOR), text: `PM2.5 ${Math.round(reading.pm25Micrograms)} µg/m³` });
    }
    if (reading.vocPpb !== undefined) {
        candidates.push({ level: band(reading.vocPpb, VOC_FAIR_PPB, VOC_POOR_PPB), text: `VOC ${Math.round(reading.vocPpb)} ppb` });
    }
    let cause;
    for (const candidate of candidates) {
        if (cause === undefined || RANK[candidate.level] > RANK[cause.level]) {
            cause = candidate;
        }
    }
    return cause?.text;
}
function band(value, fairAt, poorAt) {
    if (value >= poorAt) {
        return 'poor';
    }
    if (value >= fairAt) {
        return 'fair';
    }
    return 'good';
}
function worse(levels) {
    let current = 'unknown';
    for (const level of levels) {
        if (level !== undefined && RANK[level] > RANK[current]) {
            current = level;
        }
    }
    return current;
}
