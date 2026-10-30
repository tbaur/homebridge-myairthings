/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * @fileoverview JSON over HTTPS to the Airthings consumer API.
 *
 * A response size cap, applied as bytes arrive.
 *
 * Separate connect and total deadlines.
 *
 * Nothing from this layer quotes a URL, a header, or a body. The request can
 * carry an access token, or the client secret in the token body.
 *
 * Redirects are not followed. Node's `https.request` does not follow them,
 * and a 3xx is returned as a status for the caller to reject.
 */
export interface HttpResponse {
    status: number;
    body: string;
    headers: Readonly<Record<string, string | string[] | undefined>>;
}
export interface JsonRequest {
    method: 'GET' | 'POST';
    url: string;
    body?: unknown;
    headers?: Readonly<Record<string, string>>;
    connectTimeoutMs: number;
    totalTimeoutMs: number;
    maxBytes: number;
    signal?: AbortSignal;
}
/** One JSON request. Injectable so tests never need the real Airthings hosts. */
export declare function requestJson(request: JsonRequest): Promise<HttpResponse>;
