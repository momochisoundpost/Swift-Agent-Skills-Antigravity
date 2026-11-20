<p align="center">
    <img src="assets/logo.svg" alt="Swift Agent Skills" height="100" />
</p>

<h1 align="center">Swift Agent Skills for Google Antigravity</h1>

> **Community port — not affiliated with or endorsed by Apple, Google, Paul Hudson, or the upstream skill authors.**
> Converted from the MIT-licensed repositories cataloged in [Paul Hudson](https://github.com/twostraws)'s [`twostraws/Swift-Agent-Skills`](https://github.com/twostraws/Swift-Agent-Skills) directory. If you use Claude Code, Codex, Cursor, Windsurf, or Xcode directly, install from the upstream repositories listed below.

**61 human-authored Swift & Apple platform skills** from **30 pinned MIT repositories**, packaged into **8 modular native Antigravity plugin packs**.

### Why This Port Exists

Swift and Apple platform developers already have a rich library of human-written AI skills curated in `twostraws/Swift-Agent-Skills`, but most of those upstream repos ship `.claude-plugin` metadata or host-specific instructions built around expensive Claude Code or Codex subscriptions. Meanwhile, **Google AI Plus** and **Google AI Pro** plans are often bundled with mobile plans or shared across family members, making **Google Antigravity** a far more accessible path for indie Swift developers, learners, and vibecoders.

This port packages all 30 MIT-licensed repositories cleanly for Google Antigravity—normalizing manifests, resolving Claude/Codex runtime references, enforcing globally unique skill names, preserving script executable bits, and keeping the default context footprint lean.

---

## Prompt-to-Install inside Antigravity

Paste this single prompt into an Antigravity chat to have the agent detect your OS, run the official installer with the lean `swift-core` default, and give you clickable Customizations links:

```text
Install Swift Agent Skills from https://github.com/momochisoundpost/Swift-Agent-Skills-Antigravity (default `swift-core` pack, and show me the optional packs I can add later).
```

Antigravity follows the agent instructions in [`INSTALL.md`](INSTALL.md), never touches `config.json`, and installs directly to your user plugin directory (or your workspace if you ask for a project-only install).

---

## Modular Plugin Packs (8 Packs, 61 Skills)

All pack names use the `swift-` prefix so they namespace cleanly alongside your existing Antigravity plugins. **Only `swift-core` (5 skills) is installed by default.**

| # | Pack (`name`) | Short Alias | Default? | Skills | What's Inside |
|---|---|---|---:|---:|---|
| 1 | **`swift-core`** | `core` | **Yes** | 5 | SwiftUI Pro, SwiftData Pro, Swift Concurrency Pro, Swift Testing Pro, Swift API Design Guidelines |
| 2 | **`swift-ui-craft`** | `ui-craft` | Optional | 7 | SwiftUI UI patterns, view refactoring, performance audit, design principles, iOS accessibility, UX writing, FocusEngine |
| 3 | **`swift-apple-frameworks`** | `frameworks` | Optional | 7 | FormatStyle, App Intents, Background Execution, Observability, Widgets, Core Data, SwiftData testing |
| 4 | **`swift-quality`** | `quality` | Optional | 3 | Swift architecture guidance, iOS/Swift security hardening, and full codebase auditing |
| 5 | **`swift-app-store`** | `app-store` | Optional | 3 | App Store release changelogs, ASO metadata validation, and App Review compliance checks |
| 6 | **`swift-asc-cli`** | `asc-cli` | Optional | 26 | App Store Connect CLI (`asc`) automation across 26 workflows *(requires `asc` CLI)* |
| 7 | **`swift-ios-simulator`** | `ios-simulator` | Optional | 1 | Semantic iOS Simulator automation & inspection scripts *(macOS + Xcode + Python 3.12+ + `idb` only)* |
| 8 | **`swift-extras`** | `extras` | Optional | 9 | Alternative Concurrency, Testing, SwiftData, and multi-platform Apple accessibility perspectives *(overlaps `swift-core` / `swift-ui-craft`)* |

---

## Terminal Installation

Zero external dependencies beyond stock OS tools (`curl` + `unzip` on macOS/Linux; built-in Windows PowerShell 5.1+ or PowerShell 7 on Windows) — **no Git, Node.js, Homebrew, or `agy` CLI required**.

### macOS / Linux (`install.sh`)

```bash
# Default: installs swift-core only (5 skills, lean context)
curl -fsSL https://raw.githubusercontent.com/momochisoundpost/Swift-Agent-Skills-Antigravity/main/install.sh | sh

# Add optional packs (accepts full swift-* names or short aliases)
curl -fsSL https://raw.githubusercontent.com/momochisoundpost/Swift-Agent-Skills-Antigravity/main/install.sh | sh -s -- --packs core,ui-craft,frameworks

# Install all 8 packs, keeping the 7 optional packs disabled until toggled on
curl -fsSL https://raw.githubusercontent.com/momochisoundpost/Swift-Agent-Skills-Antigravity/main/install.sh | sh -s -- --all-disabled

# Workspace-only install (<cwd>/.agents/plugins/ in current repository)
curl -fsSL https://raw.githubusercontent.com/momochisoundpost/Swift-Agent-Skills-Antigravity/main/install.sh | sh -s -- --workspace --packs core,ios-simulator

# List packs & install status, or uninstall specific/all packs
curl -fsSL https://raw.githubusercontent.com/momochisoundpost/Swift-Agent-Skills-Antigravity/main/install.sh | sh -s -- --list
curl -fsSL https://raw.githubusercontent.com/momochisoundpost/Swift-Agent-Skills-Antigravity/main/install.sh | sh -s -- --uninstall --packs ios-simulator
```

Global installs write to `~/.gemini/config/plugins/<pack>/`. Pass `--all`, `--dest DIR`, `--version vX.Y.Z`, or `--from-zip FILE` as needed — see [`INSTALL.md`](INSTALL.md) for the full option reference.

### Windows (`install.ps1`)

```powershell
# Default: installs swift-core only (5 skills, lean context)
irm https://raw.githubusercontent.com/momochisoundpost/Swift-Agent-Skills-Antigravity/main/install.ps1 | iex

# Add optional packs (accepts full swift-* names or short aliases)
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/momochisoundpost/Swift-Agent-Skills-Antigravity/main/install.ps1))) -Packs core,ui-craft,frameworks

# Install all 8 packs, keeping the 7 optional packs disabled until toggled on
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/momochisoundpost/Swift-Agent-Skills-Antigravity/main/install.ps1))) -AllDisabled

# Workspace-only install (<cwd>\.agents\plugins\ in current repository)
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/momochisoundpost/Swift-Agent-Skills-Antigravity/main/install.ps1))) -Workspace

# List packs & install status, or uninstall specific/all packs
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/momochisoundpost/Swift-Agent-Skills-Antigravity/main/install.ps1))) -List
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/momochisoundpost/Swift-Agent-Skills-Antigravity/main/install.ps1))) -Uninstall -Packs ui-craft
```

Global installs write to `%USERPROFILE%\.gemini\config\plugins\<pack>\`. `-All`, `-Destination`, `-Version`, and `-FromZip` are also supported (see [`INSTALL.md`](INSTALL.md)).

### Manual Zip Download

1. Download `swift-agent-skills-antigravity.zip` from [Releases](https://github.com/momochisoundpost/Swift-Agent-Skills-Antigravity/releases).
2. Extract the desired `<pack>/` directories into `~/.gemini/config/plugins/` (macOS/Linux), `%USERPROFILE%\.gemini\config\plugins\` (Windows), or `<repo>/.agents/plugins/` (workspace-only).

### Antigravity CLI (`agy`) from a Local Clone

```bash
git clone https://github.com/momochisoundpost/Swift-Agent-Skills-Antigravity.git
agy plugin install ./Swift-Agent-Skills-Antigravity/antigravity/plugins/swift-core
```

---

## Context-Window Guidance & Toggling Packs

- **Why `swift-core` is the 5-skill default:** Enabling all 61 skills at once bloats prompt context with 26 `asc` CLI commands, macOS simulator scripts, and competing skills on overlapping topics. Starting with `swift-core` keeps your context window focused on everyday SwiftUI, SwiftData, Concurrency, Testing, and Swift API design.
- **Zero-cost toggling with `--all-disabled` / `-AllDisabled`:** Installing with `--all-disabled` extracts all 8 packs while marking the 7 optional packs `"disabled": true` in their installed `plugin.json`. Disabled packs spend **zero context tokens** until you turn them on in **Antigravity → Customizations → Installed** (live toggle, no restart needed).
- **Additive, safe updates:** Running `--packs <name>` / `-Packs <name>` adds or updates only those packs without removing `swift-core` or unrelated plugins, and never modifies `config.json`.
- **`swift-extras` overlap note:** `swift-extras` intentionally provides alternative community authors for **Swift Concurrency**, **Swift Testing**, **SwiftData**, and **Accessibility** alongside `swift-core` and `swift-ui-craft`. Every skill name across all 8 packs is globally unique so nothing collides if both are installed, but prefer enabling one author perspective per topic at a time to keep guidance consistent.

---

## Prerequisites for Optional Tool Packs

- **`swift-ios-simulator`**: **macOS only** — requires **Xcode** and Xcode Command Line Tools (`xcrun simctl`), **Python 3.12+**, and **`idb`** (`idb-companion` + `fb-idb`).
- **`swift-asc-cli`**: requires the **`asc` CLI** installed and configured with App Store Connect API credentials (`ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_PRIVATE_KEY_PATH` or `asc auth login`).

---

## ⚠️ Important Safety Note ⚠️

**Before you install a third-party agent skill, please make sure you have read it thoroughly and that you trust the author.** Being included here is *not* an endorsement; you need to exercise your own judgement.

All bundled skills in this port are open source (MIT-licensed), so take the time to review their `SKILL.md` files, `references/`, and helper `scripts/` before enabling them—especially packs like `swift-ios-simulator` and `swift-app-store` that execute local scripts.

---

## Upstream Credits (30 MIT Repositories)

This port builds directly on [Paul Hudson](https://github.com/twostraws)'s [`twostraws/Swift-Agent-Skills`](https://github.com/twostraws/Swift-Agent-Skills) directory ([Hacking with Swift](https://www.hackingwithswift.com)). All 30 bundled MIT repositories are pinned by commit SHA in [`antigravity/sources.json`](antigravity/sources.json) with full license texts preserved in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) and each plugin's `NOTICE.md`:

| Pack | Upstream Repository | Author | Bundled Skill(s) |
|---|---|---|---|
| `swift-core` | [`twostraws/SwiftUI-Agent-Skill`](https://github.com/twostraws/SwiftUI-Agent-Skill) | Paul Hudson | `swiftui-pro` |
| `swift-core` | [`twostraws/SwiftData-Agent-Skill`](https://github.com/twostraws/SwiftData-Agent-Skill) | Paul Hudson | `swiftdata-pro` |
| `swift-core` | [`twostraws/Swift-Concurrency-Agent-Skill`](https://github.com/twostraws/Swift-Concurrency-Agent-Skill) | Paul Hudson | `swift-concurrency-pro` |
| `swift-core` | [`twostraws/Swift-Testing-Agent-Skill`](https://github.com/twostraws/Swift-Testing-Agent-Skill) | Paul Hudson | `swift-testing-pro` |
| `swift-core` | [`Erikote04/Swift-API-Design-Guidelines-Agent-Skill`](https://github.com/Erikote04/Swift-API-Design-Guidelines-Agent-Skill) | Erik Sebastián de Erice | `swift-api-design-guidelines-skill` |
| `swift-ui-craft` | [`Dimillian/Skills`](https://github.com/Dimillian/Skills) | Thomas Ricouard | `swiftui-ui-patterns`, `swiftui-view-refactor`, `swiftui-performance-audit` |
| `swift-ui-craft` | [`arjitj2/swiftui-design-principles`](https://github.com/arjitj2/swiftui-design-principles) | Arjit Jaiswal | `swiftui-design-principles` |
| `swift-ui-craft` | [`dadederk/iOS-Accessibility-Agent-Skill`](https://github.com/dadederk/iOS-Accessibility-Agent-Skill) | Daniel Devesa | `ios-accessibility` |
| `swift-ui-craft` | [`andrewgleave/skills`](https://github.com/andrewgleave/skills) | Andrew Gleave | `writing-for-interfaces` |
| `swift-ui-craft` | [`mhaviv/Swift-FocusEngine-Agent-Skill`](https://github.com/mhaviv/Swift-FocusEngine-Agent-Skill) | Michael Haviv | `swift-focusengine-pro` |
| `swift-apple-frameworks` | [`n0an/Swift-FormatStyle-Agent-Skill`](https://github.com/n0an/Swift-FormatStyle-Agent-Skill) | Anton Novoselov | `swift-format-style` |
| `swift-apple-frameworks` | [`n0an/App-Intents-Agent-Skill`](https://github.com/n0an/App-Intents-Agent-Skill) | Anton Novoselov | `app-intents` |
| `swift-apple-frameworks` | [`n0an/Background-Execution-Agent-Skill`](https://github.com/n0an/Background-Execution-Agent-Skill) | Anton Novoselov | `background-execution` |
| `swift-apple-frameworks` | [`n0an/Observability-Agent-Skill`](https://github.com/n0an/Observability-Agent-Skill) | Anton Novoselov | `observability` |
| `swift-apple-frameworks` | [`n0an/Widgets-Agent-Skill`](https://github.com/n0an/Widgets-Agent-Skill) | Anton Novoselov | `widgets` |
| `swift-apple-frameworks` | [`AvdLee/Core-Data-Agent-Skill`](https://github.com/AvdLee/Core-Data-Agent-Skill) | Antoine van der Lee | `core-data-expert` |
| `swift-apple-frameworks` | [`akshaypimprikar/ios-swiftdata-testing-agent-skill`](https://github.com/akshaypimprikar/ios-swiftdata-testing-agent-skill) | Akshay Pimprikar | `swiftdata-testing` |
| `swift-quality` | [`efremidze/swift-architecture-skill`](https://github.com/efremidze/swift-architecture-skill) | Lasha Efremidze | `swift-architecture-skill` |
| `swift-quality` | [`ivan-magda/swift-security-skill`](https://github.com/ivan-magda/swift-security-skill) | Ivan Magda | `swift-security-expert` |
| `swift-quality` | [`jazzychad/ios-code-audit`](https://github.com/jazzychad/ios-code-audit) | Chad Etzel | `ios-code-audit` |
| `swift-app-store` | [`Dimillian/Skills`](https://github.com/Dimillian/Skills) | Thomas Ricouard | `app-store-changelog` |
| `swift-app-store` | [`TimBroddin/app-store-aso-skill`](https://github.com/TimBroddin/app-store-aso-skill) | Tim Broddin | `app-store-aso` |
| `swift-app-store` | [`3paws-ai/mobile-ai-skills`](https://github.com/3paws-ai/mobile-ai-skills) | Dann Beauregard | `appstore-review` |
| `swift-asc-cli` | [`rorkai/app-store-connect-cli-skills`](https://github.com/rorkai/app-store-connect-cli-skills) | Rudrank Riyam *(originally `rudrankriyam/app-store-connect-cli-skills`)* | 26 `asc-*` skills |
| `swift-ios-simulator` | [`conorluddy/ios-simulator-skill`](https://github.com/conorluddy/ios-simulator-skill) | Conor Luddy | `ios-simulator-skill` |
| `swift-extras` | [`AvdLee/Swift-Concurrency-Agent-Skill`](https://github.com/AvdLee/Swift-Concurrency-Agent-Skill) | Antoine van der Lee | `swift-concurrency` |
| `swift-extras` | [`AvdLee/Swift-Testing-Agent-Skill`](https://github.com/AvdLee/Swift-Testing-Agent-Skill) | Antoine van der Lee | `swift-testing-expert` |
| `swift-extras` | [`Dimillian/Skills`](https://github.com/Dimillian/Skills) | Thomas Ricouard | `swift-concurrency-expert` |
| `swift-extras` | [`vanab/SwiftData-agent-skill`](https://github.com/vanab/SwiftData-agent-skill) | Kudrin Dmitry | `swiftdata-expert-skill` |
| `swift-extras` | [`bocato/swift-testing-agent-skill`](https://github.com/bocato/swift-testing-agent-skill) | Eduardo Bocato | `swift-testing` |
| `swift-extras` | [`PasqualeVittoriosi/swift-accessibility-skill`](https://github.com/PasqualeVittoriosi/swift-accessibility-skill) | Pasquale Vittoriosi | `swift-accessibility-skill` |
| `swift-extras` | [`rgmez/apple-accessibility-skills`](https://github.com/rgmez/apple-accessibility-skills) | Roberto Gómez Muñoz | `appkit-accessibility-auditor`, `swiftui-accessibility-auditor`, `uikit-accessibility-auditor` |

## Unbundled Community Links (No License Declared)

The following community resources from `twostraws/Swift-Agent-Skills` currently declare **no license file on GitHub**, so they are **not bundled or redistributed** in this repository. Link out and inspect them directly upstream:

- [`twostraws/SwiftAgents`](https://github.com/twostraws/SwiftAgents) by [Paul Hudson](https://github.com/twostraws) — `AGENTS.md` / `CLAUDE.md` guidance file for Swift projects
- [`daetojemax/figma-to-swiftui-skill`](https://github.com/daetojemax/figma-to-swiftui-skill) by [Ermolaev Maxim](https://github.com/daetojemax) — Figma-to-SwiftUI workflow skill

---

## Documentation, Maintainers & License

- **Install & Agent Guide:** [`INSTALL.md`](INSTALL.md)
- **Third-Party MIT Attributions:** [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)
- **Port Changelog:** [`CHANGELOG-antigravity.md`](CHANGELOG-antigravity.md)
- **Maintainer Sync & Release Guide:** [`RELEASING-antigravity.md`](RELEASING-antigravity.md)

Port build, validation, and packaging scripts live under `scripts/antigravity/` (Node.js 22+, zero npm runtime dependencies):

```bash
node scripts/antigravity/build.mjs --check
node scripts/antigravity/validate.mjs --strict
node --test scripts/tests/*.test.mjs
```

Repository wrapper scripts and documentation are licensed under the [MIT License](LICENSE) and follow the [Code of Conduct](CODE_OF_CONDUCT.md). Each bundled third-party skill remains MIT-licensed under its original author's copyright (see [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)).
