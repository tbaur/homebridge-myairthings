# Contributing to homebridge-myairthings

Thank you for your interest in contributing! This guide will help you get started.

## Getting Started

You need **Node.js 22.13 or later, 24 or 26** (the range the plugin declares in `engines`). CI runs the test suite on 22.13.0, 22, 24 and 26.

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/homebridge-myairthings.git
   cd homebridge-myairthings
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. To try the plugin against an account, see [Run it in Homebridge](DEVELOPMENT.md#run-it-in-homebridge).

## Development Workflow

### Running Tests

```bash
npm test              # Build, then Jest with coverage (NODE_ENV=test)
npm run lint          # Warnings are failures
npm run lint:fix      # Auto-fix style issues
npx tsc --noEmit -p tsconfig.test.json  # src + tests
```

The suite never calls Airthings. It also refuses to run if `AIRTHINGS_CLIENT_ID` or `AIRTHINGS_CLIENT_SECRET` is set, which stops a test from using a real account.

Coverage must stay at or above 90% for statements, functions and lines, and 75% for branches.

### Code Style

- Use `const`/`let`, never `var`
- Use async/await over raw Promises
- Add JSDoc comments for public functions
- Comments explain *why*, not *what*
- Follow existing code patterns

### Making Changes

1. Create a feature branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. Make your changes
3. Add/update tests
4. Ensure all tests pass: `npm test`
5. Ensure linting passes: `npm run lint`
6. Rebuild and commit the compiled output: `npm run build`, then commit any changes under `dist/`. `dist/` is tracked in git so installing from a git URL works, and CI fails if it drifts from `src/`.
7. Commit with a descriptive message

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org). PR titles drive automated releases via release-please, so use prefixes like:

- `feat:` - New feature (minor bump)
- `fix:` - Bug fix (patch bump)
- `feat!:` / `fix!:` or a `BREAKING CHANGE:` footer - major bump
- `docs:` / `test:` / `refactor:` / `chore:` / `ci:` - no release

Example: `feat: add mold risk to the air-quality tile`

Before 1.0.0 the bump rules differ. See [RELEASING.md](RELEASING.md#version-bumps).

## Pull Request Process

1. Update documentation if needed
2. Ensure CI passes (build, lint, typecheck, tests, `dist/` in sync)
3. Request review from maintainers

> `CHANGELOG.md` is generated automatically by release-please from your Conventional Commit and PR titles. Do not edit it by hand. See [RELEASING.md](RELEASING.md).

### PR Checklist

- [ ] Tests added/updated
- [ ] Linting passes
- [ ] `dist/` rebuilt and committed (`npm run build`)
- [ ] Documentation updated
- [ ] No client secret, access token, or real account id in any committed file
- [ ] Descriptive PR title (Conventional Commits)

## Changing Behavior

Read the invariants in [DEVELOPMENT.md](DEVELOPMENT.md#invariants) first. A few things are worth knowing before you start:

- **The Homebridge platform name is `MyAirthings`.** Airthings is the product. `platform` in `config.json` is `MyAirthings`. Homebridge already uses `Airthings` for a different platform.
- **Do not break someone's tiles.** Accessory identity is the serial number. A change that alters that identity removes the accessory, with its room and automations. If it must, say so in the PR.
- **The client secret never reaches a log.** Not its value, its length, or a prefix. `src/utils/redact.ts` redacts by shape.
- **When a monitor reports radon, the tile is radon.** CO₂, particles, VOC, and humidity do not change the word.
- **Do not edit `src/pagerduty-signals.ts`.** It is a copy of the homebridge-pagerduty writer. Replace the file by copying a newer version from that plugin's `docs/SIGNALS-AGENT.md`.

## Reporting Bugs

Use the GitHub issue template. Include:

- Homebridge version
- Plugin version
- Node.js version
- Monitor type, such as View Plus or View Radon
- Steps to reproduce
- Expected vs actual behavior
- Relevant logs. With `diagnosticsInterval` set, the health line is a useful summary

**Never paste a client secret or an access token.** The plugin never logs them. Monitor names are in the log, so read it before you paste it. If you paste a platform block, replace `clientId` and `clientSecret` with placeholders.

## Feature Requests

Open an issue with:

- Clear description of the feature
- Use case / why it is needed
- Which monitors it applies to
- Any implementation ideas

[docs/API.md](docs/API.md) is the consumer API this plugin uses. [docs/FEATURES.md](docs/FEATURES.md#out-of-scope) lists what is out of scope.

## Questions?

Check [existing issues](https://github.com/tbaur/homebridge-myairthings/issues) first, and open a new one if your question is not already covered.

---

Thank you for contributing! 🎉
