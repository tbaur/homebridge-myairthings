# Airthings consumer API

Reference for the HTTP surface this plugin calls. The product is Airthings. The Homebridge platform name is `MyAirthings`.

The plugin uses the consumer API. It does not call the business API, and it does not write a setting back to a monitor.

## Calls

| Call | Method and URL |
| --- | --- |
| Token | `POST https://accounts-api.airthings.com/v1/token` |
| Accounts | `GET https://consumer-api.airthings.com/v1/accounts` |
| Devices | `GET https://consumer-api.airthings.com/v1/accounts/{accountId}/devices` |
| Sensors | `GET https://consumer-api.airthings.com/v1/accounts/{accountId}/sensors?unit=metric&pageNumber=` |

The token request is the body that the [Airthings authorization guide](https://consumer-api-doc.airthings.com/docs/api/authorization) documents, sent as JSON: `grant_type` `client_credentials`, `client_id`, `client_secret`, and `scope` `["read:device:current_values"]`. The client id and secret never go in the URL. The access token is cached until `expires_in` minus 60 seconds, and sent as `Authorization: Bearer` on the other calls.

A GET that returns 401 or 403 is tried once more after the cached token is dropped. A 400, 401, or 403 from the token request, or a second rejection on a GET, is a rejected client. Airthings answers an unknown client or a wrong secret with 400 and an OAuth error such as `invalid_grant`, not with 401. A rejected client does not count as the account being offline.

The API documents the account id only as a string. It is placed in a URL only when it is 1 to 128 letters, digits, `_`, or `-`. That allows a UUID without depending on it, and refuses anything that could change the path. A refused id is never sent.

The [OpenAPI description](https://consumer-api.airthings.com/openapi.yaml) is the reference for the paths, the payload fields, and the rate-limit headers.

## Devices

A device payload includes `serialNumber`, `name`, `type`, and `sensors`.

- `serialNumber` is the identity. HomeKit stores `uuid.generate` of `homebridge-myairthings:` plus that serial, in lowercase. The stored id is a UUID, not the seed string.
- `name` is the name shown in Home, unless Home already shows a name the user chose after the previous API name.
- `type` is a string such as `VIEW_PLUS`. The model label is that string with underscores turned into spaces and each word capitalized: `VIEW_PLUS` becomes View Plus.
- `sensors` is the list of readings that device can produce. Services are chosen from that list, not from the model name. An empty list means the device has nothing to publish. A missing list keeps the previous list for that serial. A serial that cannot be used is logged and skipped. If every device in the payload is skipped, the poll fails and cached accessories stay.

A device with no recognized sensor is not published.

## Samples

A sensor sample includes `sensorType`, `value`, and `unit`. The record also has `recorded` and `batteryPercentage`.

Metric is requested. These other units are still accepted:

| Reported | Stored as |
| --- | --- |
| `pci`, `pcil` | Bq/m³, multiplied by 37 |
| `bq`, `bqm3` | Bq/m³, unchanged |
| `f` | Celsius |
| `pa` | hPa, divided by 100 |
| `inhg` | hPa |
| `mbar` | hPa |
| `ugm3`, `ug/m3`, `µg/m³` | µg/m³ |
| `mgpc` | µg/m³ |
| `ppb` for VOC | µg/m³ for HomeKit, and the same ppb for Eve |
| `ugm3`, `ug/m3`, `µg/m³`, `mgpc` for VOC | µg/m³ for HomeKit, and ppb for Eve, using the same isobutylene factor in reverse |

VOC in µg/m³ uses isobutylene at 25°C (56.106 g/mol, 24.465 L/mol). Airthings reports ppb and does not publish a molar mass. Eve gets the ppb value unchanged.

A sample older than three hours is inactive. A sample timestamp more than five minutes ahead is inactive. A known monitor with no record in a sensor page is inactive and keeps its last numbers. A timestamp with no zone is read as UTC. The accessory marks itself inactive when the current sample crosses three hours, without waiting for the next poll.

### Recognized sensor names

| `sensors` / `sensorType` | Used for |
| --- | --- |
| `radonShortTermAvg` | The tile word, when present, and the Eve short radon characteristic |
| `radonLongTermAvg` | The Eve long radon characteristic |
| `temp` | Temperature service |
| `humidity` | Humidity service. Not an input to the tile word |
| `pressure` | Eve air pressure, on the temperature service, or on air quality when there is no temperature |
| `co2` | Carbon dioxide service. Detected at 1000 ppm unless `co2DetectedThreshold` is set |
| `voc` | VOC density on the air-quality service, and Eve VOC in ppb |
| `pm25` | PM2.5 on the air-quality service |
| `pm1` | PM1, a plugin-owned characteristic |
| `mold` | Mold risk, a plugin-owned characteristic |
| `lux`, `light` | Light sensor |
| `sla`, `soundLevel` | Sound level, a plugin-owned characteristic |

Any other name is logged once per device as unmapped, and does not create a service.

## Radon bands

Airthings publishes three bands. The tile uses them when the device reports radon:

| Short-term average | HomeKit Air Quality |
| --- | --- |
| under 100 Bq/m³ | Good |
| 100 up to 150 | Fair |
| 150 and above | Poor |

A device with no radon sensor uses the worst of the pollutants it reports: CO₂ at 800 ppm fair and 1000 ppm poor, PM2.5 at 10 µg/m³ fair and 25 µg/m³ poor, VOC at 250 ppb fair and 2000 ppb poor. `co2DetectedThreshold` does not move those bands. It only sets when the carbon dioxide service says detected. Humidity does not change the word. When the device reports radon and the sample has no short-term value, the long-term average is the word. When neither value is in the sample, the word is Unknown.

Battery is low at 10% or below.

## Rate limit and pages

Airthings allows 120 requests an hour, shared by the account, device, and sensor calls. The default poll is 300 seconds, which is one sensor page per account. The account and device lists run on the first poll and then every sixth successful poll. At the 60-second floor that is about 80 requests an hour for one account.

`X-RateLimit-Remaining` and `X-RateLimit-Reset` are honoured. A 429 waits for `Retry-After` or `X-RateLimit-Retry-After`. When those headers do not say, the wait is 60 seconds. A shorter header is not raised to 60 seconds. A wait longer than 15 minutes is capped. A rate limit does not count as the account being offline.

Sensor pages are 50 records. The plugin reads at most five pages and keeps those readings. Hitting the cap is logged. It is not an outage. An account list that parses and is empty is logged and publishes nothing. It is not an outage.

## Errors

| Result | What the plugin does |
| --- | --- |
| 400, 401, or 403 on the token request | One rejected client for that poll. The token is not posted again inside the same poll. Backoff. Sensors go inactive after three rejected polls in a row. `auth-failed` stays on until a poll is accepted |
| 401 or 403 on a sensor or device read | The token is dropped and the read is tried once. A second rejection is the same as a rejected token |
| Connection failure, or a payload that cannot be read | One outage. The next poll is still the normal interval. Three in a row mark the sensors inactive |
| `{accounts: []}` or five full sensor pages | Logged. Not an outage. Cached monitors stay |
| 429 | Wait for the header, or 60 seconds when the header is absent. No page |
| 408 or HTTP 500 and above | One outage, same as a connection failure |
| Three unreachable polls | Sensors inactive. `cloud-offline` pages when signals are on. A rejected client does not count toward these three |
| Anything else, including a 400 on a read | Logged. The sensors stay as they were. No page is written |

## HomeKit and Eve

HomeKit has no air-quality accessory category. The accessory category is Sensor. The primary service is Air Quality, and the other services are linked to it, so the Home app shows one tile.

| Reading | Apple Home | Eve |
| --- | --- | --- |
| Radon, short and long | The tile word, from the short average when it is present | Bq/m³, on the Airthings GATT UUIDs |
| Temperature, humidity | Their own services | The same services |
| CO₂ | Carbon dioxide service | The same service |
| PM2.5 | On the air-quality service | The same characteristic |
| VOC | µg/m³ on the air-quality service | ppb, Eve Room characteristic |
| Pressure | Not shown | Eve Weather characteristic, hPa, 500 to 1200 |
| Light | Light sensor | The same service |
| Battery | Battery service, when a percentage is reported | The same service |
| PM1, mold risk, sound | Not shown | No Eve UUID. Present for apps that list every characteristic |

A string passed to Homebridge `getCharacteristic` is a display name, not a UUID. Custom characteristics are added with `new hap.Characteristic(displayName, uuid, props)` and published by that display name.

| Display name | UUID |
| --- | --- |
| Radon | `b42e01aa-ade7-11e4-89d3-123b93f75cba` |
| Radon Average | `b42e0a4c-ade7-11e4-89d3-123b93f75cba` |
| Air Pressure | `e863f10f-079e-48ff-8f27-9c2605a29f52` |
| VOC | `e863f10b-079e-48ff-8f27-9c2605a29f52` |
| PM1 Density | `7c2a9e14-5b30-4d8f-9a61-2e0c8b4f6d13` |
| Mold Risk | `1f6d3b80-9c24-4a57-8e10-5b7a2d9c0e46` |
| Sound Level | `4e8b1c60-2a75-4f93-b1d8-6c0e9a3f5b27` |

The radon UUIDs are the Airthings GATT characteristics, which Eve displays. Air Pressure and VOC are Eve's. The last three belong to this plugin. Eve has no characteristic for them.
