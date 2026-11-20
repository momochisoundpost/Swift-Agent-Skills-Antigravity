# Changelog (Antigravity Port)

All notable changes to the Google Antigravity community port are recorded here.

## [1.0.0] - Unreleased

### Added
- Declarative upstream catalog (`antigravity/sources.json`) pinning **30 MIT-licensed Swift & Apple skill repositories** from [`twostraws/Swift-Agent-Skills`](https://github.com/twostraws/Swift-Agent-Skills) by 40-character commit SHA.
- **8 modular native Antigravity plugin packs (61 skills total)** generated under `antigravity/plugins/` with original `128x128` SVG artwork, Marketplace-ready `plugin.json` manifests, per-pack `README.md`, per-pack `NOTICE.md`, and consolidated `THIRD_PARTY_NOTICES.md`:
  - **`swift-core`** (`core`, 5 skills — default): `swiftui-pro`, `swiftdata-pro`, `swift-concurrency-pro`, `swift-testing-pro`, `swift-api-design-guidelines-skill`.
  - **`swift-ui-craft`** (`ui-craft`, 7 skills): `swiftui-ui-patterns`, `swiftui-view-refactor`, `swiftui-performance-audit`, `swiftui-design-principles`, `ios-accessibility`, `writing-for-interfaces`, `swift-focusengine-pro`.
  - **`swift-apple-frameworks`** (`frameworks`, 7 skills): `swift-format-style`, `app-intents`, `background-execution`, `observability`, `widgets`, `core-data-expert`, `swiftdata-testing`.
  - **`swift-quality`** (`quality`, 3 skills): `swift-architecture-skill`, `swift-security-expert`, `ios-code-audit`.
  - **`swift-app-store`** (`app-store`, 3 skills): `app-store-changelog`, `app-store-aso`, `appstore-review`.
  - **`swift-asc-cli`** (`asc-cli`, 26 skills): all 26 `asc-*` App Store Connect CLI skills from `rorkai/app-store-connect-cli-skills` (originally `rudrankriyam/app-store-connect-cli-skills` by Rudrank Riyam).
  - **`swift-ios-simulator`** (`ios-simulator`, 1 skill): `ios-simulator-skill` with macOS helper scripts tracked in `EXECUTABLES.txt`.
  - **`swift-extras`** (`extras`, 9 skills): `swift-concurrency`, `swift-concurrency-expert`, `swift-testing-expert`, `swift-testing`, `swiftdata-expert-skill`, `swift-accessibility-skill`, `appkit-accessibility-auditor`, `swiftui-accessibility-auditor`, `uikit-accessibility-auditor`.
- Host-neutral rewrites and narrow allowlist (`antigravity/rewrites.json`) converting Claude/Codex runtime instructions to Antigravity equivalents (`invoke_subagent`, `AGENTS.md` / `GEMINI.md`, Customizations).
- Zero-npm-dependency Node.js 22+ build, validation, packaging, and sync pipeline (`scripts/antigravity/`):
  - `build.mjs` (`--check` deterministic verification), `upstream.mjs`, `frontmatter.mjs`, `lib.mjs`
  - `validate.mjs` (`--strict` Marketplace manifest, frontmatter, global skill uniqueness, host-leak, notice, and `EXECUTABLES.txt` verification)
  - `package-release.mjs` / `zip.mjs` (deterministic `swift-agent-skills-antigravity.zip` preserving POSIX `0755` executable mode bits)
  - `sync-upstream.mjs` (upstream branch HEAD checker and `sources.json` `--write` updater)
- Zero-dependency installers for both **macOS / Linux** (`install.sh`, POSIX `sh`) and **Windows** (`install.ps1`, PowerShell 5.1+ / `pwsh`) supporting lean default `swift-core`, `--packs`/`-Packs`, `--all`/`-All`, `--all-disabled`/`-AllDisabled`, `--workspace`/`-Workspace`, `--dest`/`-Destination`, `--version`/`-Version`, `--from-zip`/`-FromZip`, `--list`/`-List`, and `--uninstall`/`-Uninstall`.
- User, agent-install, and maintainer documentation (`README.md`, `INSTALL.md`, `CHANGELOG-antigravity.md`, `RELEASING-antigravity.md`) plus automated `node:test` suites under `scripts/tests/`.
- Documented `twostraws/SwiftAgents` and `daetojemax/figma-to-swiftui-skill` under **Unbundled Community Links (No License Declared)** in `README.md` without bundling or redistributing unlicensed files.
