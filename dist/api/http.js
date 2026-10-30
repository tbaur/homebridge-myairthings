"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestJson = requestJson;
const node_https_1 = __importDefault(require("node:https"));
const errors_1 = require("../utils/errors");
/** One JSON request. Injectable so tests never need the real Airthings hosts. */
function requestJson(request) {
    const payload = request.body === undefined ? undefined : JSON.stringify(request.body);
    return new Promise((resolve, reject) => {
        if (request.signal?.aborted === true) {
            reject(new errors_1.AbortedError());
            return;
        }
        const pending = { settled: false };
        const req = node_https_1.default.request(request.url, {
            method: request.method,
            agent: false,
            headers: requestHeaders(request, payload),
        }, (response) => {
            readBody({ response, maxBytes: request.maxBytes, pending, resolve, reject, req });
        });
        arm(req, request, pending, reject);
        req.end(payload);
    });
}
function requestHeaders(request, payload) {
    const headers = {
        accept: 'application/json',
        ...request.headers,
    };
    if (payload !== undefined) {
        headers['content-type'] = 'application/json';
        headers['content-length'] = String(Buffer.byteLength(payload));
    }
    return headers;
}
function readBody(input) {
    const { response, maxBytes, pending, resolve, reject, req } = input;
    const chunks = [];
    let received = 0;
    response.on('data', (chunk) => {
        received += chunk.length;
        if (received > maxBytes) {
            fail(pending, reject, req, new errors_1.ProtocolError(`response exceeds ${maxBytes} bytes`));
            return;
        }
        chunks.push(chunk);
    });
    response.on('end', () => {
        finish(pending, resolve, {
            status: response.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
            headers: response.headers,
        });
    });
    response.on('error', (error) => {
        fail(pending, reject, req, new errors_1.ConnectionError('response stream failed', { cause: error }));
    });
}
function arm(req, request, pending, reject) {
    pending.connect = setTimeout(() => {
        fail(pending, reject, req, new errors_1.ConnectionError(`connect timed out after ${request.connectTimeoutMs}ms`));
    }, request.connectTimeoutMs);
    pending.connect.unref();
    req.on('socket', (socket) => {
        const ready = () => {
            if (pending.connect !== undefined) {
                clearTimeout(pending.connect);
                pending.connect = undefined;
            }
            socket.setNoDelay(true);
        };
        if (socket.connecting) {
            const event = 'encrypted' in socket ? 'secureConnect' : 'connect';
            socket.once(event, ready);
        }
        else {
            ready();
        }
    });
    req.on('error', (error) => {
        fail(pending, reject, req, new errors_1.ConnectionError('request failed', { cause: error }));
    });
    pending.total = setTimeout(() => {
        fail(pending, reject, req, new errors_1.ConnectionError(`request timed out after ${request.totalTimeoutMs}ms`));
    }, request.totalTimeoutMs);
    pending.total.unref();
    if (request.signal !== undefined) {
        pending.signal = request.signal;
        pending.onAbort = () => {
            fail(pending, reject, req, new errors_1.AbortedError());
        };
        request.signal.addEventListener('abort', pending.onAbort, { once: true });
    }
}
function finish(pending, resolve, response) {
    if (pending.settled) {
        return;
    }
    pending.settled = true;
    cleanup(pending);
    resolve(response);
}
function fail(pending, reject, req, error) {
    if (pending.settled) {
        return;
    }
    pending.settled = true;
    cleanup(pending);
    req.destroy();
    reject(error);
}
function cleanup(pending) {
    if (pending.connect !== undefined) {
        clearTimeout(pending.connect);
    }
    if (pending.total !== undefined) {
        clearTimeout(pending.total);
    }
    if (pending.onAbort !== undefined) {
        pending.signal?.removeEventListener('abort', pending.onAbort);
        pending.onAbort = undefined;
    }
}
