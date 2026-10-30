/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * @fileoverview Consumer API client.
 *
 * One logical operation is a device list or a sensor page. The session, not
 * this class, decides whether an error is an outage.
 */
import type { HttpResponse, JsonRequest } from './http';
import type { ListedDevice, NormalizedReading, PluginLogger } from '../types';
export interface SampleBatch {
    readings: ReadonlyMap<string, NormalizedReading>;
    ignored: readonly string[];
}
/** What the session needs from the API. */
export interface CloudClient {
    blockedForMs(now: number): number;
    listDevices(): Promise<ListedDevice[]>;
    listSamples(accountIds: readonly string[]): Promise<SampleBatch>;
    abort(): void;
}
interface ClientOptions {
    clientId: string;
    clientSecret: string;
    transport?: (request: JsonRequest) => Promise<HttpResponse>;
    now?: () => number;
    log?: PluginLogger;
}
/** Talks to the consumer API. Holds the access token and the rate-limit clock. */
export declare class AirthingsClient implements CloudClient {
    private readonly options;
    private readonly transport;
    private readonly now;
    private token?;
    private notBefore;
    private abortController;
    constructor(options: ClientOptions);
    blockedForMs(now: number): number;
    abort(): void;
    listDevices(): Promise<ListedDevice[]>;
    listSamples(accountIds: readonly string[]): Promise<SampleBatch>;
    private sensorPages;
    private assertBudget;
    private authorized;
    private ensureToken;
    /**
     * The documented client-credentials body. Airthings answers an unknown
     * client or a wrong secret with 400, not 401, and this body is otherwise
     * fixed, so a 400 here is the credentials.
     */
    private requestToken;
    private call;
    private note;
    private interpret;
}
export {};
