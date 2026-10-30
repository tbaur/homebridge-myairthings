/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * @fileoverview Names HomeKit will accept, and a model label from the API's device type.
 */
export declare function homeKitName(value: string, fallback: string): string;
/** `VIEW_PLUS` becomes `View Plus`, from the device `type` string. */
export declare function modelLabel(type: string): string;
