"use strict";
/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * @fileoverview The platform. It owns which accessories exist, and nothing else.
 *
 * A monitor's identity is its serial number. Adopting a cached accessory keeps
 * the room and the automations. A bad config leaves those accessories
 * registered and answering No Response. A failed poll does not remove one.
 * A monitor is removed only after a device list that succeeded and omitted it.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AirthingsPlatform = void 0;
const client_1 = require("./api/client");
const airthings_signals_1 = require("./airthings-signals");
const collector_1 = require("./diagnostics/collector");
const format_1 = require("./diagnostics/format");
const monitor_1 = require("./devices/monitor");
const session_1 = require("./session");
const settings_1 = require("./settings");
const context_1 = require("./utils/context");
const sample_1 = require("./readings/sample");
const errors_1 = require("./utils/errors");
const names_1 = require("./utils/names");
const redact_1 = require("./utils/redact");
const startup_report_1 = require("./utils/startup-report");
const validators_1 = require("./utils/validators");
const running = new WeakSet();
/** Homebridge's dynamic platform for an Airthings account. */
class AirthingsPlatform {
    api;
    log;
    pluginVersion;
    restored = new Map();
    handlers = new Map();
    diagnostics = new collector_1.DiagnosticsCollector();
    config;
    session;
    timer;
    diagnosticsTimer;
    signals;
    pagerDutyLogged = false;
    /** The last completed poll was a rejected client. */
    authFailed = false;
    cloudOffline = false;
    launched = false;
    stopped = false;
    announced = false;
    cyclePromise = Promise.resolve();
    constructor(log, platformConfig, api) {
        this.log = log;
        this.api = api;
        this.pluginVersion = (0, settings_1.readPluginVersion)(log);
        if (running.has(api)) {
            const blockName = configuredBlockName(platformConfig);
            this.log.error(`platform name "${(0, redact_1.forLog)(blockName)}" is disabled. Another ${settings_1.PLATFORM_NAME} block is already running`);
            api.on('didFinishLaunching', () => this.keepRestoredUnavailable());
            return;
        }
        running.add(api);
        const result = (0, validators_1.validateConfig)(platformConfig);
        for (const warning of result.warnings) {
            this.log.warn(warning);
        }
        if (result.status !== 'ok' || result.config === undefined) {
            if (result.status === 'notConfigured') {
                for (const error of result.errors) {
                    this.log.error(error);
                }
                this.log.info(`no client credentials set; ${settings_1.DEFAULT_NAME} is not started`);
            }
            else {
                for (const error of result.errors) {
                    this.log.error(error);
                }
                this.log.error('platform disabled; cached accessories kept');
            }
            api.on('didFinishLaunching', () => this.keepRestoredUnavailable());
            return;
        }
        this.config = result.config;
        if (result.config.pagerdutySignals) {
            this.signals = (0, airthings_signals_1.createAirthingsSignals)({
                plugin: settings_1.PLUGIN_NAME,
                storagePath: this.api.user.storagePath(),
                log: this.log,
            });
        }
        api.on('didFinishLaunching', () => {
            if (this.launched) {
                return;
            }
            this.launched = true;
            this.attachRestored();
            this.logPagerDuty();
            this.cyclePromise = this.cycle();
            this.startDiagnostics();
        });
        api.on('shutdown', () => {
            this.stop();
        });
    }
    get hap() {
        return this.api.hap;
    }
    get co2DetectedPpm() {
        return this.config?.co2DetectedPpm ?? settings_1.DEFAULT_CO2_DETECTED_PPM;
    }
    /** Resolves when the current poll has finished. */
    settled() {
        return this.cyclePromise;
    }
    configureAccessory(accessory) {
        this.restored.set(accessory.UUID, accessory);
    }
    /** Handlers for accessories Homebridge restored, so an outage can mark them inactive before the next good poll. */
    attachRestored() {
        for (const accessory of this.restored.values()) {
            if (this.handlers.has(accessory.UUID)) {
                continue;
            }
            const context = (0, context_1.parseAccessoryContext)(accessory.context);
            if (context === undefined) {
                continue;
            }
            const handler = new monitor_1.MonitorAccessory({
                host: this,
                accessory,
                displayName: accessory.displayName,
                model: (0, names_1.modelLabel)(context.deviceType),
                serialNumber: context.serialNumber,
                unavailable: false,
            });
            const recordedAt = context.recordedAt;
            handler.sync({
                sensors: context.sensors,
                battery: context.reportsBattery,
                reading: {
                    active: (0, sample_1.isFresh)(recordedAt, Date.now()),
                    recordedAt,
                    ...(0, monitor_1.readingFromAccessory)(accessory, this.hap),
                },
            });
            this.handlers.set(accessory.UUID, handler);
        }
    }
    noteSampleExpired(serialNumber) {
        if (this.stopped || this.authFailed || this.cloudOffline) {
            return;
        }
        this.signals?.expire(serialNumber);
    }
    async cycle() {
        if (this.stopped || this.config === undefined) {
            return;
        }
        this.session ??= new session_1.CloudSession({
            client: new client_1.AirthingsClient({
                clientId: this.config.clientId,
                clientSecret: this.config.clientSecret,
                log: this.log,
            }),
            log: this.log,
            intervalMs: this.config.refreshIntervalSec * 1000,
        });
        const started = Date.now();
        // A fault in this plugin is not a reason to poll faster than configured.
        let waitMs = this.config.refreshIntervalSec * 1000;
        try {
            const outcome = await this.session.poll();
            this.diagnostics.apiRequest(Date.now() - started, outcome.countAs);
            waitMs = outcome.waitMs;
            if (this.stopped) {
                return;
            }
            this.applyOutcome(outcome);
        }
        catch (error) {
            this.log.error(`poll failed: ${(0, errors_1.describeError)(error)}`);
            this.markStale('poll failed');
        }
        this.schedule(waitMs);
    }
    applyOutcome(outcome) {
        if (outcome.reportSignals) {
            this.authFailed = outcome.authFailed;
            this.cloudOffline = outcome.cloudOffline;
        }
        if (outcome.view !== undefined) {
            this.applyView(outcome.view);
        }
        this.noteSignals(outcome);
        if (outcome.unreachable) {
            this.markStale();
        }
    }
    noteSignals(outcome) {
        if (this.signals === undefined) {
            return;
        }
        // A rate-limit wait, or an error we do not classify, leaves the last rows
        // alone. Writing "clear" there would resolve a real page.
        if (!outcome.reportSignals) {
            return;
        }
        this.signals.record({
            authFailed: outcome.authFailed,
            cloudOffline: outcome.cloudOffline,
            monitors: outcome.view?.monitors.map((monitor) => ({
                serialNumber: monitor.serialNumber,
                name: monitor.name,
                fresh: monitor.reading.active,
            })),
            deviceListFresh: outcome.view?.deviceListFresh ?? false,
        });
    }
    logPagerDuty() {
        if (this.signals === undefined || this.pagerDutyLogged) {
            return;
        }
        this.pagerDutyLogged = true;
        this.log.info(airthings_signals_1.PAGERDUTY_STARTUP_LOG);
    }
    applyView(view) {
        const wanted = new Map(view.monitors.map((monitor) => [this.uuid(monitor.serialNumber), monitor]));
        const listed = new Set(view.listedSerials.map((serial) => this.uuid(serial)));
        const removed = view.deviceListFresh ? this.removeMissing(listed) : 0;
        const created = [];
        for (const [uuid, snapshot] of wanted) {
            const existing = this.restored.get(uuid);
            const accessory = existing ?? this.createAccessory(snapshot, uuid);
            if (existing === undefined) {
                created.push(accessory);
            }
            this.adopt(accessory, snapshot);
        }
        if (created.length > 0) {
            this.api.registerPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, created);
        }
        this.report(view.monitors, created.length, removed);
        this.logReadings(view.monitors);
    }
    createAccessory(snapshot, uuid) {
        const name = (0, names_1.homeKitName)(snapshot.name, snapshot.serialNumber);
        return new this.api.platformAccessory(name, uuid, 10 /* this.api.hap.Categories.SENSOR */);
    }
    adopt(accessory, snapshot) {
        const previous = (0, context_1.parseAccessoryContext)(accessory.context);
        const apiName = (0, names_1.homeKitName)(snapshot.name, snapshot.serialNumber);
        const display = (0, names_1.homeKitName)((0, context_1.resolvedDisplayName)(accessory.displayName, previous?.apiName, apiName), snapshot.serialNumber);
        if (accessory.displayName !== display) {
            accessory.updateDisplayName(display);
        }
        accessory.category = 10 /* this.api.hap.Categories.SENSOR */;
        const existing = this.handlers.get(accessory.UUID);
        if (!snapshot.samplePresent && existing !== undefined) {
            existing.updateIdentity({
                displayName: accessory.displayName,
                model: (0, names_1.modelLabel)(snapshot.type),
                serialNumber: snapshot.serialNumber,
            });
            existing.markStale('no sample from Airthings');
            return;
        }
        const battery = previous?.reportsBattery === true || snapshot.reading.batteryPercent !== undefined;
        (0, context_1.writeContext)(accessory, { ...snapshot, name: apiName }, battery);
        this.restored.set(accessory.UUID, accessory);
        const handler = existing ?? new monitor_1.MonitorAccessory({
            host: this,
            accessory,
            displayName: accessory.displayName,
            model: (0, names_1.modelLabel)(snapshot.type),
            serialNumber: snapshot.serialNumber,
            unavailable: false,
        });
        handler.updateIdentity({
            displayName: accessory.displayName,
            model: (0, names_1.modelLabel)(snapshot.type),
            serialNumber: snapshot.serialNumber,
        });
        handler.sync({ sensors: snapshot.sensors, battery, reading: snapshot.reading });
        this.handlers.set(accessory.UUID, handler);
    }
    removeMissing(keep) {
        const stale = [];
        for (const [uuid, accessory] of this.restored) {
            if (keep.has(uuid)) {
                continue;
            }
            this.log.info(`removing ${(0, redact_1.forLog)(accessory.displayName)}`);
            stale.push(accessory);
            this.handlers.get(uuid)?.release();
            this.restored.delete(uuid);
            this.handlers.delete(uuid);
        }
        if (stale.length > 0) {
            this.api.unregisterPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, stale);
        }
        return stale.length;
    }
    report(monitors, created, removed) {
        if (this.announced && created === 0 && removed === 0) {
            return;
        }
        this.announced = true;
        const lines = (0, startup_report_1.startupLines)({
            version: this.pluginVersion,
            name: this.config?.name ?? settings_1.DEFAULT_NAME,
            monitors,
            refreshIntervalSec: this.config?.refreshIntervalSec ?? 0,
            created,
            removed,
        });
        for (const line of lines) {
            this.log.info(line);
        }
    }
    /** Info, not debug: the setting is the opt-in, and Homebridge hides debug lines unless it runs with -D. */
    logReadings(monitors) {
        if (this.config?.debug !== true) {
            return;
        }
        for (const monitor of monitors) {
            const reading = monitor.reading;
            this.log.info(`${(0, redact_1.forLog)(monitor.serialNumber)} radon=${reading.radonShortBq ?? '-'} `
                + `co2=${reading.co2Ppm ?? '-'} temp=${reading.temperatureC ?? '-'} `
                + `recordedAt=${reading.recordedAt ?? '-'}`);
        }
    }
    keepRestoredUnavailable() {
        for (const accessory of this.restored.values()) {
            const context = (0, context_1.parseAccessoryContext)(accessory.context);
            new monitor_1.MonitorAccessory({
                host: this,
                accessory,
                displayName: accessory.displayName,
                model: (0, names_1.modelLabel)(context?.deviceType ?? ''),
                serialNumber: context?.serialNumber ?? accessory.UUID,
                unavailable: true,
            });
        }
        if (this.restored.size > 0) {
            this.log.warn(`${this.restored.size} cached accessory(ies) inactive`);
        }
    }
    markStale(reason = 'three unreachable polls') {
        for (const handler of this.handlers.values()) {
            handler.markStale(reason);
        }
    }
    schedule(waitMs) {
        if (this.stopped) {
            return;
        }
        if (this.timer !== undefined) {
            clearTimeout(this.timer);
        }
        this.timer = setTimeout(() => {
            this.cyclePromise = this.cycle();
        }, waitMs);
        this.timer.unref();
    }
    startDiagnostics() {
        const seconds = this.config?.diagnosticsIntervalSec ?? 0;
        if (seconds <= 0) {
            return;
        }
        this.log.info(this.diagnosticsLine('diagnostics.start'));
        this.diagnosticsTimer = setInterval(() => {
            this.log.info(this.diagnosticsLine('health'));
        }, seconds * 1000);
        this.diagnosticsTimer.unref();
    }
    diagnosticsLine(msg) {
        let online = 0;
        for (const handler of this.handlers.values()) {
            if (handler.isLive()) {
                online += 1;
            }
        }
        return this.diagnostics.line({
            msg,
            devicesOnline: online,
            devicesTotal: this.handlers.size,
            restState: this.restState(),
        });
    }
    restState() {
        return (0, format_1.resolveRestTransportState)({
            stopped: this.stopped,
            authFailed: this.authFailed,
            pollingArmed: this.timer !== undefined,
        });
    }
    stop() {
        this.stopped = true;
        this.session?.abort();
        if (this.timer !== undefined) {
            clearTimeout(this.timer);
        }
        for (const handler of this.handlers.values()) {
            handler.release();
        }
        if (this.diagnosticsTimer !== undefined) {
            this.log.info(this.diagnosticsLine('diagnostics.stop'));
            clearInterval(this.diagnosticsTimer);
        }
        this.signals?.close();
    }
    uuid(serialNumber) {
        return this.api.hap.uuid.generate(`${settings_1.UUID_PREFIX}${serialNumber}`);
    }
}
exports.AirthingsPlatform = AirthingsPlatform;
function configuredBlockName(config) {
    const name = config.name;
    if (typeof name === 'string' && name.trim().length > 0) {
        return name.trim();
    }
    return settings_1.DEFAULT_NAME;
}
