# Swift Agent Skills for Google Antigravity — Design Document

> **Status:** Draft (pending review & approval)
> **Target Repository:** `https://github.com/momochisoundpost/Swift-Agent-Skills-Antigravity` (fork of `twostraws/Swift-Agent-Skills`)
> **Planned Committed Path:** `docs/superpowers/specs/2026-11-20-swift-agent-skills-antigravity-design.md`

---

## 1. Intent & Why

Swift and Apple platform developers have a rich open-source ecosystem of human-written AI agent skills cataloged in Paul Hudson's `twostraws/Swift-Agent-Skills` — but almost all of those repositories target Claude Code (`.claude-plugin`) or Codex, whose subscriptions are expensive for many developers and hobbyists. Meanwhile, Google AI Plus and Pro plans are frequently bundled with mobile phone plans and shareable across family members, making **Google Antigravity** far more economically viable for Swift/Apple vibecoding and app development.

This port bridges that gap: it packages the MIT-licensed Swift/Apple skills from `twostraws/Swift-Agent-Skills` into native, modular Google Antigravity plugins that anyone can install in seconds — either via a single terminal command (macOS, Linux, or Windows) or by pasting a single prompt into Antigravity — while keeping the default context window lean and giving users simple ways to add specialized packs on demand.

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- **Faithful MIT Port:** Package all **30 MIT-licensed Swift/Apple skill repositories** listed in `twostraws/Swift-Agent-Skills` (61 Apple/Swift skills total) into native Antigravity plugin bundles with clean attribution (`THIRD_PARTY_NOTICES.md` + per-plugin `NOTICE.md`).
- **Context-Window Discipline by Default:** Install only a lean, zero-overlap default core pack (**`swift-core`**, 5 skills) out of the box, with 7 modular optional packs (including heavy tool packs and an alternatives pack) so users only spend context tokens on capabilities they actually need.
- **Frictionless Installation (Terminal + Prompt):**
  - Zero-dependency one-line terminal installers for **macOS/Linux (`install.sh`)** and **Windows (`install.ps1`)** — requiring only stock OS tools (`curl` + `unzip` on macOS/Linux; stock Windows PowerShell 5.1 on Windows), with no Git, Node.js, Homebrew, or `agy` CLI required.
  - First-class **prompt-to-install** workflow inside Antigravity itself, powered by a concise agent-readable section in `INSTALL.md` / `README.md`.
  - Full compatibility with manual GitHub Release zip extraction, `agy plugin install`, workspace-scoped `.agents/plugins/`, and future Antigravity Marketplace submission.
- **Reproducible, CI-Verified Pipeline:** Mirror the battle-tested `momochisoundpost/win-dev-skills-antigravity` architecture (`antigravity/sources.json` pinned by commit SHA, zero-npm-dependency Node.js 22+ build/validation/packaging scripts, automated CI checks, and tag-driven GitHub Releases).

### Non-Goals
- **Bundling unlicensed upstream repos:** `twostraws/SwiftAgents` (`AGENTS.md`) and `daetojemax/figma-to-swiftui-skill` currently have no license file on GitHub. They will be linked in `README.md` with attribution and clear notes, **not** copied or redistributed.
- **Bundling unrelated non-Apple skills** that happen to coexist in multi-skill upstream repos (e.g., `react-component-performance`, `github`, `bug-hunt-swarm`, `review-swarm` in `Dimillian/Skills`; `5-steps`, `cleanse`, `critical-reasoning`, `navvy` in `andrewgleave/skills`). Only skills listed in `twostraws/Swift-Agent-Skills` are pulled.
- **Writing custom AI-generated skills, agents, or rules on top:** Honoring `twostraws/Swift-Agent-Skills`'s human-authored ethos, this port ships pure skill plugins faithful to the upstream authors' content (aside from minimal, auditable Claude/Codex→Antigravity runtime rewrites).
- **Installing Apple/CLI toolchains:** Skills that rely on macOS/Xcode, `idb`, Python, or `asc` CLI document their prerequisites rather than having the installer mutate system toolchains.

### Anti-Goals
- Enabling 60+ skills or competing concurrency/testing skills by default and bloating context on Google AI Plus/Pro plans.
- Leaving broken Claude-only runtime instructions (`.claude-plugin`, `AskUserQuestion`, broken relative paths) inside ported skills.
- Requiring beginners to install Node.js, Git, or `agy` CLI to use the port.
- Stripping POSIX executable bits (`+x`) from shell/Python helper scripts (e.g., `ios-simulator-skill` and `app-store-changelog`) in the release zip.
- Modifying `~/.gemini/config/config.json` or touching unrelated user plugins during install/uninstall.

---

## 3. Approaches Considered

| Approach | Summary | Tradeoffs | Decision |
|---|---|---|---|
| **1. Pinned Reproducible Bundles + Selective Modular Installer** | Pin all 30 MIT repos by commit SHA in `antigravity/sources.json`; build & validate native Antigravity plugins into `antigravity/plugins/<pack>/` and publish a single release zip; default installer extracts only `swift-core`, with flags/prompts to add optional packs (plus an `--all-disabled` flag for one-shot GUI toggling). | **Pros:** Single reliable GitHub Release download (immune to upstream repo moves/rate limits), tested Claude→Antigravity rewrites, `agy plugin install` & Marketplace-ready, tidy Customizations list, matches `win-dev-skills-antigravity`. **Cons:** Upstream updates require bumping pinned SHAs & cutting a release. | **Picked** *(user's choice)* |
| **2. Thin Catalog + Live Upstream Fetcher** | Repo holds only a `catalog.json` + installer that downloads skills live from the 30 upstream GitHub repos and wraps them locally. | **Pros:** Always tracks upstream HEAD; tiny repo. **Cons:** Fragile if any of 30 authors moves/renames a repo or path (one already transferred to `rorkai`); GitHub API rate limits for unauthenticated users; untestable rewrites; no release zip or Marketplace bundles. | Rejected |
| **3. Pinned Bundles + Install-All Shipped Disabled** | Same build pipeline as Approach 1, but default installer extracts all 8 packs upfront with optional packs set to `"disabled": true` in `plugin.json`. | **Pros:** Zero second command — one-click GUI toggling in Antigravity with 0 context cost while off. **Cons:** Clutters Installed list with 8 plugins immediately and downloads macOS-only simulator scripts onto Windows/Linux machines even if unused. | Available as optional `--all-disabled` flag in Approach 1 |

---

## 4. Constraints & Platform Details

- **Antigravity Plugin Specification:**
  - Each plugin lives in `plugins/<name>/` with a `plugin.json` manifest (allowed top-level keys: `$schema`, `name`, `displayName`, `description`, `version`, `disabled`, `logo`, `suggestedPrompts`, `skills`, `author`, `homepage`, `repository`, `license`, `keywords`, `extensions`).
  - `name` must be lowercase kebab-case and match the install directory name (`<dir>`).
  - Marketplace-ready required fields: `name`, `displayName`, `description`, `version`, `logo`, `suggestedPrompts` (3 entries), `author`. `displayName` must not begin with `Antigravity`/`Gemini`/`Claude`/`Cursor` or end in `Plugin`/`MCP`.
  - Global install path: `~/.gemini/config/plugins/<name>/` (macOS/Linux) or `%USERPROFILE%\.gemini\config\plugins\<name>\` (Windows).
  - Workspace install path: `<repo>/.agents/plugins/<name>/`.
  - Management links in Antigravity chat use `[<displayName>](customization://<dir>)` (never `plugin://`), and installers must never modify `~/.gemini/config/config.json`.
- **Upstream Normalization Quirks (verified across all 32 repos):**
  - **Root-level `SKILL.md` repos** (`arjitj2/swiftui-design-principles`, `TimBroddin/app-store-aso-skill`, `mhaviv/Swift-FocusEngine-Agent-Skill`, `jazzychad/ios-code-audit`) have `SKILL.md` at repo root and must be placed into `skills/<skill-dir>/` cleanly (excluding repo-root boilerplate like `.git`, `.github`, `.claude-plugin`, `LICENSE` — with license captured into `NOTICE.md`).
  - **Duplicate nested `SKILL.md` repos** (`twostraws/Swift-Concurrency-Agent-Skill`, `twostraws/Swift-Testing-Agent-Skill`) contain duplicate skill copies for Claude packaging; `sources.json` must pin one single canonical directory per skill.
  - **Transferred repo URL:** `rudrankriyam/app-store-connect-cli-skills` has moved to `rorkai/app-store-connect-cli-skills`; pin the canonical `rorkai` URL while noting the original credit.
  - **Executable scripts:** Repos with helper scripts (`conorluddy/ios-simulator-skill` [76 scripts], `Dimillian/Skills/app-store-changelog`, `efremidze/swift-architecture-skill`, `rgmez/apple-accessibility-skills`, `rorkai/app-store-connect-cli-skills`, etc.) must preserve Unix executable bits (`+x`) inside the release zip when packaged on Linux CI (`zip` / Info-ZIP external file attributes).
- **Local Development Repo Location *(my call)*:** Clone `https://github.com/momochisoundpost/Swift-Agent-Skills-Antigravity` into `C:\HANDY\CaitDev\Swift-Agent-Skills-Antigravity` so `C:\HANDY\CaitDev` stays organized if other projects are added alongside it.

---

## 5. Plugin Catalog Design (8 Modular Plugins, 30 MIT Repos, 61 Skills)

All plugin directory names use the `swift-` prefix so they namespace cleanly in `~/.gemini/config/plugins/` and never collide with built-in or unrelated user plugins.

| # | Plugin Dir (`name`) | Short Alias | Installed by Default? | Skills | Included Upstream MIT Skills *(all pinned by SHA)* |
|---|---|---|---|---:|---|
| 1 | **`swift-core`** | `core` | **Yes** | 5 | `twostraws/SwiftUI-Agent-Skill` (`swiftui-pro`), `twostraws/SwiftData-Agent-Skill` (`swiftdata-pro`), `twostraws/Swift-Concurrency-Agent-Skill` (`swift-concurrency-pro`), `twostraws/Swift-Testing-Agent-Skill` (`swift-testing-pro`), `Erikote04/Swift-API-Design-Guidelines-Agent-Skill` (`swift-api-design-guidelines`) |
| 2 | **`swift-ui-craft`** | `ui-craft` | Optional | 7 | `Dimillian/Skills` (`swiftui-ui-patterns`, `swiftui-view-refactor`, `swiftui-performance-audit`), `arjitj2/swiftui-design-principles` (`swiftui-design-principles`), `dadederk/iOS-Accessibility-Agent-Skill` (`ios-accessibility`), `andrewgleave/skills` (`writing-for-interfaces`), `mhaviv/Swift-FocusEngine-Agent-Skill` (`swift-focusengine-pro`) |
| 3 | **`swift-apple-frameworks`** | `frameworks` | Optional | 7 | `n0an/Swift-FormatStyle-Agent-Skill` (`swift-format-style`), `n0an/App-Intents-Agent-Skill` (`app-intents`), `n0an/Background-Execution-Agent-Skill` (`background-execution`), `n0an/Observability-Agent-Skill` (`observability`), `n0an/Widgets-Agent-Skill` (`widgets`), `AvdLee/Core-Data-Agent-Skill` (`core-data-expert`), `akshaypimprikar/ios-swiftdata-testing-agent-skill` (`swiftdata-testing`) |
| 4 | **`swift-quality`** | `quality` | Optional | 3 | `efremidze/swift-architecture-skill` (`swift-architecture-skill`), `ivan-magda/swift-security-skill` (`swift-security-expert`), `jazzychad/ios-code-audit` (`ios-code-audit`) |
| 5 | **`swift-app-store`** | `app-store` | Optional | 3 | `Dimillian/Skills` (`app-store-changelog`), `TimBroddin/app-store-aso-skill` (`app-store-aso`), `3paws-ai/mobile-ai-skills` (`appstore-review`) |
| 6 | **`swift-asc-cli`** | `asc-cli` | Optional | 26 | All 26 `asc-*` skills from `rorkai/app-store-connect-cli-skills` (`skills/asc-*`) — isolated so users who don't use `asc` CLI never pay the 26-skill context cost |
| 7 | **`swift-ios-simulator`** | `ios-simulator` | Optional | 1 | `conorluddy/ios-simulator-skill` (`ios-simulator-skill`, + 76 macOS helper scripts; documented as macOS/Xcode-only) |
| 8 | **`swift-extras`** | `extras` | Optional | 9 | Competing-author alternatives from the directory: `AvdLee/Swift-Concurrency-Agent-Skill` (`swift-concurrency`), `AvdLee/Swift-Testing-Agent-Skill` (`swift-testing-expert`), `Dimillian/Skills` (`swift-concurrency-expert`), `vanab/SwiftData-agent-skill` (`swiftdata-expert-skill`), `bocato/swift-testing-agent-skill` (`swift-testing`), `PasqualeVittoriosi/swift-accessibility-skill` (`swift-accessibility-skill`), `rgmez/apple-accessibility-skills` (`appkit-accessibility-auditor`, `swiftui-accessibility-auditor`, `uikit-accessibility-auditor`) |

**Conflict & Context-Window Notes *(my call)*:**
- Every skill directory name and `SKILL.md` frontmatter `name:` across all 8 plugins must be globally unique (verified by `validate.mjs --strict`), so even if someone installs `--all`, Antigravity never silently drops a skill on name collision.
- `swift-extras` README and installer output explicitly note that its skills offer alternative perspectives on Concurrency, Testing, SwiftData, and Accessibility already covered in `swift-core` / `swift-ui-craft` — users who prefer an alternate author can toggle `swift-core` off or use `swift-extras` selectively.
- The 2 unlicensed upstream repos (`twostraws/SwiftAgents` and `daetojemax/figma-to-swiftui-skill`) are documented in a clearly labeled **"Unbundled Community Links (No License Declared)"** section in `README.md` with links back to the original repos.

---

## 6. Architecture & Repository Layout

Modeled directly on `momochisoundpost/win-dev-skills-antigravity`, extended to support **multi-repo composition per plugin** (where one plugin pulls 1..N pinned skill directories from different upstream repos):

```text
Swift-Agent-Skills-Antigravity/
├── README.md                              # Community port docs, install one-liners, prompt box, pack table, upstream credits
├── INSTALL.md                             # Dedicated human + AI-agent (Antigravity) installation & pack-management guide
├── THIRD_PARTY_NOTICES.md                 # Generated consolidated MIT license & copyright notices for all 30 upstream repos
├── CHANGELOG-antigravity.md               # Port release history
├── RELEASING-antigravity.md               # Maintainer sync & release checklist
├── LICENSE                                # MIT License (preserved from upstream fork)
├── CODE_OF_CONDUCT.md                     # Preserved from upstream fork
├── install.sh                             # macOS / Linux zero-dependency one-line installer
├── install.ps1                            # Windows PowerShell 5.1+ / pwsh zero-dependency one-line installer
├── assets/logo.svg                        # Preserved from upstream fork
├── docs/superpowers/specs/                # Approved design specs
├── antigravity/
│   ├── sources.json                       # Pinned upstream repos (repo URL, ref, commit SHA, skill subpath(s), license, author)
│   ├── rewrites.json                      # Declarative find/replace Claude/Codex->Antigravity rewrites + allowlist
│   ├── overrides/<pack>/                  # Hand-authored plugin.json, README.md, assets/logo.svg per pack
│   └── plugins/<pack>/                    # Generated & committed native Antigravity plugin bundles (CI-checked)
│       ├── plugin.json
│       ├── README.md
│       ├── NOTICE.md                      # Generated per-plugin upstream MIT attributions + pinned SHAs
│       ├── assets/logo.svg
│       └── skills/<skill-name>/
│           ├── SKILL.md
│           ├── references/...
│           └── scripts/...
├── scripts/
│   ├── antigravity/
│   │   ├── build.mjs                      # Fetch pinned SHAs via git archive, stage skills, apply rewrites, emit plugins + notices
│   │   ├── validate.mjs                   # Strict manifest, frontmatter, uniqueness, host-leak, notice, and script-mode checks
│   │   ├── package-release.mjs            # Build swift-agent-skills-antigravity.zip preserving POSIX executable bits
│   │   ├── sync-upstream.mjs              # Optional helper to check upstream HEAD SHAs and report/update sources.json
│   │   ├── frontmatter.mjs                # YAML frontmatter parser/serializer (zero deps)
│   │   └── lib.mjs                        # Shared file/diff/host-reference utilities
│   └── tests/                             # Node built-in test runner tests (frontmatter, build, validate, install.sh/ps1, zip)
└── .github/workflows/
    ├── antigravity-ci.yml                 # PR/push: build --check, validate --strict, unit + installer tests
    └── antigravity-release.yml            # Tag v*: verify, build zip, publish GitHub Release
```

### Multi-Repo `antigravity/sources.json` Schema *(my call)*
Unlike `win-dev-skills-antigravity` (where 1 plugin maps to 1 upstream folder), each plugin entry in `antigravity/sources.json` defines an array of `skills` entries:
- Single-skill entry: `{ "skillDir": "swiftui-pro", "repo": "https://github.com/twostraws/SwiftUI-Agent-Skill.git", "ref": "main", "sha": "<40-hex>", "path": "swiftui-pro", "author": "Paul Hudson", "license": "MIT" }`
  - For root-level `SKILL.md` repos, `"path": "."` extracts the repo root and copies `SKILL.md` plus `references/`, `scripts/`, `examples/`, `resources/`, `assets/` (skipping `.git*`, `.claude-plugin`, `.github`, `README.md`, `LICENSE*`, `CONTRIBUTING.md`, etc. — while reading `LICENSE*` into `NOTICE.md`).
- Multi-skill glob/list entry (for `swift-asc-cli` and `rgmez`): either explicit `skills` list or `"multiSkillDir": "skills"` with `"include": ["asc-*"]` so `build.mjs` stays declarative and deterministic.
- `build.mjs` caches shallow bare/no-checkout clones by owner+repo (not just repo basename, avoiding collisions like `Skills` vs `skills`!) in `.cache/antigravity-upstreams` (gitignored) and supports `--check` (builds into a temp directory and diffs against committed `antigravity/plugins/` + `THIRD_PARTY_NOTICES.md`).

---

## 7. Installer & Prompt-to-Install UX

### Terminal One-Liners
- **macOS / Linux (`install.sh` — POSIX `sh` / `bash`, needs only `curl` and `unzip`):**
  ```bash
  # Default: installs swift-core only (5 skills, lean context)
  curl -fsSL https://raw.githubusercontent.com/momochisoundpost/Swift-Agent-Skills-Antigravity/main/install.sh | sh

  # Add optional packs (accepts full swift-* names or short aliases)
  curl -fsSL https://raw.githubusercontent.com/momochisoundpost/Swift-Agent-Skills-Antigravity/main/install.sh | sh -s -- --packs core,ui-craft,frameworks

  # Install all packs, keeping optional packs disabled in UI until toggled on (0 extra context)
  curl -fsSL https://raw.githubusercontent.com/momochisoundpost/Swift-Agent-Skills-Antigravity/main/install.sh | sh -s -- --all-disabled

  # Workspace-only install (.agents/plugins/ in current repo)
  curl -fsSL https://raw.githubusercontent.com/momochisoundpost/Swift-Agent-Skills-Antigravity/main/install.sh | sh -s -- --workspace --packs core,ios-simulator

  # List packs / uninstall
  curl -fsSL https://raw.githubusercontent.com/momochisoundpost/Swift-Agent-Skills-Antigravity/main/install.sh | sh -s -- --list
  curl -fsSL https://raw.githubusercontent.com/momochisoundpost/Swift-Agent-Skills-Antigravity/main/install.sh | sh -s -- --uninstall --packs ios-simulator
  ```
- **Windows (`install.ps1` — built-in Windows PowerShell 5.1+ & `pwsh`, zero extra deps):**
  ```powershell
  # Default: installs swift-core only
  irm https://raw.githubusercontent.com/momochisoundpost/Swift-Agent-Skills-Antigravity/main/install.ps1 | iex

  # Add packs / all-disabled / workspace / list / uninstall
  & ([scriptblock]::Create((irm https://raw.githubusercontent.com/momochisoundpost/Swift-Agent-Skills-Antigravity/main/install.ps1))) -Packs core,ui-craft,frameworks
  & ([scriptblock]::Create((irm https://raw.githubusercontent.com/momochisoundpost/Swift-Agent-Skills-Antigravity/main/install.ps1))) -AllDisabled
  & ([scriptblock]::Create((irm https://raw.githubusercontent.com/momochisoundpost/Swift-Agent-Skills-Antigravity/main/install.ps1))) -Workspace
  & ([scriptblock]::Create((irm https://raw.githubusercontent.com/momochisoundpost/Swift-Agent-Skills-Antigravity/main/install.ps1))) -List
  & ([scriptblock]::Create((irm https://raw.githubusercontent.com/momochisoundpost/Swift-Agent-Skills-Antigravity/main/install.ps1))) -Uninstall -Packs ui-craft
  ```

### Installer Behavior Contract *(my call)*
- **Default selection:** `swift-core` only (5 skills).
- **Additive installs:** Running the installer with `--packs ui-craft` installs/updates `swift-ui-craft` **without** removing `swift-core` or any other installed packs.
- **`--all-disabled` / `-AllDisabled`:** Installs all 8 packs and injects `"disabled": true` into the installed copy of `plugin.json` for every pack except `swift-core` (leaving existing user toggles in `config.json` untouched, since Antigravity gives `config.json` precedence).
- **`--uninstall` / `-Uninstall`:**
  - If `--packs` is passed: removes only those specified `swift-*` pack directories.
  - If `--packs` is omitted: removes all installed `swift-*` packs from this project (never touches non-project plugins or `config.json`).
- **Release resolution & offline/test support:** Downloads `swift-agent-skills-antigravity.zip` from the latest GitHub Release (or `--version vX.Y.Z`), plus supports `--from-zip <local-path>` / `-FromZip <local-path>` for automated tests and offline installs.
- **No elevation required:** Writes only to the user's home plugin directory or specified workspace directory.
- **Fallback notice on pre-release:** Before the first `v*` GitHub Release is published, `--version` fails cleanly with a helpful message pointing to Releases or local `agy plugin install` from a clone.

### Prompt-to-Install inside Antigravity
- `README.md` prominently displays a one-line prompt users can paste directly into Antigravity:
  > *"Install Swift Agent Skills from https://github.com/momochisoundpost/Swift-Agent-Skills-Antigravity (default `swift-core` pack, and show me the optional packs I can add later)."*
- `INSTALL.md` includes a structured **"Instructions for Antigravity"** section telling the agent:
  1. Detect the user's OS and run `install.sh` (macOS/Linux) or `install.ps1` (Windows) with the user's requested packs (defaulting to `swift-core` to save context).
  2. Never hand-edit `~/.gemini/config/config.json`.
  3. Confirm installed packs and present clickable `[<displayName>](customization://<pack>)` links so the user can inspect or toggle them live in **Customizations → Installed** (no restart needed).

---

## 8. Validation, Testing & Release Automation

- **`validate.mjs --strict`** checks every generated plugin for:
  - Valid `plugin.json` with only allowed keys, all Marketplace-required fields, `name === dirName`, valid `logo` path/extension, exactly 3 `suggestedPrompts`, `displayName` naming rules.
  - Valid `SKILL.md` YAML frontmatter (`name` + non-empty `description`) on every skill; `name` matches or cleanly normalizes to kebab-case; **zero duplicate `SKILL.md` names** across all 8 plugins.
  - Zero unallowlisted host-specific leaks (`Claude Code`, `.claude-plugin`, `AskUserQuestion`, `TodoWrite`, etc.) in `SKILL.md` and `references/`.
  - Presence of `NOTICE.md` in every plugin and `THIRD_PARTY_NOTICES.md` at repo root.
  - No leftover repo boilerplate (`.claude-plugin`, `.git`, `.DS_Store`) inside `antigravity/plugins/`.
- **Automated Tests (`scripts/tests/`):**
  - Frontmatter parser/serializer tests.
  - Build reproducibility (`build.mjs --check`) and multi-repo fixture tests.
  - Strict validator negative/positive tests.
  - Installer tests running `install.ps1` (and `install.sh` on POSIX/CI) against a real packaged zip into an isolated temp `HOME`/`USERPROFILE` verifying default `swift-core`, `--packs`, `--all-disabled`, `--workspace`, `--list`, `--uninstall`, and preservation of sibling plugins.
  - Release zip test verifying archive structure and preserved POSIX `+x` mode bits on helper scripts.
- **GitHub Actions:**
  - `antigravity-ci.yml`: runs on push/PR across `ubuntu-latest` (runs `build --check`, `validate --strict`, Node tests, `install.sh` tests, zip mode check) and `windows-latest` (`install.ps1` tests).
  - `antigravity-release.yml`: triggered on `v*` tags; runs full verification, packages `swift-agent-skills-antigravity.zip` (via `package-release.mjs` preserving Unix executable bits), and creates the GitHub Release via `gh release create`.
- **Delivery & Release Gate *(decided by user)*:**
  - Implement on a feature branch in `C:\HANDY\CaitDev\Swift-Agent-Skills-Antigravity`, commit this spec to `docs/superpowers/specs/2026-11-20-swift-agent-skills-antigravity-design.md`, verify locally on Windows, push the branch and open a PR against `main` so GitHub Actions CI runs and passes on **both** `ubuntu-latest` (`install.sh`, zip POSIX permissions, build/validate) and `windows-latest` (`install.ps1`), then **pause for user review** of the PR (README, logos, rewrites, notices) before merging to `main` and tagging/publishing `v1.0.0`.

---

## 9. What's Left to the Builder

- Designing clean, square, high-contrast `assets/logo.svg` icons for each of the 8 plugin packs (consistent Swift/Apple visual language, ≥128x128 viewBox, ~10% inner padding).
- Auditing all 61 fetched upstream skills during initial build to populate exact entries in `antigravity/rewrites.json` (and allowlisting legitimate non-runtime mentions like reading a repo's existing `CLAUDE.md`).
- Writing the 3 `suggestedPrompts`, concise `description`, `displayName`, `keywords`, and per-plugin `README.md` for each of the 8 packs.
- Structuring internal helper modules under `scripts/antigravity/` and test fixtures under `scripts/tests/`.
- Implementing `sync-upstream.mjs` ergonomics for future maintainer updates.
