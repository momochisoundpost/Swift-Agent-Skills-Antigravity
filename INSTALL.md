# Installing Swift Agent Skills for Google Antigravity

This guide covers both human terminal/GUI installation and automated installation inside Google Antigravity.

> **Default lean install:** Running the installer with no pack flags installs only **`swift-core`** (5 skills) so your active context window stays clean and fast. You can add optional packs at any time without affecting existing plugins.

---

## Pack Catalog & Short Aliases

| Pack (`name`) | Short Alias | Default? | Skills | Display Name in Antigravity |
|---|---|---|---:|---|
| `swift-core` | `core` | **Yes** | 5 | Swift Core (Community) |
| `swift-ui-craft` | `ui-craft` | Optional | 7 | SwiftUI Craft (Community) |
| `swift-apple-frameworks` | `frameworks` | Optional | 7 | Apple Frameworks for Swift (Community) |
| `swift-quality` | `quality` | Optional | 3 | Swift Code Quality (Community) |
| `swift-app-store` | `app-store` | Optional | 3 | App Store Toolkit (Community) |
| `swift-asc-cli` | `asc-cli` | Optional | 26 | App Store Connect CLI (Community) |
| `swift-ios-simulator` | `ios-simulator` | Optional | 1 | iOS Simulator (Community) |
| `swift-extras` | `extras` | Optional | 9 | Swift Extras: Alternatives (Community) |

---

## Option 1: macOS / Linux (`install.sh`)

Uses POSIX `sh` with stock `curl`, `unzip`, `mktemp`, and `awk` (no Git, Node.js, Homebrew, or `agy` CLI required).

```bash
# Default: install swift-core (5 skills) into ~/.gemini/config/plugins/
curl -fsSL https://raw.githubusercontent.com/momochisoundpost/Swift-Agent-Skills-Antigravity/main/install.sh | sh

# Install or update specific packs (accepts full swift-* names or short aliases)
curl -fsSL https://raw.githubusercontent.com/momochisoundpost/Swift-Agent-Skills-Antigravity/main/install.sh | sh -s -- --packs core,ui-craft,frameworks

# Install all 8 packs enabled
curl -fsSL https://raw.githubusercontent.com/momochisoundpost/Swift-Agent-Skills-Antigravity/main/install.sh | sh -s -- --all

# Install all 8 packs with the 7 optional packs disabled until toggled on in Customizations
curl -fsSL https://raw.githubusercontent.com/momochisoundpost/Swift-Agent-Skills-Antigravity/main/install.sh | sh -s -- --all-disabled

# Install into the current repository's workspace (.agents/plugins/) instead of globally
curl -fsSL https://raw.githubusercontent.com/momochisoundpost/Swift-Agent-Skills-Antigravity/main/install.sh | sh -s -- --workspace --packs core,ios-simulator

# Check available packs and current install status (offline, no download)
curl -fsSL https://raw.githubusercontent.com/momochisoundpost/Swift-Agent-Skills-Antigravity/main/install.sh | sh -s -- --list
```

Additional `install.sh` flags:
- `--dest DIR` — install into a custom plugins directory (overrides `--workspace`).
- `--version vX.Y.Z` — install a pinned GitHub Release tag (fails cleanly with no silent fallback if that release is missing).
- `--from-zip FILE` — install offline from a local `swift-agent-skills-antigravity.zip` or GitHub branch archive.
- `--uninstall` (with optional `--packs a,b`) — remove only the specified packs, or all 8 known `swift-*` packs when `--packs` is omitted.

On macOS and Linux, `install.sh` automatically restores `+x` executable permissions on helper scripts listed in `EXECUTABLES.txt` (for `swift-ios-simulator` and `swift-app-store`).

---

## Option 2: Windows (`install.ps1`)

Works on built-in Windows PowerShell 5.1+ and PowerShell 7 (`pwsh`) with zero external dependencies.

```powershell
# Default: install swift-core (5 skills) into %USERPROFILE%\.gemini\config\plugins\
irm https://raw.githubusercontent.com/momochisoundpost/Swift-Agent-Skills-Antigravity/main/install.ps1 | iex

# Install or update specific packs (accepts full swift-* names or short aliases)
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/momochisoundpost/Swift-Agent-Skills-Antigravity/main/install.ps1))) -Packs core,ui-craft,frameworks

# Install all 8 packs enabled
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/momochisoundpost/Swift-Agent-Skills-Antigravity/main/install.ps1))) -All

# Install all 8 packs with the 7 optional packs disabled until toggled on in Customizations
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/momochisoundpost/Swift-Agent-Skills-Antigravity/main/install.ps1))) -AllDisabled

# Install into the current repository's workspace (.agents\plugins\) instead of globally
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/momochisoundpost/Swift-Agent-Skills-Antigravity/main/install.ps1))) -Workspace

# Check available packs and current install status (offline, no download)
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/momochisoundpost/Swift-Agent-Skills-Antigravity/main/install.ps1))) -List
```

Additional `install.ps1` parameters:
- `-Destination DIR` — install into a custom plugins directory (overrides `-Workspace`).
- `-Version vX.Y.Z` — install a pinned GitHub Release tag (fails cleanly if missing).
- `-FromZip FILE` — install offline from a local `swift-agent-skills-antigravity.zip` or GitHub branch archive.
- `-Uninstall` (with optional `-Packs a,b`) — remove only the specified packs, or all 8 known `swift-*` packs when `-Packs` is omitted.

---

## Option 3: Manual Zip Download

1. Download `swift-agent-skills-antigravity.zip` from [GitHub Releases](https://github.com/momochisoundpost/Swift-Agent-Skills-Antigravity/releases).
2. Extract only the `<pack>/` directories you want into:
   - **macOS / Linux (global):** `~/.gemini/config/plugins/`
   - **Windows (global):** `%USERPROFILE%\.gemini\config\plugins\`
   - **Workspace-only:** `<repo>/.agents/plugins/`
3. On macOS/Linux, if your GUI archive tool does not preserve Unix permissions, mark `.py`/`.sh` files under `swift-ios-simulator/skills/ios-simulator-skill/scripts/` and `swift-app-store/skills/*/scripts/` executable with `chmod +x` (or use `install.sh --from-zip swift-agent-skills-antigravity.zip`).

---

## Option 4: Antigravity CLI (`agy`) from a Local Clone

```bash
git clone https://github.com/momochisoundpost/Swift-Agent-Skills-Antigravity.git
agy plugin install ./Swift-Agent-Skills-Antigravity/antigravity/plugins/swift-core
# Install additional packs as needed:
agy plugin install ./Swift-Agent-Skills-Antigravity/antigravity/plugins/swift-ui-craft
```

---

## Updating, Toggling, and Uninstalling

- **Updating:** Re-run `install.sh` or `install.ps1` with the packs you want to refresh. Installs are **additive** and stage cleanly before swapping directories, leaving unrelated plugins and `config.json` untouched.
- **Toggling packs in Antigravity:** Open **Customizations → Installed** to enable or disable any installed pack live without restarting Antigravity. Re-running `--packs <pack>` / `-Packs <pack>` also clears `"disabled": true` if that pack was previously installed via `--all-disabled` / `-AllDisabled`.
- **Uninstalling:**
  - macOS / Linux: `curl -fsSL https://raw.githubusercontent.com/momochisoundpost/Swift-Agent-Skills-Antigravity/main/install.sh | sh -s -- --uninstall` (add `--packs <pack>` to remove only specific packs; add `--workspace` for workspace installs).
  - Windows: `& ([scriptblock]::Create((irm https://raw.githubusercontent.com/momochisoundpost/Swift-Agent-Skills-Antigravity/main/install.ps1))) -Uninstall` (add `-Packs <pack>` or `-Workspace` as needed).

### Optional Pack Prerequisites

- **`swift-ios-simulator`**: macOS only — requires Xcode + Xcode Command Line Tools (`xcrun simctl`), Python 3.12+, and `idb` (`idb-companion` + `fb-idb`).
- **`swift-asc-cli`**: requires the `asc` CLI installed and authenticated (`ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_PRIVATE_KEY_PATH` or `asc auth login`).
- **`swift-extras`**: covers alternative author styles for Swift Concurrency, Swift Testing, SwiftData, and Accessibility; enable only one perspective per topic when you want leaner context.

---

## Instructions for Antigravity

When a user asks you to install Swift Agent Skills from `https://github.com/momochisoundpost/Swift-Agent-Skills-Antigravity`:

1. **Detect the user's OS and choose the matching installer:**
   - On **macOS or Linux**, use `install.sh` via `curl -fsSL https://raw.githubusercontent.com/momochisoundpost/Swift-Agent-Skills-Antigravity/main/install.sh | sh`.
   - On **Windows**, use `install.ps1` via `irm https://raw.githubusercontent.com/momochisoundpost/Swift-Agent-Skills-Antigravity/main/install.ps1 | iex`.
2. **Select packs conservatively:**
   - Default to **`swift-core` only** (5 skills) unless the user asks for specific packs or all packs, so their active context window stays lean.
   - If the user names packs or short aliases, pass `--packs <list>` (`install.sh`) or `-Packs <list>` (`install.ps1`).
   - If the user asks for a project-local install, add `--workspace` (`install.sh`) or `-Workspace` (`install.ps1`).
   - If the user wants all 8 packs available in the Customizations UI without paying upfront context cost, pass `--all-disabled` (`install.sh`) or `-AllDisabled` (`install.ps1`).
   - Note prerequisites before enabling `swift-ios-simulator` (macOS + Xcode + Python 3.12+ + `idb`) or `swift-asc-cli` (`asc` CLI), and warn about topic overlap if enabling `swift-extras` alongside `swift-core` / `swift-ui-craft`.
3. **Never hand-edit `config.json`:**
   - **Never** modify `~/.gemini/config/config.json` (or `%USERPROFILE%\.gemini\config\config.json`), and do not manually assemble partial plugin directories when the official installer is available.
4. **Confirm installation and present clickable `customization://` links:**
   - Report the installed pack name(s) and destination path, remind the user that no restart is required, and present clickable links (using `customization://<pack>`, never `plugin://`) for **Customizations → Installed** matching the installed packs and optional packs you mention:
     - [Swift Core (Community)](customization://swift-core)
     - [SwiftUI Craft (Community)](customization://swift-ui-craft)
     - [Apple Frameworks for Swift (Community)](customization://swift-apple-frameworks)
     - [Swift Code Quality (Community)](customization://swift-quality)
     - [App Store Toolkit (Community)](customization://swift-app-store)
     - [App Store Connect CLI (Community)](customization://swift-asc-cli)
     - [iOS Simulator (Community)](customization://swift-ios-simulator)
     - [Swift Extras: Alternatives (Community)](customization://swift-extras)
