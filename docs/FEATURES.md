# Features

**homebridge-myairthings**

A checklist of what is built. What a Home app user sees, including every log line, is in the [detailed documentation](README-DETAILED.md). The consumer API this plugin calls is in [API.md](API.md).

## Built

### Monitors

- ✅ One platform, `MyAirthings`, for the whole account. One client id and client secret. Every monitor on the account is discovered
- ✅ One accessory per monitor. The serial number is the identity, so a rename in Home keeps the room and the automations
- ✅ The Home name follows a rename in the Airthings app when Home still shows the previous API name
- ✅ The model label comes from the API `type` string. `VIEW_PLUS` is shown as View Plus
- ✅ Services come from that device's `sensors` array
- ✅ The category is Sensor. HomeKit has no air-quality category. Air Quality is the primary service, and the other services are linked to it
- ✅ View Plus and View Radon use the same tile. The word is radon when the device reports radon
- ✅ A monitor with no radon sensor uses the worst of CO₂, PM2.5, and VOC
- ✅ Apple Home shows temperature, humidity, carbon dioxide, PM2.5, VOC density, and light, and only when that monitor has the sensor. Battery appears once a sample includes a percentage, and then stays
- ✅ Eve shows radon in Bq/m³ (short and long), air pressure, and VOC in ppb
- ✅ PM1, mold risk, and sound are on the accessory for apps that list every characteristic. Eve has no characteristic for those three
- ✅ Humidity is its own service. It does not change the air-quality word
- ✅ Battery is added once a sample includes a percentage, and that fact is remembered on the cached accessory

### Reliability

- ✅ Default poll every 300 seconds. Below 60 becomes 60. Above 86400 becomes 86400
- ✅ The device list runs on the first poll and then every sixth successful poll
- ✅ A monitor is removed only when a device list succeeds and that serial is absent
- ✅ A sample older than three hours is inactive. The last numbers stay
- ✅ After three unreachable polls the sensors go inactive even if the last sample was fresh. The accessory is not removed. The next poll is still the normal interval
- ✅ The hourly budget of 120 requests, shared by every call, is respected. A 429 waits for the window Airthings reported. A fault inside the plugin waits the normal interval
- ✅ A bad config leaves cached monitors registered. They show No Response until the config is fixed
- ✅ One platform per Homebridge. A second My Airthings platform is disabled
- ✅ Optional diagnostics line. Off unless `diagnosticsInterval` is set
- ✅ Optional PagerDuty signals, off by default: `auth-failed`, `cloud-offline` after three unreachable polls, and `stale.<serial>` when the account answers and that monitor's sample is old. Needs Node 22.13 or later. See [PagerDuty](README-DETAILED.md#pagerduty)

### Quality

- ✅ Strict TypeScript, plus `noUncheckedIndexedAccess` and `noImplicitOverride`
- ✅ Jest suite. Statements, functions and lines are gated at 90%. Branches are gated at 75%
- ✅ A read-only smoke script, `scripts/smoke.js`, that runs one poll through the built plugin against a real account
- ✅ No analytics
- ✅ No runtime dependencies
- ✅ Homebridge UI settings form via `config.schema.json`
- ✅ Homebridge v2.0+ support
- ✅ Node.js 22.13 or later, 24, and 26

## Out of scope

- ❌ **The Airthings business API.** This plugin uses the consumer API
- ❌ **Changing a monitor from HomeKit.** The plugin reads. It does not write settings, names, or thresholds back to Airthings
- ❌ **Paging on the radon level, on low battery, or on a rate limit.** Radon is the tile. An automation on that tile is how to watch it. Low battery is the Battery service
- ❌ **A separate accessory per reading.** One monitor is one accessory

## Accessories

| Accessory | HomeKit |
| --- | --- |
| Each monitor | Category Sensor. Primary service Air Quality. Linked services for the sensors that device reports |

## API surface

What the plugin calls, and how a sample becomes a HomeKit value: [API.md](API.md).

## Architecture

See [DEVELOPMENT.md](../DEVELOPMENT.md) for the source layout, the invariants, and how to add a reading.
