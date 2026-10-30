---
name: Bug Report
about: Report a bug to help us improve
title: '[Bug] '
labels: bug
assignees: ''
---

> **Never paste a client secret or an access token.** Anyone holding the secret can read the monitors on the account. The plugin never logs it. If you paste a platform block, replace `clientId` and `clientSecret` with `00000000-0000-0000-0000-000000000001` and `00000000-0000-0000-0000-000000000002`.

## Description

A clear description of what the bug is.

## Environment

- **Plugin version**:
- **Homebridge version**:
- **Node.js version**:
- **Operating system**:
- **Monitor type**: View Plus, View Radon, Wave Mini, or the `type` string from the log
- **Which part**: tile word / a reading / discovery / removal / PagerDuty

## Steps to Reproduce

1.
2.
3.

## Expected Behavior

What you expected to happen, in the Home app and in Eve if you use it.

## Actual Behavior

What actually happened.

## Logs

Run Homebridge with debug logging (`homebridge -D`) and include the startup lines plus anything around the failure. The startup line begins with `My Airthings`. Monitor names appear in the log. Read it before you paste it.

<details>
<summary>Click to expand logs</summary>

```
Paste relevant logs here
```

</details>

## Configuration

Paste the MyAirthings platform block with the client id and client secret replaced by the placeholders above.

```json
{
  "platform": "MyAirthings",
  "name": "My Airthings",
  "clientId": "00000000-0000-0000-0000-000000000001",
  "clientSecret": "00000000-0000-0000-0000-000000000002"
}
```

## Additional Context

Any other context about the problem.
