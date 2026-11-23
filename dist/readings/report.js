"use strict";
/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * @fileoverview The log lines a poll writes about each monitor.
 *
 * A monitor gets a summary line for its first sample and for each new sample
 * where a reading moved at least its step (0.5 °C, 50 ppm CO₂, and so on) from
 * the value last logged, and a short line when the air
 * quality level or the CO₂ alert changes, when the battery falls another five
 * points (two below 20%) or crosses the low level, or when its samples fall behind. A sample with the same readings, or a poll that
 * returns the same sample again, writes nothing.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReadingReporter = exports.LOW_BATTERY_PERCENT = void 0;
exports.formatAgo = formatAgo;
exports.formatDuration = formatDuration;
const redact_1 = require("../utils/redact");
const quality_1 = require("./quality");
/** Battery level HomeKit reports as low. */
exports.LOW_BATTERY_PERCENT = 10;
/** A battery line is written each time the level falls this far below the last one logged. */
const BATTERY_STEP_PERCENT = 5;
/** Below this level the step shrinks, so a battery near empty is logged more often. */
const BATTERY_NEAR_EMPTY_PERCENT = 20;
const BATTERY_NEAR_EMPTY_STEP_PERCENT = 2;
/** A sample counts as late only once it is at least this old. */
const MIN_LATE_MS = 15 * 60_000;
const FIELDS = [
    { label: 'Radon', key: 'radonShortBq', format: (v) => `${Math.round(v)}`, unit: ' Bq/m³', step: () => 10 },
    { label: 'Radon long', key: 'radonLongBq', format: (v) => `${Math.round(v)}`, unit: ' Bq/m³', step: () => 10 },
    { label: 'CO2', key: 'co2Ppm', format: (v) => `${Math.round(v)}`, unit: ' ppm', step: () => 50 },
    { label: 'VOC', key: 'vocPpb', format: (v) => `${Math.round(v)}`, unit: ' ppb', step: () => 50 },
    { label: 'PM2.5', key: 'pm25Micrograms', format: (v) => `${Math.round(v)}`, unit: ' µg/m³', step: () => 10 },
    { label: 'PM1', key: 'pm1Micrograms', format: (v) => `${Math.round(v)}`, unit: ' µg/m³', step: () => 10 },
    { label: '', key: 'temperatureC', format: (v) => v.toFixed(1), unit: '°C', step: () => 0.5 },
    { label: '', key: 'humidityPercent', format: (v) => `${Math.round(v)}`, unit: '%', step: () => 3 },
    { label: '', key: 'pressureHpa', format: (v) => `${Math.round(v)}`, unit: ' hPa', step: () => 5 },
    // Light swings by orders of magnitude, so its step grows with the level.
    { label: 'Light', key: 'lux', format: (v) => `${Math.round(v)}`, unit: ' lx', step: (v) => Math.max(100, Math.abs(v) / 2) },
    { label: 'Sound', key: 'soundDb', format: (v) => `${Math.round(v)}`, unit: ' dB', step: () => 5 },
    { label: 'Mold', key: 'mold', format: (v) => `${Math.round(v)}`, unit: '', step: () => 1 },
];
/** Remembers each monitor's last sample so only changes reach the log. */
class ReadingReporter {
    memory = new Map();
    observe(input) {
        const { reading, now } = input;
        const recordedAt = reading.recordedAt;
        const previous = this.memory.get(input.serialNumber);
        const name = (0, redact_1.forLog)(input.name);
        if (previous === undefined && recordedAt === undefined) {
            return { lines: [], sample: 'none' };
        }
        if (previous !== undefined && (recordedAt === undefined || recordedAt <= previous.recordedAt)) {
            return { lines: this.lateLines(name, previous, input), sample: 'unchanged' };
        }
        if (recordedAt === undefined) {
            return { lines: [], sample: 'none' };
        }
        const lines = [];
        const gapMs = previous === undefined ? undefined : recordedAt - previous.recordedAt;
        const resumed = previous?.lateLogged === true && gapMs !== undefined && gapMs >= 60_000;
        if (resumed) {
            lines.push(`${name}: new sample after ${formatDuration(gapMs)}`);
        }
        let logged = previous?.logged;
        if (logged === undefined || resumed || valuesMoved(logged, reading)) {
            lines.push(`${name}: ${summary(logged, reading, input.plan, now)}`);
            logged = nextLogged(logged, reading);
        }
        // A sample without the readings that set the tile does not count as a
        // level change; the last known level stays the one to compare against.
        const measured = (0, quality_1.airQuality)(input.plan, reading);
        const quality = measured === 'unknown' ? previous?.quality ?? 'unknown' : measured;
        if (previous !== undefined && measured !== 'unknown' && measured !== previous.quality) {
            const cause = (0, quality_1.qualityCause)(input.plan, reading, previous.reading);
            lines.push(`${name}: Air ${previous.quality} → ${measured}${cause === undefined ? '' : ` (${cause})`}`);
        }
        let co2High = previous?.co2High ?? false;
        if (reading.co2Ppm !== undefined) {
            const isHigh = reading.co2Ppm >= input.co2AlertPpm;
            if (isHigh !== co2High) {
                const ppm = Math.round(reading.co2Ppm);
                lines.push(isHigh
                    ? `${name}: CO2 at or above ${input.co2AlertPpm} ppm (${ppm})`
                    : `${name}: CO2 back below ${input.co2AlertPpm} ppm (${ppm})`);
            }
            co2High = isHigh;
        }
        let batteryLow = previous?.batteryLow ?? false;
        let batteryMark = previous?.batteryMark;
        if (reading.batteryPercent !== undefined) {
            const percent = Math.round(reading.batteryPercent);
            const isLow = percent <= exports.LOW_BATTERY_PERCENT;
            const step = percent < BATTERY_NEAR_EMPTY_PERCENT ? BATTERY_NEAR_EMPTY_STEP_PERCENT : BATTERY_STEP_PERCENT;
            const dropped = batteryMark !== undefined && percent <= batteryMark - step;
            if (isLow !== batteryLow) {
                lines.push(isLow ? `${name}: battery low (${percent}%)` : `${name}: battery ok (${percent}%)`);
            }
            else if (dropped) {
                lines.push(`${name}: battery ${batteryMark} → ${percent}%`);
            }
            // The mark moves up with a rise (new batteries, or a reading that wobbles
            // by a point) and down only when a drop is logged.
            if (batteryMark === undefined || percent > batteryMark || dropped || isLow !== batteryLow) {
                batteryMark = percent;
            }
            batteryLow = isLow;
        }
        this.memory.set(input.serialNumber, {
            recordedAt,
            reading,
            logged,
            quality,
            // A gap that ended a late stretch is not the monitor's normal cadence,
            // unless it is the only gap seen so far.
            sampleGapMs: previous?.lateLogged === true && previous.sampleGapMs !== undefined ? previous.sampleGapMs : gapMs,
            co2High,
            batteryLow,
            batteryMark,
            lateLogged: false,
        });
        return { lines, sample: 'new' };
    }
    /** Forget a monitor that left the account. */
    forget(serialNumber) {
        this.memory.delete(serialNumber);
    }
    lateLines(name, memory, input) {
        if (memory.lateLogged) {
            return [];
        }
        const age = input.now - memory.recordedAt;
        const expected = Math.max(memory.sampleGapMs ?? 0, input.pollIntervalMs);
        if (age < Math.max(2 * expected, MIN_LATE_MS)) {
            return [];
        }
        memory.lateLogged = true;
        return [`${name}: sample is ${formatDuration(age)} old`];
    }
}
exports.ReadingReporter = ReadingReporter;
/** True when a reading moved at least its step from the value last logged. Battery has its own lines. */
function moved(field, logged, reading) {
    const before = logged[field.key];
    const after = reading[field.key];
    if (before === undefined || after === undefined) {
        return before !== after;
    }
    return Math.abs(after - before) >= field.step(before);
}
function valuesMoved(logged, reading) {
    return FIELDS.some((field) => moved(field, logged, reading));
}
/** The new baseline: readings that moved take the new value, the rest keep the one last logged. */
function nextLogged(logged, reading) {
    if (logged === undefined) {
        return reading;
    }
    const next = { ...reading };
    for (const field of FIELDS) {
        if (!moved(field, logged, reading)) {
            next[field.key] = logged[field.key];
        }
    }
    return next;
}
function summary(logged, reading, plan, now) {
    const parts = [];
    for (const field of FIELDS) {
        const value = reading[field.key];
        if (value === undefined) {
            continue;
        }
        const text = field.format(value);
        const before = logged?.[field.key];
        const beforeText = before === undefined ? undefined : field.format(before);
        const shown = logged !== undefined && before !== undefined && beforeText !== text && moved(field, logged, reading)
            ? `${beforeText} → ${text}${field.unit}`
            : `${text}${field.unit}`;
        parts.push(field.label === '' ? shown : `${field.label} ${shown}`);
    }
    const quality = (0, quality_1.airQuality)(plan, reading);
    if (quality !== 'unknown') {
        parts.push(`Air ${quality}`);
    }
    if (reading.batteryPercent !== undefined) {
        parts.push(`Battery ${Math.round(reading.batteryPercent)}%`);
    }
    if (reading.recordedAt !== undefined) {
        parts.push(`sampled ${formatAgo(now - reading.recordedAt)}`);
    }
    return parts.length > 0 ? parts.join(', ') : 'no readings';
}
/** `just now`, `4 min ago`, `1 h 25 min ago`. A timestamp ahead of this clock reads `just now`. */
function formatAgo(ms) {
    return ms < 60_000 ? 'just now' : `${formatDuration(ms)} ago`;
}
/** `4 min`, `1 h`, `1 h 25 min`. */
function formatDuration(ms) {
    const minutes = Math.max(0, Math.floor(ms / 60_000));
    if (minutes < 60) {
        return `${minutes} min`;
    }
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
