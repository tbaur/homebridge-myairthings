# Maintenance scripts

Tools for the one thing CI cannot do: talk to a real Airthings account. They are not part of the published package (`files` in `package.json` excludes this directory) and they are not part of the test suite.

Everything here loads the compiled plugin from `dist/`, so a result says something about the code that actually ships. Run `npm run build` first.

No script has a built-in client. The client id and secret come from `AIRTHINGS_CLIENT_ID` and `AIRTHINGS_CLIENT_SECRET`, or from a prompt that does not echo the secret. **No script takes the secret as a command-line argument**, because that puts it in your shell history and, on most systems, in the process list for any other user on the machine.

| Script | Writes to Airthings? | What it is for |
| --- | --- | --- |
| `smoke.js` | No | One poll end to end before a release: the token, the account and device lists, a sensor page, unit conversion, and the tile word for each monitor |

`smoke.js` never calls the remote-control endpoint, so it cannot change a monitor or a purifier.

## Before a release

```bash
npm run build
node scripts/smoke.js
```

Each published monitor prints its type, a masked serial, its name, the sensors the device lists, the sample age, the converted readings, and the tile word. A `missing` line names a sensor that the device lists but the sample did not fill. That usually means a unit this plugin does not convert, and the `[info]` line above it names the unit.

The script exits non-zero when Airthings rejects the client, when the poll does not complete, or when no device on the account has a sensor this plugin maps.

One run is a token request plus three of the 120 requests Airthings allows an hour. A running Homebridge with this plugin shares that budget.

## Note on output

The output describes your account: monitor names, device types, and readings. Serial numbers are masked to the last four characters. Read it before attaching it to a public issue.
