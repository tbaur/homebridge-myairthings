# Releasing

Releases are automated with [release-please](https://github.com/googleapis/release-please). Versions, `CHANGELOG.md`, git tags, GitHub Releases and `npm publish` all come from commit messages. None of them are edited or run by hand.

## Shipping a release

1. **Branch and commit.** Include the `dist/` build with the source. CI fails if the two have drifted.
2. **Open a PR with a Conventional Commit title.** The title picks the next version. See [Version bumps](#version-bumps).
3. **Let the checks pass, then squash-merge to `main`.** The PR title becomes the commit release-please reads.
4. **release-please opens a Release PR** titled `chore(main): release X.Y.Z`. Several merged PRs are batched into one.
5. **Read its diff.** It must change exactly four files. See [Read the Release PR diff](#read-the-release-pr-diff).
6. **Approve its checks.** They are held and will not run on their own. See [Approve the Release PR checks](#approve-the-release-pr-checks).
7. **Merge it.** `release.yml` then tags `vX.Y.Z`, publishes the GitHub Release, and runs the `publish` job (install with `--ignore-scripts` → build → lint → test → `npm publish --dry-run` → `npm publish` with provenance and `--access public`) on Node 24.
8. **Confirm it landed:** `npm view homebridge-myairthings version`. The registry can lag a few minutes behind a successful publish.

## Before a release

The test suite never calls Airthings, so it cannot tell you that the consumer API still behaves the way this plugin assumes. Before a release that changes the client, the token request, or how a sample is read, run one read-only poll against your own account:

```bash
npm run build
node scripts/smoke.js
```

Confirm that every monitor prints a tile word, that a radon monitor's word comes from radon, and that no `missing` line appears. [scripts/README.md](scripts/README.md) explains the output.

Do not edit `CHANGELOG.md` by hand. release-please writes it on the Release PR. Do not add a version section by hand.

## Approve the Release PR checks

The Release PR is authored by `github-actions[bot]`, because `release.yml` passes `github.token` to release-please. GitHub creates its Tests and OSV-Scanner runs but holds them until a user with write access approves.

**Open the Release PR's Checks tab and click "Approve and run" before merging.**

- There is no CLI for this.
- The approval does not stick. It is needed on every release, and again whenever release-please updates an open Release PR.
- **Merging without approving turns the runs red.** They finish as `failure` with zero jobs and no logs. That means nobody approved them, not that anything broke.

This gate arrived with GitHub's [bot-created pull requests change](https://github.blog/changelog/2026-06-11-bot-created-pull-requests-can-run-workflows-if-approved/). It applies to same-repo branches, not just forks, and has no repository-level opt-out. The only way to remove the step is to author the Release PR as a different identity, which needs a GitHub App or a PAT. Neither is set up here, and the click is cheaper.

## Read the Release PR diff

A healthy Release PR changes exactly four files: `package.json`, `package-lock.json`, `CHANGELOG.md` and `.release-please-manifest.json`. Every change is a version number or changelog text.

**Anything else means the release branch was cut before some of the commits it is releasing, and merging it will undo them.** Close the Release PR, delete its branch (`release-please--branches--main--components--homebridge-myairthings`), and let the next push to `main` open a fresh one.

## Version bumps

| PR title prefix | Example | Version bump, once the package is 1.0.0 or newer |
| --- | --- | --- |
| `fix:` | `fix: honor Retry-After given as a date` | patch (1.0.0 → 1.0.1) |
| `feat:` | `feat: show mold risk on the tile` | minor (1.0.0 → 1.1.0) |
| `feat!:` / `fix!:` or a `BREAKING CHANGE:` footer | `feat!: drop Node 22` | major (1.0.0 → 2.0.0) |
| `chore:`, `docs:`, `refactor:`, `test:`, `ci:` | `docs: fix a log line` | no release |

`bump-minor-pre-major` and `bump-patch-for-minor-pre-major` in `release-please-config.json` apply only while the version is below 1.0.0. Below that line, a `feat:` bumps the minor and a `fix:` bumps the patch. From 1.0.0 on, the table above applies.

A `Release-As: X.Y.Z` footer on the squash commit forces that version. release-please reads the newest commit first and keeps the first footer it finds.

Dependabot titles runtime bumps `fix:` and development bumps `chore:` (see `.github/dependabot.yml`), so a dependency users install cuts a patch release on its own while a test dependency waits for the next release to carry it.

## One-time setup

- **Publishing** uses npm Trusted Publishing (OIDC), so there is no `NPM_TOKEN`. Link the package on npmjs.com to this repo's `release.yml`, under Settings → Trusted Publisher: user `tbaur`, repository `homebridge-myairthings`, workflow `release.yml`, no environment. This is not reconfigured per release.
- **Actions may create pull requests** (Settings → Actions → General → Workflow permissions). Without it, release-please writes the branch but cannot open the PR.
- **Protect `main`:** a PR is required (0 approvals), force-pushes and deletions are blocked, and no status check is a hard gate. Tests run on the PR. OSV-Scanner runs on the PR and on every push to `main`, so a fixed alert closes on merge. Release also starts on a push to `main`. The `publish` job re-runs build, lint and test before `npm publish`, so nothing ships untested.

Required checks on the Release PR are possible, because its runs do execute once approved. They would make approval mandatory. Removing the approval step needs a GitHub App or a PAT.

## Notes

- **Version source of truth** is `.release-please-manifest.json`. The `package.json` version belongs to release-please and is never hand-edited.
- **release-please settings** are in `release-please-config.json`.
- **A change to accessory identity deserves a changelog note.** Anything that changes the UUID re-creates the accessory in HomeKit and costs the user its room and automations. Prefer adopting, and say so in the PR when that is not possible.
- **A change to `src/pagerduty-signals.ts` is an interface change.** The file has to stay a copy of homebridge-pagerduty's writer. Say so in the PR, and copy it rather than editing it.

## Manual fallback

Rarely needed, and it bypasses CI provenance and manifest syncing. If unavoidable:

```bash
npm run clean && npm run build && npm run lint && npm test
npm publish --dry-run   # verify contents
npm publish             # requires npm login + OTP
```
