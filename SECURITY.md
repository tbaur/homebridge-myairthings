# Security Policy

## Supported Versions

| Version | Supported |
| --- | --- |
| Latest release | Supported |
| Earlier releases | Not supported |

A supported release requires the Homebridge and Node.js versions in `package.json` `engines`.

## Reporting a Vulnerability

Do not open a public issue. Use GitHub's [private vulnerability reporting](https://github.com/tbaur/homebridge-myairthings/security/advisories/new), and include a description, how to reproduce it, and the impact.

## Summary

**This plugin needs an Airthings client id and client secret, and Homebridge stores them in plain text in `config.json`.** Every Homebridge plugin stores its credentials that way, because Homebridge offers no secret store.

What follows from that:

- Anyone who can read the Homebridge config can read the monitors on that account.
- The secret can obtain an access token for the consumer API. The plugin uses it to list devices and read samples. It does not change a monitor.
- The secret is sent only to `accounts-api.airthings.com`, in the body of the token request over HTTPS, to obtain an access token. The token is sent only to `consumer-api.airthings.com`. Neither value is written to a log, an accessory cache, or an error message.

If a secret leaks, delete the client in the Airthings dashboard, create a new one, and put the new secret in the plugin settings.

`AIRTHINGS_CLIENT_ID` and `AIRTHINGS_CLIENT_SECRET` override the config file when they are set. They are still credentials. Do not put them in a shell history you share.

## Security Measures

- **The secret in one place.** The client id and client secret are read from configuration or from those two environment variables, held in memory, and sent only to the Airthings hosts above. The secret is never written to a log, not even its length or a prefix. It is never placed in an accessory's cache.
- **Redaction by shape.** `src/utils/redact.ts` strips field names, `Bearer` tokens, `Basic` credentials, and JWTs before a string is logged. A value echoed into a log line has control characters replaced and is length-limited, so a name cannot forge a second log line.
- **No redirects.** A 3xx is rejected. The client secret cannot be forwarded to another host.
- **Bounded I/O.** A connect deadline, a total deadline, and a response cap on every request.
- **Account ids are checked** before they are placed in a URL. Only letters, digits, `_`, and `-` are allowed, up to 128 characters, so an id cannot change the path or add a query. Anything else is refused.
- **Input validation.** Config is checked at startup. Missing credentials start nothing and leave cached accessories in place. A value that cannot be used disables the platform. Those accessories answer No Response until the config is fixed.
- **No runtime dependencies.** HTTPS comes from Node. `node:sqlite`, used only when PagerDuty signals are on, also comes from Node.
- **The signal file has no secret.** When `pagerdutySignals` is on, the plugin writes condition names and summaries to `homebridge-pagerduty/signals-2026-10-24/signals.sqlite` under the Homebridge storage directory. That file does not contain the client id, the client secret, or the access token. The writer creates the store directories at mode `0700` and the file at mode `0600`.
- **Dependencies audited.** CI runs `npm audit --omit=dev --audit-level=moderate` and fails on a runtime advisory. Development advisories are reported and do not fail the job. OSV-Scanner covers the full tree on pull requests, pushes to `main`, and a weekly schedule.
- **A CI step rejects JWT-shaped strings and Basic credentials** in the docs, source, tests, scripts, schema and workflows. `scripts/smoke.js` reads the client from the environment or a prompt that does not echo, and never from a command-line argument. Tests build their fake client id and secret at runtime, and the suite refuses to run if `AIRTHINGS_CLIENT_ID` or `AIRTHINGS_CLIENT_SECRET` is set.
- **Pinned supply chain.** GitHub Actions are pinned to commit SHAs. The publish job installs with `--ignore-scripts` and publishes with npm provenance.

## Best Practices for Users

1. Keep Homebridge and this plugin updated.
2. Run Homebridge with minimal privileges, and do not expose it to the internet.
3. Protect `config.json` and any backup of it as you would a password file. It contains a secret that can read the account.
4. Use a dedicated Airthings API client for this plugin, so you can delete it without affecting anything else.
5. Leave PagerDuty signals off unless homebridge-pagerduty is installed and you have allowed this plugin to page.

## Response Timeline

- **Acknowledgment**: Within 48 hours
- **Initial assessment**: Within 1 week
- **Fix timeline**: Depends on severity
  - Critical: 24-48 hours
  - High: 1 week
  - Medium: 2 weeks
  - Low: Next release
