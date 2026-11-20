# Releasing the Antigravity Port

Maintainer workflow for syncing upstream skills, rebuilding and validating the 8 plugin packs, running automated checks, and cutting tagged releases of `momochisoundpost/Swift-Agent-Skills-Antigravity`.

## 1. Syncing Upstream Commits

1. Inspect remote branch HEADs for all 30 pinned repositories in `antigravity/sources.json` (read-only):
   ```bash
   node scripts/antigravity/sync-upstream.mjs
   ```
2. Update outdated `sha` fields in `antigravity/sources.json`:
   ```bash
   node scripts/antigravity/sync-upstream.mjs --write
   ```
3. If an upstream added or renamed skills, check `antigravity/sources.json` (`path` / `glob` / `exclude`) and update the pack tables in `install.ps1`, `install.sh`, `README.md`, `INSTALL.md`, and `scripts/tests/` if any skill counts changed.

## 2. Rebuilding Plugins & Updating Metadata

1. Regenerate `antigravity/plugins/` and `THIRD_PARTY_NOTICES.md` from the pinned commits:
   ```bash
   node scripts/antigravity/build.mjs
   ```
2. If `build.mjs` fails on an unmatched rewrite or detects a new host-specific reference (`claude`, `codex`, `copilot`, `AskUserQuestion`, etc.), update `antigravity/rewrites.json` (`rewrites` for runtime instructions; `allowlist` for neutral mentions such as reading a project's `CLAUDE.md`) and re-run `node scripts/antigravity/build.mjs`.
3. Bump `version` in the affected `antigravity/overrides/<pack>/plugin.json` files (minor on upstream sync, patch on port-only fixes), re-run `node scripts/antigravity/build.mjs`, and update `CHANGELOG-antigravity.md` (moving the target version from `Unreleased` to the release date).

## 3. Local Verification Gates

Run all verification steps before opening a pull request or tagging a release:

```bash
# 1. Confirm committed plugins and THIRD_PARTY_NOTICES.md match sources cleanly
node scripts/antigravity/build.mjs --check

# 2. Enforce Marketplace fields, unique skill names, zero unallowlisted host leaks, and EXECUTABLES.txt
node scripts/antigravity/validate.mjs --strict

# 3. Run all automated Node tests (use the *.test.mjs glob — not a trailing-slash directory — for Windows Node v24 compatibility)
node --test scripts/tests/*.test.mjs

# 4. Build the deterministic release archive locally (optional smoke check)
node scripts/antigravity/package-release.mjs --out swift-agent-skills-antigravity.zip
```

> **Important:** Always invoke `node --test scripts/tests/*.test.mjs` rather than `node --test scripts/tests/`. On Windows Node v24, passing a directory path with a trailing slash skips test discovery.

On a machine with the `agy` CLI installed, you can also validate each generated plugin directory natively:

```bash
for pack in swift-core swift-ui-craft swift-apple-frameworks swift-quality swift-app-store swift-asc-cli swift-ios-simulator swift-extras; do
  agy plugin validate --strict "./antigravity/plugins/$pack"
done
```

## 4. Pull Request, CI, and Merge

1. Commit generated plugin updates, notices, overrides, and changelog changes to your feature branch.
2. Push the branch and open a pull request against `main`.
3. Wait for `.github/workflows/antigravity-ci.yml` to pass on both matrix runners:
   - `ubuntu-latest` (`build.mjs --check`, `validate.mjs --strict`, `node --test scripts/tests/*.test.mjs`, `install.sh` runtime tests, `package-release.mjs`, and zip `0755` POSIX executable permission checks).
   - `windows-latest` (`build.mjs --check`, `validate.mjs --strict`, `node --test scripts/tests/*.test.mjs`, and `install.ps1` runtime tests).
4. Review the PR diff (including notices, rewrites, and docs) and merge to `main`.

## 5. Tagging and GitHub Release (`vX.Y.Z`)

1. Ensure `CHANGELOG-antigravity.md` and `antigravity/overrides/*/plugin.json` reflect the release version on `main`.
2. Create and push an annotated tag `vX.Y.Z`:
   ```bash
   git checkout main
   git pull --ff-only
   git tag -a vX.Y.Z -m "Release vX.Y.Z"
   git push origin vX.Y.Z
   ```
3. Pushing `vX.Y.Z` triggers `.github/workflows/antigravity-release.yml`, which verifies the build and tests, packages `swift-agent-skills-antigravity.zip` with preserved POSIX `+x` mode bits, and publishes the GitHub Release.
4. Smoke-test the published release via `install.sh --version vX.Y.Z` (macOS/Linux) and `install.ps1 -Version vX.Y.Z` (Windows).

## 6. Antigravity Marketplace Readiness

Before submitting any pack to the Antigravity Marketplace:

- Confirm `plugin.json` contains `name`, `displayName`, `description`, `version`, `logo`, 3 `suggestedPrompts`, and `author` (with no `disabled` key).
- Confirm each pack root includes `README.md`, `NOTICE.md`, and `assets/logo.svg` (`128x128` square SVG artwork).
- Keep the `"unofficial community port ... not affiliated with or endorsed by Apple, Google, or the upstream skill authors"` notice intact.
