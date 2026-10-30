# homebridge-myairthings

[![Tests](https://github.com/tbaur/homebridge-myairthings/actions/workflows/test.yml/badge.svg)](https://github.com/tbaur/homebridge-myairthings/actions/workflows/test.yml)
[![npm version](https://img.shields.io/npm/v/homebridge-myairthings?style=flat-square)](https://www.npmjs.com/package/homebridge-myairthings)
[![npm downloads](https://img.shields.io/npm/dt/homebridge-myairthings?label=downloads&style=flat-square)](https://www.npmjs.com/package/homebridge-myairthings)
[![Node.js](https://img.shields.io/badge/node-22.13%20%7C%7C%2024%20%7C%7C%2026-green)](https://nodejs.org)
[![Homebridge](https://img.shields.io/badge/homebridge-2.x-purple)](https://homebridge.io)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

**Airthings monitors in Apple Home, with the rest of the readings in Eve.** One client, one platform. Every monitor on the account becomes one air-quality accessory. When a radon value is present, the tile says Good, Fair, or Poor from that radon. A missing radon value stays Unknown until a sample includes it.

## Features

- **One accessory per monitor.** The serial number is the identity, so a rename keeps the room and the automations.
- **The same tile for View Plus and View Radon.** Radon sets the air-quality value. CO₂, particles, and VOC are their own rows.
- **Apple Home shows what it understands.** Temperature, humidity, carbon dioxide, PM2.5, VOC density, and light, and only when that monitor has the sensor. Battery appears once a sample includes a percentage, and then stays.
- **Eve shows the rest.** Radon in Bq/m³ (short and long), air pressure, and VOC in ppb. PM1, mold risk, and sound are on the accessory for apps that list every characteristic. Eve has no characteristic for those three.
- **The sensor list comes from each device.** The account's device list includes the readings that monitor can produce, and the accessory is built from that list.
- **It keeps polling when Airthings stops answering.** After three polls that cannot reach Airthings, the sensors go inactive and keep the last numbers. The next poll is still the normal interval.
- **PagerDuty** *(optional, off by default):* page when Airthings rejects the client (`auth-failed`), when Homebridge has not reached Airthings for three polls (`cloud-offline`), or when one monitor's reading is stale while the account answers (`stale.<serial>`). Needs Node 22.13 or later. See [PagerDuty](docs/README-DETAILED.md#pagerduty)
- **No analytics and no runtime dependencies.** The only network destination is Airthings.

The [detailed documentation](docs/README-DETAILED.md) describes every service and setting. The consumer API is summarised in [docs/API.md](docs/API.md).

## Quick Start

### 1. Install

**Homebridge UI** (recommended): Plugins → Search `homebridge-myairthings` → Install

```bash
npm install -g homebridge-myairthings
```

### 2. Create an API client

Sign in at the [Airthings consumer dashboard](https://consumer-api-doc.airthings.com/dashboard) and create a client. Copy the client id and the client secret.

### 3. Configure

**Homebridge UI** (recommended): open the plugin settings and enter the client id and client secret.

Or in `config.json`:

```json
{
  "platforms": [
    {
      "platform": "MyAirthings",
      "name": "My Airthings",
      "clientId": "00000000-0000-0000-0000-000000000001",
      "clientSecret": "00000000-0000-0000-0000-000000000002"
    }
  ]
}
```

`AIRTHINGS_CLIENT_ID` and `AIRTHINGS_CLIENT_SECRET` override the values in `config.json` when they are set. The [configuration reference](docs/README-DETAILED.md#full-configuration-reference) lists every option.

### 4. Restart Homebridge

Each monitor appears in the Home app after the first poll. A View Plus shows carbon dioxide, PM2.5, and VOC along with radon. A View Radon shows temperature, humidity, and radon. Both tiles follow radon.

## What the tile means

Airthings publishes three bands for radon: under 100 Bq/m³ is good, 100 up to 150 is fair, 150 and above is poor. That is the word on the tile. Humidity is its own reading.

A monitor with no radon sensor, such as a Wave Mini, uses the worst of the pollutants it does have.

## Not Working?

1. **`no client credentials set; My Airthings is not started`.** Add the client id and client secret in the plugin settings, or set `AIRTHINGS_CLIENT_ID` and `AIRTHINGS_CLIENT_SECRET`, and restart Homebridge.
2. **`platform disabled; cached accessories kept`.** The configuration could not be used. The lines above that one say why. Cached monitors stay in their rooms and show No Response until the config is fixed.
3. **`Airthings rejected the client credentials`.** The client id or secret was refused. Create a new client in the Airthings dashboard if the secret was rotated, then restart.
4. **`Airthings is unreachable`.** The plugin could not reach Airthings. It keeps polling at the interval. After three of those polls the sensors go inactive and keep the last numbers.
5. **`Airthings rate limit reached`.** The hourly budget was spent. The plugin waits and continues on its own.

The [full troubleshooting list](docs/README-DETAILED.md#troubleshooting) covers stale readings, a monitor that left the account, and paging.

## Security

The client id and client secret are stored in the Homebridge configuration file, like every Homebridge credential. Anyone who can read that file can read the monitors on the account. The plugin sends the secret only to Airthings, and never writes it to the log. [SECURITY.md](SECURITY.md) has the detail.

## Requirements

- Homebridge 2.x
- Node.js 22.13 or later on 22, or Node.js 24 or 26
- An Airthings account with a consumer API client
- A working internet connection

## More Info

- [Detailed documentation](docs/README-DETAILED.md)
- [Features](docs/FEATURES.md)
- [Consumer API reference](docs/API.md)
- [Development](DEVELOPMENT.md)
- [Report Issues](https://github.com/tbaur/homebridge-myairthings/issues)
- [Changelog](CHANGELOG.md)

## Trademarks

homebridge-myairthings is an independent project. It is not affiliated with or endorsed by Airthings or Eve Systems. Airthings is a trademark of Airthings AS. Eve is a trademark of Eve Systems GmbH.

## License

Copyright 2026 tbaur

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) file for details.
