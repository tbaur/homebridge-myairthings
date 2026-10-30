"use strict";
/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * @fileoverview The lines written once a device list has been applied.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.startupLines = startupLines;
const redact_1 = require("./redact");
const names_1 = require("./names");
function startupLines(input) {
    const lines = [
        `${input.name} ${input.version}`,
        `${input.monitors.length} monitor(s), refresh ${input.refreshIntervalSec}s`,
    ];
    if (input.created > 0) {
        lines.push(`created ${input.created}`);
    }
    if (input.removed > 0) {
        lines.push(`removed ${input.removed}`);
    }
    for (const monitor of input.monitors) {
        lines.push(`${(0, redact_1.forLog)((0, names_1.modelLabel)(monitor.type))} ${(0, redact_1.forLog)(monitor.serialNumber)} ${(0, redact_1.forLog)(monitor.name)}`);
    }
    return lines;
}
