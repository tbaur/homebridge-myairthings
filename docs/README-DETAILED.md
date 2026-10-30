# Detailed documentation

The [README](../README.md) covers installation and setup. This page covers everything else.

## Table of Contents

- [Full configuration reference](#full-configuration-reference)
- [Services](#services)
- [Stale readings](#stale-readings)
- [Removal](#removal)
- [Logs](#logs)
- [PagerDuty](#pagerduty)
- [Troubleshooting](#troubleshooting)

## Full configuration reference

| Field | Default | Meaning |
| --- | --- | --- |
| name | My Airthings | Shown in the Homebridge log. |
| clientId | | From an API client on the Airthings consumer dashboard. `AIRTHINGS_CLIENT_ID` overrides this. |
| clientSecret | | From an API client on the Airthings consumer dashboard. `AIRTHINGS_CLIENT_SECRET` overrides this. |
| refreshInterval | 300 | Seconds between sensor reads. Below 60 becomes 60. Above 86400 becomes 86400. |
| co2DetectedThreshold | 1000 | ppm at which carbon dioxide is detected. The air-quality tile follows radon. |
| debug | false | Logs radon, CO₂, temperature, and sample age for each monitor after every poll, as debug lines. Homebridge shows them only in debug mode. |
| diagnosticsInterval | 0 | Seconds between a health line. 0 is off. Otherwise up to 3600. Values from 1 to 29 use 30. |
| pagerdutySignals | false | Write alert conditions for [homebridge-pagerduty](https://github.com/tbaur/homebridge-pagerduty). Off until you turn it on. See [PagerDuty](#pagerduty). |

An empty config, with no client id and no client secret and no environment variables, does not start and does not remove cached accessories.

## Services

Every published monitor has an Air Quality service as its primary service. The category is Sensor, because HomeKit has no air-quality category. Linked services stay on the same tile.

Temperature, humidity, carbon dioxide, light, and battery are added only when the device reports them. Battery is added once a sample includes `batteryPercentage`, and that fact is remembered on the cached accessory.

Pressure is an Eve characteristic on the temperature service, or on the air-quality service when the device has pressure and no temperature.

## Stale readings

A sample older than three hours is inactive. The accessory marks itself inactive at that moment. The last numbers stay. A poll that has no sample for a known monitor marks that monitor inactive the same way. After three unreachable polls the same thing happens even if the last sample was fresh. A rejected client is counted on its own, and does not add to those three. The accessory is not removed.

## Removal

A monitor is removed only when a device-list request succeeds and that serial is absent. The device list runs on the first poll and then every sixth successful poll.

## Logs

| Line | When |
| --- | --- |
| `Airthings is unreachable: …` | The first outage. Later ones are debug until recovery. The next poll is still the normal interval. |
| `Airthings is reachable again` | The first success after an outage or a rejected secret. |
| `Airthings rejected the client credentials` | Once per failure streak. The secret is not in the line. |
| `Airthings rate limit reached. Retry in Ns` | The hourly budget was spent. |
| `<name> inactive: sample older than three hours` | Once, when that monitor becomes inactive. The reason is the sample age, a missing timestamp, a timestamp ahead of this clock, no sample from Airthings for that monitor, three unreachable polls, or a poll that threw. |
| `<serial> radon=40 co2=650 temp=21.5 age=7m` | Debug. After every poll, for each monitor, when `debug` is on and Homebridge is in debug mode. `age` is how long ago the monitor took the sample. Airthings uploads on its own schedule, so a few minutes is normal. `-` means the sample did not include that reading. |
| `poll failed: …` | A fault inside the plugin while applying a poll. The sensors go inactive, and the next poll is still the normal interval. |
| `homebridge-pagerduty support is enabled (auth-failed, cloud-offline, stale.<serial>)` | Once, at startup, when signals are on. It is logged before the first poll. |
| `Diagnostics start: healthy \| devices 0/0 \| rest connecting \| api p50 0ms p95 0ms (req 0, err 0)` | Once, when `diagnosticsInterval` is on, before the poll loop is armed. The plugin version is not on this line. |
| `Health: healthy \| devices 2/2 \| rest live \| api p50 80ms p95 120ms (req 1, err 0)` | Each diagnostics interval after that. `rest` is the consumer API: `live`, `connecting`, `auth-failed`, or `stopped`. Request and error counts are since the previous line. `p50` and `p95` are the last 200 completed polls. A rate-limit wait is not in those counts. `rest auth-failed` is `degraded [authFailed]`. When a monitor is inactive, the line is `degraded [devicesInactive]`. |
| `Diagnostics stop: …` | When Homebridge shuts down, if diagnostics were on. `rest` is `stopped`. Counts are the totals for the process. |

## PagerDuty

This plugin can page through [homebridge-pagerduty](https://github.com/tbaur/homebridge-pagerduty) when Airthings needs attention. It needs Node 22.13 or later. The setting is off until you turn it on.

On a Node version without `node:sqlite`, the plugin still starts. With the setting on, it still logs `homebridge-pagerduty support is enabled (auth-failed, cloud-offline, stale.<serial>)` before the first poll. The version check happens the first time a signal would be written. The log then says `PagerDuty signals need Node 22.13 or later; not writing signals`, and signals are skipped. The monitors keep working.

1. Turn on **Send Signals to PagerDuty** (`pagerdutySignals`) in this plugin's settings.
2. Restart Homebridge.
3. In homebridge-pagerduty's settings, allow homebridge-myairthings to page, save, and restart Homebridge again. [Signals from other plugins](https://github.com/tbaur/homebridge-pagerduty/blob/main/docs/SIGNALS.md#let-a-plugin-page) explains each step and what else you can set for each signal.

Each condition below then opens a PagerDuty alert while it is present, and resolves it when it clears.

| Signal | Severity | Active when |
| --- | --- | --- |
| `auth-failed` | error | Airthings rejects the client id or the client secret |
| `cloud-offline` | error | Three polls in a row cannot reach Airthings. It stays on until a poll succeeds |
| `stale.<serial>` | warning | The account answers, and that monitor's sample is missing or older than three hours |

The serial in `stale.<serial>` is the device serial in lowercase. The summary uses the name from Airthings: "`<name>` has not reported a fresh Airthings reading."

While `auth-failed` or `cloud-offline` is active, every `stale.<serial>` row is off. One outage is one page. A rejected client leaves `cloud-offline` off. `auth-failed` stays on until a poll is accepted. After a monitor leaves the account, its `stale.<serial>` row stays until the next device-list poll, which is the same poll that removes the accessory.

The summaries are fixed sentences:

- `auth-failed`: "Airthings rejected the API client. HomeKit is showing the last readings until the client id and secret work again."
- `cloud-offline`: "Homebridge has not reached Airthings. The monitors are showing their last readings."

A rate limit does not page, and it does not clear a page that is already open. Low battery does not page. The radon level does not page. An automation on the air-quality tile is the way to watch radon.

At startup the plugin logs one line, `homebridge-pagerduty support is enabled (auth-failed, cloud-offline, stale.<serial>)`, before the first poll. It is not logged when the setting is off, when the config could not be used, or a second time if startup runs again. Shutdown closes the store and does not clear a signal.

## Troubleshooting

1. **`no client credentials set; My Airthings is not started`.** The plugin has no client id and no client secret. Add them in settings, or set the environment variables, and restart.
2. **`platform disabled; cached accessories kept`.** A value in the config could not be used. The error lines above it name the field. Monitors stay registered and show No Response.
3. **`Airthings rejected the client credentials`.** Airthings refused the client: the token request returned 400, 401, or 403, or a read was refused twice. Check the client id and secret, and that the client in the Airthings dashboard still exists. The plugin keeps trying with a backoff. That does not count as the account being offline.
4. **`Airthings is unreachable`.** A connection failure, an unreadable payload, or HTTP 5xx. The plugin keeps polling at the interval. After three of those polls the sensors go inactive and keep their last numbers.
5. **`Airthings rate limit reached`.** The plugin waits for the window Airthings reported, then continues.
6. **A monitor disappeared from Home.** A device-list request succeeded and that serial was no longer on the account. A failed poll does not remove a monitor.
7. **A reading looks old.** A sample older than three hours is inactive. Radon itself updates about once an hour.
8. **Paging never happens.** Signals need `pagerdutySignals` on, Node 22.13 or later, homebridge-pagerduty installed, and homebridge-myairthings allowed in that plugin's settings. The startup line is `homebridge-pagerduty support is enabled (auth-failed, cloud-offline, stale.<serial>)`. If that line is missing, the setting is off. If Node has no `node:sqlite`, the next line is `PagerDuty signals need Node 22.13 or later; not writing signals`. The monitors keep working.

