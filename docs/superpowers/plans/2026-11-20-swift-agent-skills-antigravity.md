# Swift Agent Skills for Antigravity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the 30 MIT-licensed upstream skill repos listed in `twostraws/Swift-Agent-Skills` (61 skills) into 8 modular, natively installable Google Antigravity plugins, with zero-dependency installers for macOS/Linux and Windows, a prompt-to-install guide, and CI that verifies everything on a PR before `v1.0.0`.

**Architecture:** `antigravity/sources.json` pins every upstream repo by commit SHA. A zero-npm-dependency Node build reads upstream files straight out of git objects (`git ls-tree` / `git cat-file`, never a checkout), so modes, symlinks and line endings come out the same on Windows and Linux. It writes committed plugin bundles to `antigravity/plugins/` plus attribution notices. A strict validator, a pure-Node zip packager, and two installers (`install.sh`, `install.ps1`) consume those bundles. GitHub Actions re-runs the build in `--check` mode on Ubuntu and Windows.

**Tech Stack:** Node.js 22+ (`node:test`, `node:zlib` incl. `zlib.crc32`, `node:child_process`), git CLI, POSIX `sh` + `curl` + `unzip`, Windows PowerShell 5.1+ (.NET `System.IO.Compression`), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-20-swift-agent-skills-antigravity-design.md`

**Reference implementation (same author, read for patterns, don't copy blindly):** `https://github.com/momochisoundpost/win-dev-skills-antigravity` at `aa5f34db17765650d048fa6be7fc706b4a265420`, mainly `scripts/antigravity/{lib,build,validate}.mjs` and `install.ps1`.

## Global Constraints

- Work on branch `feat/antigravity-port` in `C:\HANDY\CaitDev\Swift-Agent-Skills-Antigravity`. Commit after every task.
- Node.js 22+. **Zero npm dependencies.** No `package.json` needed; every script is `.mjs`. Tests use `node:test` + `node:assert/strict` and run with `node --test scripts/tests/`.
- No Python anywhere in the toolchain (the dev machine has no `python3`). The zip is written in pure Node.
- Release asset name: `swift-agent-skills-antigravity.zip`. Repo slug: `momochisoundpost/Swift-Agent-Skills-Antigravity`.
- Plugin dirs (= `plugin.json` `name`): `swift-core`, `swift-ui-craft`, `swift-apple-frameworks`, `swift-quality`, `swift-app-store`, `swift-asc-cli`, `swift-ios-simulator`, `swift-extras`. Aliases: `core`, `ui-craft`, `frameworks`, `quality`, `app-store`, `asc-cli`, `ios-simulator`, `extras`.
- Skill directory names = the upstream `SKILL.md` frontmatter `name`, verbatim (for example `swift-api-design-guidelines-skill`, `app-store-aso`, `swift-focusengine-pro`). Upstream `SKILL.md` frontmatter is never re-serialized. It's only parsed to validate. Text changes come only from `antigravity/rewrites.json`.
- Allowed `plugin.json` keys: `$schema`, `name`, `displayName`, `description`, `version`, `disabled`, `logo`, `suggestedPrompts`, `skills`, `author`, `homepage`, `repository`, `license`, `keywords`, `extensions`. Generated manifests must **not** contain `disabled` (only the installer injects it). `$schema` = `https://antigravity.google/schemas/v1/plugin.json`.
- Marketplace-required fields: `name`, `displayName`, `description`, `version` (`1.0.0`), `logo` (`assets/logo.svg`), `suggestedPrompts` (exactly 3), `author` (`{"name":"momochisoundpost","url":"https://github.com/momochisoundpost"}`). `displayName` must not start with Antigravity/Gemini/Claude/Cursor or end with Plugin/MCP.
- Installers never read or write `~/.gemini/config/config.json`, need no elevation, and only touch the 8 known pack directories.
- Default install = `swift-core` only. Global destination: `~/.gemini/config/plugins/` (Windows `%USERPROFILE%\.gemini\config\plugins\`). Workspace destination: `<cwd>/.agents/plugins/`.
- Do not bundle `twostraws/SwiftAgents` or `daetojemax/figma-to-swiftui-skill` (no license). Link them in README only.
- Line endings: the repo is LF everywhere (`.gitattributes`), and build output normalizes text files to LF. The dev machine has `core.autocrlf=true`, so git must never be the thing that produces the content the build compares.
- Stop after the PR's CI is green on both `ubuntu-latest` and `windows-latest`. **Do not merge, tag, or publish a release.**

## Review Focus

1. **Re-running or adding packs:** `--packs ui-craft` after a default install must leave `swift-core` and every non-swift plugin in place. Tests are in Tasks 7 and 8.
2. **Uninstall scope:** `--uninstall` with no `--packs` removes only the 8 known pack dirs. A foreign `swift-foo/` or `superpowers/` folder must survive. Tests are in Tasks 7 and 8.
3. **Failed download or corrupt zip:** existing installed packs must be untouched and the exit code non-zero. Extract fully to a temp dir before touching the destination. Tests are in Tasks 7 and 8 (corrupt `--from-zip`).
4. **Paths with spaces** (`C:\Users\John Doe`, `~/My Projects/app`) for both the destination and `--from-zip`. Tests are in Tasks 7 and 8.
5. **Messy pack input:** `--packs " Core,UI-Craft "` normalizes to `swift-core,swift-ui-craft`, and an unknown name (`--packs core,bogus`) exits non-zero, lists valid packs, and installs nothing. Tests are in Tasks 7 and 8.

---

## File Structure

```text
.gitattributes / .gitignore                      Task 1
scripts/antigravity/lib.mjs                      Task 1  file listing, text normalization, dir diff, host-ref scan
scripts/antigravity/frontmatter.mjs              Task 1  read-only SKILL.md frontmatter reader
scripts/antigravity/upstream.mjs                 Task 2  git object access (fetch pinned SHA, ls-tree, cat-file, glob, ls-remote)
scripts/antigravity/build.mjs                    Task 3  compose plugins + notices + EXECUTABLES.txt, --check
scripts/antigravity/validate.mjs                 Task 4  strict validation
scripts/antigravity/zip.mjs                      Task 5  pure-Node zip writer/reader
scripts/antigravity/package-release.mjs          Task 5  release zip
antigravity/sources.json                         Task 6  pinned catalog
antigravity/rewrites.json                        Task 6  host rewrites + allowlist
antigravity/overrides/<pack>/{plugin.json,README.md,assets/logo.svg}   Task 6
antigravity/plugins/**  + THIRD_PARTY_NOTICES.md Task 6  generated, committed
install.ps1                                      Task 7
install.sh                                       Task 8
scripts/antigravity/sync-upstream.mjs            Task 9
README.md, INSTALL.md, CHANGELOG-antigravity.md, RELEASING-antigravity.md   Task 10
.github/workflows/antigravity-ci.yml, antigravity-release.yml               Task 11
scripts/tests/*.test.mjs, scripts/tests/helpers.mjs                         every task
```

---

### Task 1: Repo hygiene, shared utilities, frontmatter reader

**Files:**
- Create: `.gitattributes`, `scripts/antigravity/lib.mjs`, `scripts/antigravity/frontmatter.mjs`
- Modify: `.gitignore`
- Test: `scripts/tests/lib.test.mjs`, `scripts/tests/frontmatter.test.mjs`

**Interfaces:**
- Produces (`lib.mjs`):
  - `ANTIGRAVITY_SCHEMA_URL = "https://antigravity.google/schemas/v1/plugin.json"`
  - `ALLOWED_MANIFEST_KEYS: Set<string>` and `MARKETPLACE_REQUIRED_KEYS: string[]` (exact sets from Global Constraints, single source of truth for `build.mjs` and `validate.mjs`)
  - `TEXT_EXTENSIONS: Set<string>` = `.md .txt .json .yaml .yml .sh .bash .zsh .py .rb .js .mjs .cjs .ts .swift .m .h .toml .xml .plist .html .css .svg .csv .gitignore`
  - `isTextPath(relPath: string): boolean`
  - `normalizeText(data: Buffer, relPath: string): Buffer`: turns CRLF/CR into LF for text paths and leaves everything else untouched
  - `listFilesRelative(rootDir: string): string[]`: sorted POSIX paths, skips `.DS_Store`
  - `diffDirectories(dirA: string, dirB: string): string[]`: `+ path`, `- path`, `M path` by SHA-256 of contents (no mode comparison, since Windows has no POSIX modes)
  - `HOST_REF_PATTERN: RegExp` = `/claude|codex|copilot|openai\.yaml|AskUserQuestion|TodoWrite|allowed-tools/gi` (deliberately **not** `cursor`, which shows up legitimately in UI/accessibility text)
  - `findHostReferences(rootDir: string, allowlist: Array<{plugin?:string,file:string,pattern:string}>, pluginName?: string): Array<{file,line,match,text}>`: scans `.md .json .yaml .yml` and skips `NOTICE.md`
- Produces (`frontmatter.mjs`): `readSkillFrontmatter(markdown: string): { name: string, description: string }`. It throws `Missing YAML frontmatter` / `Missing name` / `Missing description`. It supports plain, single- or double-quoted, and `>`/`>-`/`|`/`|-` block scalars, and **skips indented nested maps** (for example `metadata:\n  author: X`) without throwing.

- [ ] **Step 1: Write the failing tests**

```js
// frontmatter.test.mjs
test("reads plain name and description", () => {
  assert.deepEqual(readSkillFrontmatter("---\nname: swiftui-pro\ndescription: Reviews SwiftUI.\n---\nBody"),
    { name: "swiftui-pro", description: "Reviews SwiftUI." });
});
test("skips nested metadata map", () => {
  const md = "---\nname: a\ndescription: d\nlicense: MIT\nmetadata:\n  author: Paul Hudson\n  version: \"2.0.0\"\n---\n";
  assert.equal(readSkillFrontmatter(md).name, "a");
});
test("folded block description and CRLF", () => {
  const md = "---\r\nname: x\r\ndescription: >-\r\n  line one\r\n  line two\r\n---\r\n";
  assert.equal(readSkillFrontmatter(md).description, "line one line two");
});
test("quoted values", () => {
  assert.equal(readSkillFrontmatter("---\nname: \"q\"\ndescription: 'it''s'\n---\n").description, "it's");
});
test("throws without frontmatter / name / description", () => {
  assert.throws(() => readSkillFrontmatter("# no fm"), /Missing YAML frontmatter/);
  assert.throws(() => readSkillFrontmatter("---\ndescription: d\n---\n"), /Missing name/);
  assert.throws(() => readSkillFrontmatter("---\nname: n\n---\n"), /Missing description/);
});
// lib.test.mjs
test("normalizeText converts CRLF only for text paths", () => {
  assert.equal(normalizeText(Buffer.from("a\r\nb\r"), "x.md").toString(), "a\nb\n");
  const bin = Buffer.from([0x0d, 0x0a, 0x00]);
  assert.deepEqual(normalizeText(bin, "x.png"), bin);
});
test("diffDirectories reports added, missing, modified", () => { /* tmp dirs: a/{same,changed,onlyA} b/{same,changed*,onlyB} */
  assert.deepEqual(diffDirectories(a, b), ["M changed", "- onlyA (missing in second directory)", "+ onlyB (only in second directory)"].sort());
});
test("findHostReferences flags claude and honors allowlist, ignores cursor", () => {
  // dir with SKILL.md lines: "Use with Claude Code", "move the text cursor", "Check CLAUDE.md"
  const hits = findHostReferences(dir, [{ file: "SKILL.md", pattern: "CLAUDE.md" }]);
  assert.deepEqual(hits.map(h => h.line), [1]);
});
```

- [ ] **Step 2: Run, expect FAIL** (`node --test scripts/tests/`, module not found)

- [ ] **Step 3: Implement `lib.mjs` and `frontmatter.mjs`** to the interfaces above. `diffDirectories` output order follows sorted path. Each line is `+ ${p} (only in second directory)`, `- ${p} (missing in second directory)`, or `M ${p}`.

- [ ] **Step 4: Repo hygiene.** `.gitattributes`:

```text
* text=auto eol=lf
*.png binary
*.jpg binary
*.zip binary
```

Append `.cache/` and `*.zip` to `.gitignore`. Then run `git add --renormalize .`.

- [ ] **Step 5: Run tests, expect PASS.** Then commit `chore: add shared build utilities and LF normalization`.

---

### Task 2: Upstream git-object access

**Files:**
- Create: `scripts/antigravity/upstream.mjs`, `scripts/tests/helpers.mjs`
- Test: `scripts/tests/upstream.test.mjs`

**Interfaces:**
- Produces (`upstream.mjs`). Every git call is run as `git -c core.autocrlf=false -c core.eol=lf ...` through `spawnSync` with `maxBuffer: 256 MiB`:
  - `cacheKeyForRepo(repoUrl: string): string`: `https://github.com/Dimillian/Skills.git` → `Dimillian__Skills` (owner and repo, so `Dimillian/Skills` and `andrewgleave/skills` never collide, even on case-insensitive disks)
  - `ensureCommit({ repoUrl, sha, cacheDir }): string`: returns a bare git dir at `<cacheDir>/<cacheKey>.git`. It runs `git init --bare` if missing, skips the fetch when `git cat-file -e <sha>^{commit}` succeeds, and otherwise runs `git fetch --depth=1 <repoUrl> <sha>`. Throws if the SHA is still missing.
  - `listTree(gitDir, sha, subpath): Array<{ path: string, mode: string }>`: `git ls-tree -r -z <sha> -- <subpath>` (whole tree when subpath is `.`). It returns blob and symlink entries with `path` relative to `subpath` and `mode` as one of `100644`, `100755`, or `120000`.
  - `readBlob(gitDir, sha, fullPath): Buffer`: `git cat-file blob <sha>:<fullPath>` (raw bytes, no smudge or EOL conversion)
  - `resolveGlob(gitDir, sha, pattern): string[]`: the pattern is `<dir>/<prefix>*` with a single trailing `*` only. It returns sorted child dirs that contain `SKILL.md`.
  - `lsRemoteHead(repoUrl, ref): string`: SHA from `git ls-remote <repoUrl> refs/heads/<ref>`
- Produces (`helpers.mjs`, tests only):
  - `makeTempDir(prefix): string`
  - `makeFixtureRepo(files: Record<string, string | {data: string, mode?: "100755"} | {symlink: string}>): { url: string, sha: string }`: creates a non-bare repo in a temp dir, commits with fixed author/date env, and returns a `file://` URL. Symlinks are created with `git update-index --add --cacheinfo 120000,<blob>,<path>` so the fixture works on Windows without symlink privileges.

- [ ] **Step 1: Write failing tests**

```js
test("cacheKeyForRepo is owner__repo", () => {
  assert.equal(cacheKeyForRepo("https://github.com/Dimillian/Skills.git"), "Dimillian__Skills");
  assert.equal(cacheKeyForRepo("https://github.com/andrewgleave/skills"), "andrewgleave__skills");
});
test("ensureCommit + listTree + readBlob roundtrip with modes and symlinks", () => {
  const { url, sha } = makeFixtureRepo({
    "skill/SKILL.md": "---\r\nname: skill\r\ndescription: d\r\n---\r\n",
    "skill/scripts/run.sh": { data: "#!/bin/sh\necho hi\n", mode: "100755" },
    "skill/link": { symlink: "SKILL.md" },
  });
  const gitDir = ensureCommit({ repoUrl: url, sha, cacheDir: makeTempDir("cache-") });
  const tree = listTree(gitDir, sha, "skill");
  assert.deepEqual(tree.map(e => [e.path, e.mode]),
    [["SKILL.md", "100644"], ["link", "120000"], ["scripts/run.sh", "100755"]]);
  assert.match(readBlob(gitDir, sha, "skill/SKILL.md").toString(), /\r\n/); // raw bytes preserved
});
test("ensureCommit is idempotent and offline on second call", () => { /* second call with bogus repoUrl still succeeds because sha is cached */ });
test("resolveGlob returns only dirs containing SKILL.md", () => {
  // skills/asc-a/SKILL.md, skills/asc-b/SKILL.md, skills/asc-c/notes.md, skills/other/SKILL.md
  assert.deepEqual(resolveGlob(gitDir, sha, "skills/asc-*"), ["skills/asc-a", "skills/asc-b"]);
});
test("ensureCommit throws on unknown sha", () => {
  assert.throws(() => ensureCommit({ repoUrl: url, sha: "0".repeat(40), cacheDir }), /sha|commit/i);
});
```

- [ ] **Step 2: Run, expect FAIL**
- [ ] **Step 3: Implement `upstream.mjs` and `helpers.mjs`**
- [ ] **Step 4: Run, expect PASS.** Then commit `feat: read pinned upstream skills from git objects`.

---

### Task 3: Plugin builder (`build.mjs`)

**Files:**
- Create: `scripts/antigravity/build.mjs`
- Test: `scripts/tests/build.test.mjs`

**Interfaces:**
- Consumes: Task 1 `lib.mjs`, `frontmatter.mjs`; Task 2 `upstream.mjs`.
- `sources.json` schema (exact):

```json
{
  "upstreams": {
    "<owner>/<repo>": { "repo": "https://github.com/<owner>/<repo>.git", "ref": "main", "sha": "<40-hex>",
                        "license": "LICENSE", "author": "Name", "credit": "optional note" }
  },
  "plugins": {
    "<pack>": { "skills": [
      { "upstream": "<owner>/<repo>", "path": "dir/in/repo or .", "exclude": ["optional/extra/prefix"] },
      { "upstream": "<owner>/<repo>", "glob": "skills/asc-*" }
    ] }
  }
}
```

- `rewrites.json` schema: `{ "rewrites": [{ "plugin", "file", "find", "replace" }], "allowlist": [{ "plugin", "file", "pattern" }] }`. Here `file` is relative to the plugin dir (for example `skills/ios-simulator-skill/SKILL.md`).
- Produces: `buildAll({ repoRoot, sourcesPath?, rewritesPath?, overridesRoot?, outputRoot?, noticesPath?, check = false, cacheDir? }): Promise<{ plugins: string[], skillCount: number }>`. The defaults are `antigravity/sources.json`, `antigravity/rewrites.json`, `antigravity/overrides`, `antigravity/plugins`, `<repoRoot>/THIRD_PARTY_NOTICES.md`, and cacheDir `process.env.SWIFT_AGENT_SKILLS_CACHE_DIR || <repoRoot>/.cache/upstreams`.
- CLI: `node scripts/antigravity/build.mjs [--check] [--cache-dir DIR]`. It prints `Built|Verified 8 plugins, 61 skills`.
- Output contract, where `<out>` = `outputRoot`:
  - `<out>/<pack>/plugin.json`: override manifest filtered to the allowed keys, with `$schema` first, written as `JSON.stringify(m, null, 2) + "\n"`. Throws if the override contains `disabled`.
  - `<out>/<pack>/README.md` and `<out>/<pack>/assets/**` are copied from overrides. `README.md` and `assets/logo.svg` are required.
  - `<out>/<pack>/skills/<frontmatter name>/**`: the skill dir is named from `readSkillFrontmatter(SKILL.md).name`. For a `path` entry, if `basename(path)` (or the repo name for `.`) differs from that name, the frontmatter name wins.
  - `<out>/<pack>/NOTICE.md`: header `# Third-Party Notices (<pack>)`, then a community-port disclaimer line. For each skill, one line `- <skill>: <repoUrl without .git> @ <sha> (path: <path>) by <author>, MIT`, followed by each distinct upstream's full license text under `## <owner>/<repo>`.
  - `<out>/EXECUTABLES.txt`: sorted `<pack>/skills/<skill>/<rel>` for every kept upstream entry that has git mode `100755` **or** matches `scripts/**/*.sh`, one per line, LF, trailing newline.
  - `<out>/GENERATED.md`: do-not-edit banner pointing to `sources.json`, `overrides/`, and `rewrites.json`.
  - `noticesPath` (`THIRD_PARTY_NOTICES.md`): every upstream sorted by key, with `## <owner>/<repo>`, a line `Pinned commit: <sha>`, and the license text. The `twostraws/Swift-Agent-Skills` directory credit comes first.
- File selection per skill entry. Paths are relative to the skill dir:
  - Always skip symlinks (`120000`), `.DS_Store`, any path segment starting with `.git`, `.claude-plugin/`, `.github/`, top-level `agents/`, top-level `skills/` (the nested Claude duplicates in `twostraws/*-pro`), and `CLAUDE.md` anywhere.
  - When `path` is `.`, also skip top-level `LICENSE*`, `README*`, `CONTRIBUTING*`, `CHANGELOG*`, `CODE_OF_CONDUCT*`, `assets/`, `docs/`, `tests/`, `test/`, `evals/`.
  - Then skip anything matching the entry's `exclude` prefixes.
  - Every kept file is passed through `normalizeText`.
- Order of operations per pack: copy skills, then manifest/README/assets, then notices, then `applyRewrites` (normalize the target to LF, require `find` to be present or throw `Rewrite did not match`, use `replaceAll`), then `findHostReferences(packDir, allowlist, pack)`. Any hits throw `Host-specific reference detected` listing `pack/file:line [match] text`.
- Global build errors: a duplicate skill name across all packs (`Duplicate skill name '<n>' in <packA> and <packB>`), a missing `SKILL.md`, or an unknown `upstream` key.
- `--check` builds into a temp dir and runs `diffDirectories(temp/plugins, outputRoot)` plus a byte comparison of the notices file. Any diff throws `out of sync` with the diff lines. Without `--check`, it replaces `outputRoot` and writes the notices file.

- [ ] **Step 1: Write failing tests** (fixture upstreams from `makeFixtureRepo`, fixture overrides written to a temp dir)

```js
test("builds a pack from path and glob entries with renaming, excludes and LF", async () => {
  // upstream A: "pro/SKILL.md"(name: a-pro, CRLF), "pro/references/x.md", "pro/skills/a-pro/SKILL.md", "pro/.claude-plugin/plugin.json",
  //             "pro/agents/openai.yaml", "pro/scripts/run.sh"(100755), "pro/refs-link"(symlink), "LICENSE"
  // upstream B (root-level): "SKILL.md"(name: b-root), "README.md", "LICENSE", "assets/logo.svg", "references/y.md"
  // upstream C: "skills/asc-one/SKILL.md", "skills/asc-two/SKILL.md"
  const { plugins, skillCount } = await buildAll({ repoRoot, cacheDir, ... });
  assert.deepEqual(plugins, ["fixture-pack"]); assert.equal(skillCount, 4);
  assert.deepEqual(listFilesRelative(join(out, "fixture-pack/skills")), [
    "a-pro/SKILL.md", "a-pro/references/x.md", "a-pro/scripts/run.sh",
    "asc-one/SKILL.md", "asc-two/SKILL.md", "b-root/SKILL.md", "b-root/references/y.md"]);
  assert.doesNotMatch(readFileSync(join(out, "fixture-pack/skills/a-pro/SKILL.md"), "utf8"), /\r/);
  assert.equal(readFileSync(join(out, "EXECUTABLES.txt"), "utf8"), "fixture-pack/skills/a-pro/scripts/run.sh\n");
  const manifest = JSON.parse(readFileSync(join(out, "fixture-pack/plugin.json"), "utf8"));
  assert.equal(Object.keys(manifest)[0], "$schema");
  assert.match(readFileSync(join(out, "fixture-pack/NOTICE.md"), "utf8"), /@ [0-9a-f]{40}/);
});
test("applies rewrites, and fails on unmatched rewrite", async () => { /* find 'Claude Code' -> 'Antigravity'; then a bogus find -> /Rewrite did not match/ */ });
test("fails on host reference unless allowlisted", async () => { /* /Host-specific reference detected/ */ });
test("fails on duplicate skill names across packs", async () => { /* /Duplicate skill name 'a-pro'/ */ });
test("fails when override plugin.json contains disabled", async () => { /* /disabled/ */ });
test("--check passes on fresh output and fails after a manual edit", async () => {
  await buildAll({ ..., check: false });
  await buildAll({ ..., check: true });
  appendFileSync(join(out, "fixture-pack/README.md"), "edit");
  await assert.rejects(buildAll({ ..., check: true }), /out of sync[\s\S]*M fixture-pack\/README\.md/);
});
```

- [ ] **Step 2: Run, expect FAIL**
- [ ] **Step 3: Implement `build.mjs`**
- [ ] **Step 4: Run, expect PASS.** Then commit `feat: compose Antigravity plugins from pinned upstream skills`.

---

### Task 4: Strict validator (`validate.mjs`)

**Files:**
- Create: `scripts/antigravity/validate.mjs`
- Test: `scripts/tests/validate.test.mjs`

**Interfaces:**
- Consumes: Task 1 (`readSkillFrontmatter`, `findHostReferences`, `listFilesRelative`).
- Produces: `validatePlugins(pluginsRoot: string, { strict = false, allowlist = [] } = {}): { valid: boolean, skillCount: number, results: Array<{ plugin: string, errors: string[], warnings: string[], skills: string[] }> }`. It ignores non-directories and `EXECUTABLES.txt`/`GENERATED.md`. With `strict`, warnings count as errors.
- CLI: `node scripts/antigravity/validate.mjs [--strict] [--root DIR]`. It reads the allowlist from `antigravity/rewrites.json`, exits 1 on failure, and prints `OK: 8 plugins, 61 skills`.
- Errors: missing or invalid `plugin.json`; unknown key; key `disabled` present; missing Marketplace field; `name` not kebab-case or ≠ dir; `displayName` naming rule; `logo` not a relative existing `.svg/.png/.jpg/.jpeg/.webp`; `suggestedPrompts` length ≠ 3; `homepage`/`repository`/`author.url` not `https://`; missing `README.md` or `NOTICE.md`; no `skills/` or zero skills; a skill without `SKILL.md`; a frontmatter error; frontmatter `name` ≠ skill dir; a duplicate skill name across plugins; any path containing `.claude-plugin`, `.git`, or `.DS_Store`; any symlink; host references not covered by the allowlist; an `EXECUTABLES.txt` line pointing to a missing file.
- Warnings: description longer than 1024 chars; any `.sh` file under `scripts/` that isn't listed in `EXECUTABLES.txt` (non-executable Python library modules under `scripts/` are intentionally `0644` and do not warn).

- [ ] **Step 1: Write failing tests.** Make a helper `writeValidPlugin(root, name, skills=["s1"])`, then mutate:

```js
test("valid plugin passes", () => { assert.equal(validatePlugins(root, { strict: true }).valid, true); });
for (const [label, mutate, re] of [
  ["unknown key", m => (m.foo = 1), /Unknown top-level plugin.json key 'foo'/],
  ["disabled present", m => (m.disabled = true), /must not ship 'disabled'/],
  ["name mismatch", m => (m.name = "other"), /does not match directory/],
  ["two prompts", m => (m.suggestedPrompts = ["a", "b"]), /exactly 3 suggestedPrompts/],
  ["bad displayName", m => (m.displayName = "Claude Swift"), /displayName/],
]) test(`manifest: ${label}`, () => { /* rewrite plugin.json via mutate; assert errors match re */ });
test("skill name must match dir", ...);           // /does not match skill directory/
test("duplicate skill across plugins", ...);      // /Duplicate skill name/
test("host reference flagged, allowlist clears it", ...);
test("unlisted script is warning, strict makes it fail", () => {
  // scripts/run.sh not in EXECUTABLES.txt -> valid:true non-strict, valid:false strict
});
test("EXECUTABLES.txt entry for missing file fails", ...);
```

- [ ] **Step 2: Run, expect FAIL**
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run, expect PASS.** Then commit `feat: add strict Antigravity plugin validator`.

---

### Task 5: Pure-Node zip and release packager

**Files:**
- Create: `scripts/antigravity/zip.mjs`, `scripts/antigravity/package-release.mjs`
- Test: `scripts/tests/zip.test.mjs`, `scripts/tests/package-release.test.mjs`

**Interfaces:**
- Produces (`zip.mjs`):
  - `createZip(entries: Array<{ name: string, data: Buffer, mode: number }>): Buffer`: one local header per file plus a central directory and EOCD, no directory entries, method 8 (`zlib.deflateRawSync`) with fallback to method 0 when the deflated output isn't smaller, CRC from `zlib.crc32`, and a fixed DOS timestamp of 1980-01-01 00:00. Each entry sets "version made by" = `(3 << 8) | 20` (Unix), `external_attr = ((0o100000 | mode) << 16) >>> 0`, and the UTF-8 flag (bit 11). Names use `/`.
  - `readZipEntries(buf: Buffer): Array<{ name: string, mode: number, data: Buffer }>`: parses the central directory and supports methods 0 and 8. Used by tests.
- Produces (`package-release.mjs`): `packageRelease({ pluginsRoot, outPath, allowlist = [] }): { fileCount: number }`. It runs `validatePlugins(pluginsRoot, { strict: true, allowlist })` first and throws listing the errors. It zips every file of every plugin dir plus `EXECUTABLES.txt` at the zip root (excluding `GENERATED.md`), sorted by name. Mode is `0o755` for paths listed in `EXECUTABLES.txt` and `0o644` otherwise. CLI: `node scripts/antigravity/package-release.mjs [--root DIR] [--out FILE] [--rewrites FILE]`, defaulting to `antigravity/plugins`, `swift-agent-skills-antigravity.zip`, and `antigravity/rewrites.json` (loading its `allowlist` when present).

- [ ] **Step 1: Write failing tests**

```js
test("createZip/readZipEntries roundtrip with modes and unicode", () => {
  const entries = [{ name: "a/x.sh", data: Buffer.from("#!/bin/sh\n"), mode: 0o755 },
                   { name: "a/é.md", data: Buffer.alloc(5000, "z"), mode: 0o644 }];
  const out = readZipEntries(createZip(entries));
  assert.deepEqual(out.map(e => [e.name, e.mode & 0o777, e.data.length]), [["a/x.sh", 0o755, 10], ["a/é.md", 0o644, 5000]]);
});
test("createZip is deterministic", () => { assert.deepEqual(createZip(e), createZip(e)); });
test("zip extracts with platform tool", () => {
  // Windows: powershell Expand-Archive; else: `unzip -Z` shows -rwxr-xr-x for a/x.sh. Skip if tool missing.
});
test("packageRelease marks EXECUTABLES as 0755 and includes manifest", () => {
  // valid fixture plugin with skills/s1/scripts/run.sh listed in EXECUTABLES.txt
  const names = readZipEntries(readFileSync(zip)).map(e => [e.name, e.mode & 0o777]);
  assert.ok(names.some(([n, m]) => n === "pack/skills/s1/scripts/run.sh" && m === 0o755));
  assert.ok(names.some(([n]) => n === "EXECUTABLES.txt"));
  assert.ok(!names.some(([n]) => n === "GENERATED.md"));
});
test("packageRelease refuses invalid plugins", ...); // /Cannot package invalid plugins/
```

- [ ] **Step 2: Run, expect FAIL**
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run, expect PASS.** Then commit `feat: add pure-Node release zip packager`.

---

### Task 6: Real catalog, overrides, first build and rewrite audit

**Files:**
- Create: `antigravity/sources.json`, `antigravity/rewrites.json`, `antigravity/overrides/<pack>/{plugin.json,README.md,assets/logo.svg}` ×8
- Generated (commit): `antigravity/plugins/**`, `THIRD_PARTY_NOTICES.md`
- Test: `scripts/tests/catalog.test.mjs`

**Interfaces:**
- Consumes: `buildAll` (Task 3), `validatePlugins` (Task 4).
- Produces: committed plugins that later tasks package and install.

- [ ] **Step 1: Write `antigravity/sources.json`** with exactly these upstreams (all `"ref": "main"`, `"license": "LICENSE"` unless noted, `repo` = `https://github.com/<key>.git`):

| Key | SHA | Author |
|---|---|---|
| twostraws/SwiftUI-Agent-Skill | f2920b63995263f57b3e198674e89a602efba6d2 | Paul Hudson |
| twostraws/SwiftData-Agent-Skill | 8051f177a0076e7fd45bdf4ee687b070ba58fdc6 | Paul Hudson |
| twostraws/Swift-Concurrency-Agent-Skill | bee3f69ba17142da148d3c5406f148ed62592b69 | Paul Hudson |
| twostraws/Swift-Testing-Agent-Skill | 2d6bba14a3c8bf3694f218b92fffe617c41ae43e | Paul Hudson |
| Erikote04/Swift-API-Design-Guidelines-Agent-Skill | 36cdc1b5680f5d6c5c52c353a6857d176f4929e8 | Erik Sebastián de Erice |
| Dimillian/Skills | 05ba982bfeb0d77d3c97d4542b0ee15034d05f84 | Thomas Ricouard |
| arjitj2/swiftui-design-principles | 791d22d73f844167a3872530e3941185b730d8be | Arjit Jaiswal |
| dadederk/iOS-Accessibility-Agent-Skill | dcc3a36ce1d0099341d545c1af4eb5a8c989bf66 | Daniel Devesa |
| andrewgleave/skills | d6c72b885a1902d4b74d4bd9beca80f2a1b96b51 | Andrew Gleave |
| mhaviv/Swift-FocusEngine-Agent-Skill | 903d58d0ed03d4b85251d34dd96687eb822b3291 | Michael Haviv |
| n0an/Swift-FormatStyle-Agent-Skill | 5cda783ac709f26893bbbfb61b31c930c1e6a300 | Anton Novoselov |
| n0an/App-Intents-Agent-Skill | f754f08c5ef45515cf51b026f87f8aa89d747f7d | Anton Novoselov |
| n0an/Background-Execution-Agent-Skill | a29ddf879308bc6cb0d5add020533701baa7fe67 | Anton Novoselov |
| n0an/Observability-Agent-Skill | 4ab4f371b03b2015767fbe9da7d4321293bfc377 | Anton Novoselov |
| n0an/Widgets-Agent-Skill | 06567e152df00df1db50a2935bbe62fda9e27c19 | Anton Novoselov |
| AvdLee/Core-Data-Agent-Skill | 855ca7d0df50e82b00c12881dd9cd23c19ef5f49 | Antoine van der Lee |
| akshaypimprikar/ios-swiftdata-testing-agent-skill | e8a98757b3e62e9dcfce0ce08e50ee40137c2b22 | Akshay Pimprikar |
| efremidze/swift-architecture-skill | 60e177612f4ed9dc7799b3674830e594c76fa00c | Lasha Efremidze |
| ivan-magda/swift-security-skill | bda2e0ccee6a64d45ec2b93790d0876c90e4eb89 | Ivan Magda |
| jazzychad/ios-code-audit | 34edb296a150915f8fcca69f27543af0c231c616 | Chad Etzel |
| TimBroddin/app-store-aso-skill | 3f0b917384ae245e34bd6cb7fe716d0995a64f4e | Tim Broddin |
| 3paws-ai/mobile-ai-skills | 6d3570eab02b57d8f8269ef11a1ef8ffcb1c8553 | Dann Beauregard |
| rorkai/app-store-connect-cli-skills | 6d1c3c55fe4590fcbc3e3115de18c5721a73c23b | Rudrank Riyam (`credit`: "originally rudrankriyam/app-store-connect-cli-skills") |
| conorluddy/ios-simulator-skill | 86fb9ba90a438bd2ee7ab640165bd77da396d941 | Conor Luddy (`license`: `LICENSE.md`) |
| AvdLee/Swift-Concurrency-Agent-Skill | 3b1580d8398e0b5408b3bf0bada0e941a1cfc642 | Antoine van der Lee |
| AvdLee/Swift-Testing-Agent-Skill | 798e9b1a2bcac164d4f0c781908199e754f0bab6 | Antoine van der Lee |
| vanab/SwiftData-agent-skill | 4819a5381fa5fdce894451822917b1135c19e050 | Kudrin Dmitry |
| bocato/swift-testing-agent-skill | c2dd1b051c8359fa29acdbf0ceb0c6b0e8341a1c | Eduardo Bocato |
| PasqualeVittoriosi/swift-accessibility-skill | 3791850af76f11cffa552b3394f2b8732d7ce3c7 | Pasquale Vittoriosi |
| rgmez/apple-accessibility-skills | 2fff4d8bcf82d5f1a99e31ac8fda72698d5ff3a3 | Roberto Gómez Muñoz |

Plugins (`upstream` → `path`; resulting skill dir in parentheses when it differs):

- `swift-core`: SwiftUI-Agent-Skill → `swiftui-pro`; SwiftData-Agent-Skill → `swiftdata-pro`; Swift-Concurrency-Agent-Skill → `swift-concurrency-pro`; Swift-Testing-Agent-Skill → `swift-testing-pro`; Erikote04 → `swift-api-design-guidelines-skill`
- `swift-ui-craft`: Dimillian/Skills → `swiftui-ui-patterns`, `swiftui-view-refactor`, `swiftui-performance-audit`; arjitj2 → `.` (`swiftui-design-principles`); dadederk → `ios-accessibility`; andrewgleave/skills → `writing-for-interfaces`; mhaviv → `.` (`swift-focusengine-pro`)
- `swift-apple-frameworks`: n0an FormatStyle → `swift-format-style`; App-Intents → `app-intents`; Background-Execution → `background-execution`; Observability → `observability`; Widgets → `widgets`; AvdLee/Core-Data → `core-data-expert`; akshaypimprikar → `swiftdata-testing`
- `swift-quality`: efremidze → `swift-architecture-skill`; ivan-magda → `swift-security-expert`; jazzychad → `.` (`ios-code-audit`)
- `swift-app-store`: Dimillian/Skills → `app-store-changelog`; TimBroddin → `.` (`app-store-aso`); 3paws-ai → `skills/appstore-review`
- `swift-asc-cli`: rorkai → glob `skills/asc-*` (26 skills)
- `swift-ios-simulator`: conorluddy → `ios-simulator-skill/skills/ios-simulator-skill`
- `swift-extras`: AvdLee/Swift-Concurrency → `skills/swift-concurrency`; AvdLee/Swift-Testing → `swift-testing-expert`; Dimillian/Skills → `swift-concurrency-expert`; vanab → `swiftdata-expert-skill`; bocato → `swift-testing`; PasqualeVittoriosi → `swift-accessibility-skill`; rgmez → `skills/appkit-accessibility-auditor`, `skills/swiftui-accessibility-auditor`, `skills/uikit-accessibility-auditor`

- [ ] **Step 2: Write the failing catalog test**

```js
const EXPECTED = { "swift-core": 5, "swift-ui-craft": 7, "swift-apple-frameworks": 7, "swift-quality": 3,
  "swift-app-store": 3, "swift-asc-cli": 26, "swift-ios-simulator": 1, "swift-extras": 9 };
test("committed plugins match expected packs and 61 skills", () => {
  const r = validatePlugins(join(repoRoot, "antigravity/plugins"), { strict: true, allowlist });
  assert.equal(r.valid, true, JSON.stringify(r.results.filter(x => x.errors.length), null, 2));
  assert.deepEqual(Object.fromEntries(r.results.map(x => [x.plugin, x.skills.length])), EXPECTED);
  assert.equal(r.skillCount, 61);
});
test("sources.json plugins match EXPECTED keys and every sha is 40-hex", ...);
test("ios-simulator scripts are recorded executable", () => {
  const ex = readFileSync(join(repoRoot, "antigravity/plugins/EXECUTABLES.txt"), "utf8").trim().split("\n");
  assert.ok(ex.filter(p => p.startsWith("swift-ios-simulator/")).length >= 18);
  assert.ok(ex.some(p => p.startsWith("swift-app-store/skills/app-store-changelog/")));
});
test("no unlicensed upstream is bundled", () => {
  const s = readFileSync(join(repoRoot, "antigravity/sources.json"), "utf8");
  assert.doesNotMatch(s, /SwiftAgents|figma-to-swiftui/);
});
```

- [ ] **Step 3: Run, expect FAIL** (no plugins yet)

- [ ] **Step 4: Write the 8 overrides.** For each pack, write `plugin.json` with the Global Constraints values and these `displayName`s: `Swift Core (Community)`, `SwiftUI Craft (Community)`, `Apple Frameworks for Swift (Community)`, `Swift Code Quality (Community)`, `App Store Toolkit (Community)`, `App Store Connect CLI (Community)`, `iOS Simulator (Community)`, `Swift Extras: Alternatives (Community)`. Use `homepage`/`repository` = `https://github.com/momochisoundpost/Swift-Agent-Skills-Antigravity`, `license` `MIT`, and 3 `suggestedPrompts` that fit the pack. Each `README.md` lists its skills with upstream author links and prerequisites: `swift-ios-simulator` is macOS + Xcode + Python 3.12+ + `idb`; `swift-asc-cli` needs the `asc` CLI. The `swift-extras` README states it overlaps with `swift-core`/`swift-ui-craft` (Concurrency, Testing, SwiftData, Accessibility) and suggests enabling one author per topic. Each `assets/logo.svg` is a square `viewBox="0 0 128 128"` with ~10% padding, a transparent background, and a shared Swift-orange (`#F05138`) visual language, with a distinct glyph per pack.

- [ ] **Step 5: Write an initial `rewrites.json` of `{ "rewrites": [], "allowlist": [] }` and run the build**

Run: `node scripts/antigravity/build.mjs`
Expected: it fails with `Host-specific reference detected` and a list of hits.

- [ ] **Step 6: Audit each hit and resolve it in `rewrites.json`.** Rules:
  - A runtime instruction that only works in another host (for example "use the AskUserQuestion tool" or "install via `/plugin` in Claude Code") becomes a **rewrite** to the Antigravity equivalent (ask the user directly, `ask_question`, Customizations, `invoke_subagent`).
  - A neutral mention (attribution, "works with Claude, Codex…" lists, reading a project's existing `CLAUDE.md`/`AGENTS.md`) goes on the **allowlist** with the narrowest `pattern` substring.
  - The rgmez `supported-runtimes: "cursor, claude, codex, skills.sh"` frontmatter lines get rewritten to `supported-runtimes: "antigravity, cursor, claude, codex, skills.sh"` and allowlisted.
  - Keep rewrites minimal and wording-faithful.

  Re-run until it prints `Built 8 plugins, 61 skills`.

- [ ] **Step 7: Verify**

Run: `node scripts/antigravity/build.mjs --check; node scripts/antigravity/validate.mjs --strict; node --test scripts/tests/`
Expected: `Verified 8 plugins, 61 skills`, `OK: 8 plugins, 61 skills`, and all tests passing.

- [ ] **Step 8: Commit** `feat: add pinned Swift catalog and generated Antigravity plugins`

---

### Task 7: Windows installer (`install.ps1`)

**Files:**
- Create: `install.ps1`
- Test: `scripts/tests/install-ps1.test.mjs` (skips unless `process.platform === "win32"` or `pwsh` is on PATH)

**Interfaces:**
- Consumes: the release zip layout from Task 5 (`<pack>/plugin.json`, `EXECUTABLES.txt`) and the GitHub branch-archive layout (`<repo>-main/antigravity/plugins/<pack>/plugin.json`).
- Produces: `param([string[]]$Packs, [switch]$All, [switch]$AllDisabled, [switch]$Workspace, [string]$Destination, [string]$Version, [string]$FromZip, [switch]$List, [switch]$Uninstall)`.
- Behavior:
  - Contains an ordered pack table `$PackTable` (`Name`, `Alias`, `Skills`, `Summary`) with the 8 packs from Global Constraints.
  - `-Packs` accepts names or aliases, comma-split, trimmed, case-insensitive, de-duplicated. An unknown value writes `Unknown pack '<x>'. Valid packs: ...` and `exit 2` before anything else.
  - `-All` with `-Packs`, `-AllDisabled` with `-Packs`, or `-All` with `-AllDisabled` is an error (`exit 2`).
  - Destination resolves to `-Destination` (use for custom paths instead of an optional arg on `-Workspace`, matching `install.sh`'s `--dest`), else `<cwd>\.agents\plugins` when `-Workspace`, else `$env:USERPROFILE\.gemini\config\plugins`.
  - `-List` prints the table with an `Installed` column (dir exists at the destination) and exits 0 without downloading.
  - `-Uninstall` removes the selected packs (all 8 known if no `-Packs`) and never anything else.
  - Source: `-FromZip` (a local file) or a download from `releases/download/<tag>/swift-agent-skills-antigravity.zip` when `-Version` is given (fails cleanly with non-zero exit and message pointing to Releases / local clone `agy plugin install` if that tag/asset does not exist — never silently falls back). When `-Version` is omitted, tries `releases/latest` via the API; if no release exists yet, warns and falls back to `archive/refs/heads/main.zip`.
  - Everything is downloaded and extracted under `[IO.Path]::GetTempPath()` first. If the archive is corrupt or any requested pack is missing, it throws before touching the destination, so existing installs stay untouched.
  - Per pack: copy to `<Destination>\..\.swift-agent-skills-staging\<pack>`. With `-AllDisabled` and pack ≠ `swift-core`, rewrite the staged `plugin.json` so line 1 `{` becomes `{` + newline + `  "disabled": true,`. Then remove `<Destination>\<pack>`, move the staged copy in, and delete the staging root.
  - Ends by printing `Installed: ...` and `Open Antigravity -> Customizations -> Installed (no restart needed).`
  - PS 5.1-safe: no `??`, `?:`, `-AsHashtable`, `-Parallel`, or `$IsWindows`. Sets TLS 1.2 and never mentions `config.json`.

- [ ] **Step 1: Write failing tests.** Build a test zip via `packageRelease` from a minimal valid 8-pack fixture (helper in `helpers.mjs` so fail-closed missing-pack checks stay strict). Run `powershell -NoProfile -ExecutionPolicy Bypass -File install.ps1 ...` (or `pwsh`) with `-Destination` pointing to a temp dir **whose path contains a space**. In CI on Windows (`process.env.CI && process.platform === "win32"`), do not skip.

```js
test("default installs swift-core only", ...);                                   // dirs == ["swift-core"]
test("additive -Packs keeps existing and foreign plugins", ...);                 // pre-create superpowers/ ; after -Packs ui-craft: superpowers, swift-core, swift-ui-craft
test("-Packs ' Core,UI-Craft ' normalizes", ...);
test("unknown pack exits 2 and installs nothing", ...);                          // stderr/stdout matches /Valid packs:/
test("-AllDisabled injects disabled into non-core only", ...);                   // JSON.parse(ui-craft/plugin.json).disabled === true; core has no key; re-running -Packs ui-craft removes disabled
test("-Uninstall without -Packs removes only known packs", ...);                 // swift-foo/ and superpowers/ survive
test("corrupt -FromZip exits non-zero and keeps existing install", ...);         // write garbage zip; swift-core/plugin.json unchanged
test("-List shows Installed column without network", ...);
test("script is PS 5.1-safe and never mentions config.json", ...);               // static regex checks
```

- [ ] **Step 2: Run, expect FAIL**
- [ ] **Step 3: Implement `install.ps1`**
- [ ] **Step 4: Run, expect PASS.** Then smoke-test against the real build: `node scripts/antigravity/package-release.mjs --out $env:TEMP\sas.zip` followed by `powershell -File install.ps1 -FromZip $env:TEMP\sas.zip -Destination "$env:TEMP\sas test" -All`. Expect 8 dirs.
- [ ] **Step 5: Commit** `feat: add Windows PowerShell installer`

---

### Task 8: macOS/Linux installer (`install.sh`)

**Files:**
- Create: `install.sh` (LF, POSIX `sh`, tracked with `git update-index --chmod=+x install.sh`)
- Test: `scripts/tests/install-sh.test.mjs` (skips if `sh` and `unzip` aren't on PATH, which is the normal case on this Windows dev box; it runs in Ubuntu CI)

**Interfaces:**
- Flags mirror Task 7: `--packs a,b`, `--all`, `--all-disabled`, `--workspace`, `--dest DIR`, `--version vX.Y.Z`, `--from-zip FILE`, `--list`, `--uninstall`, `-h|--help`. Same pack table, normalization, conflicts, `exit 2` rules, destination defaults (`$HOME/.gemini/config/plugins`, `$PWD/.agents/plugins`), staging dir (`<dest>/../.swift-agent-skills-staging`), and `disabled` injection (via `sed '1s/^{$/{\n  "disabled": true,/'` written portably as a here-doc/awk, not GNU `sed` syntax).
- Needs only `curl`, `unzip`, `mktemp`, and coreutils. Must never read stdin (so `curl … | sh` works). Uses `set -eu` and quotes every path.
- After install, runs `chmod +x` on each `EXECUTABLES.txt` entry belonging to the installed packs (covers the branch-archive fallback, where zip modes may be missing).
- Release resolution: when `--version` is given, downloads `releases/download/<tag>/swift-agent-skills-antigravity.zip` and fails cleanly without fallback if missing (pointing to Releases / local clone `agy plugin install`). When `--version` is omitted, tries `https://github.com/<slug>/releases/latest/download/swift-agent-skills-antigravity.zip`; on HTTP failure it warns and falls back to `archive/refs/heads/main.zip`, looking for `*/antigravity/plugins/<pack>`.

- [ ] **Step 1: Write failing tests**, the same 9 cases as Task 7 (using the 8-pack fixture zip) run via `sh install.sh ... --dest "<tmp with space>"` (in CI on non-Windows, `process.env.CI && process.platform !== "win32"`, never skip), plus:

```js
test("ios-simulator style script is executable after install", ...); // fixture pack with scripts/run.sh listed in EXECUTABLES.txt -> fs.statSync(...).mode & 0o111
test("works when piped via stdin", ...);  // spawn `sh -s -- --from-zip <zip> --dest <d>` with input = script text
```

- [ ] **Step 2: Run, expect FAIL** (on CI/WSL. On this Windows box, expect a SKIP and check it in CI in Task 11)
- [ ] **Step 3: Implement `install.sh`**. Also check it with `sh -n install.sh` if Git Bash is available at `C:\Program Files\Git\bin\sh.exe`.
- [ ] **Step 4: Run tests.** If `C:\Program Files\Git\usr\bin` provides `sh` + `unzip`, run locally by prepending it to PATH for the test process. Otherwise rely on Task 11 CI.
- [ ] **Step 5: Commit** `feat: add macOS/Linux shell installer`

---

### Task 9: Upstream sync helper

**Files:**
- Create: `scripts/antigravity/sync-upstream.mjs`
- Test: `scripts/tests/sync-upstream.test.mjs`

**Interfaces:**
- Consumes: `lsRemoteHead` (Task 2).
- Produces: `checkUpstreams({ sourcesPath }): Promise<Array<{ key, pinned, latest, outdated: boolean }>>` and `writeUpdates({ sourcesPath, updates }): void`, which rewrites only the `sha` fields and keeps 2-space formatting. CLI: `node scripts/antigravity/sync-upstream.mjs [--write]`. It prints a table and exits 0. Without `--write` it changes nothing. With `--write` it updates the SHAs and reminds you to run `build.mjs` and review the diff.

- [ ] **Step 1: Failing tests** with two `makeFixtureRepo` upstreams (pinned at commit 1, then one gets a second commit). Assert `outdated` flags, and that `writeUpdates` changes only that SHA (deep-equal everything else).
- [ ] **Step 2: Run, expect FAIL**. **Step 3: Implement**. **Step 4: Run, expect PASS**.
- [ ] **Step 5: Commit** `feat: add upstream sync helper`

---

### Task 10: User and maintainer docs

**Files:**
- Modify: `README.md` (replace with port docs, keeping the upstream credit)
- Create: `INSTALL.md`, `CHANGELOG-antigravity.md`, `RELEASING-antigravity.md`
- Test: `scripts/tests/docs.test.mjs`

**Interfaces:**
- Consumes: pack table (Task 6 `EXPECTED`), installer flags (Tasks 7–8).

- [ ] **Step 1: Failing doc test**

```js
test("README has both one-liners, the prompt, all 8 packs, credits and unbundled links", () => {
  const r = read("README.md");
  assert.match(r, /curl -fsSL https:\/\/raw\.githubusercontent\.com\/momochisoundpost\/Swift-Agent-Skills-Antigravity\/main\/install\.sh \| sh/);
  assert.match(r, /irm https:\/\/raw\.githubusercontent\.com\/momochisoundpost\/Swift-Agent-Skills-Antigravity\/main\/install\.ps1 \| iex/);
  assert.match(r, /Install Swift Agent Skills from https:\/\/github\.com\/momochisoundpost\/Swift-Agent-Skills-Antigravity/);
  for (const p of Object.keys(EXPECTED)) assert.match(r, new RegExp(`\\b${p}\\b`));
  assert.match(r, /twostraws\/Swift-Agent-Skills/);
  assert.match(r, /Unbundled Community Links \(No License Declared\)/);
  assert.match(r, /SwiftAgents/); assert.match(r, /figma-to-swiftui-skill/);
});
test("INSTALL.md has agent instructions that forbid editing config.json and use customization links", () => {
  const i = read("INSTALL.md");
  assert.match(i, /## Instructions for Antigravity/);
  assert.match(i, /config\.json/); assert.match(i, /customization:\/\/swift-core/);
});
test("installer pack tables match sources.json", () => {
  // parse names from install.ps1 $PackTable and install.sh table; deep-equal to Object.keys(sources.plugins)
});
```

- [ ] **Step 2: Run, expect FAIL**
- [ ] **Step 3: Write the docs.**
  - `README.md` contains: the community-port disclaimer (not affiliated with Apple, Google, or the upstream authors); why the port exists (an affordable path through Google AI Plus/Pro); the pack table with skill counts and the default marked; terminal one-liners for both OSes plus the add/`--all-disabled`/workspace/list/uninstall variants (from spec §7); the prompt-to-install box; usage notes on context-window cost and toggling packs in Customizations; prerequisites for `ios-simulator`/`asc-cli`; full credits to Paul Hudson's directory and every upstream author; the unbundled-links section; the safety note carried over from upstream; and a pointer to `RELEASING-antigravity.md` for maintainers.
  - `INSTALL.md` contains human steps plus `## Instructions for Antigravity`: detect the OS, run `install.sh`/`install.ps1` with the requested packs (default `swift-core`), never hand-edit `~/.gemini/config/config.json`, then confirm and present `[<displayName>](customization://<pack>)` links.
  - `RELEASING-antigravity.md` covers sync → build → `--check` → validate → tests → PR → merge → tag `vX.Y.Z` → release workflow.
  - `CHANGELOG-antigravity.md` gets a `v1.0.0` (unreleased) entry.
- [ ] **Step 4: Run, expect PASS.** Then commit `docs: add port README, install guide, changelog and release process`.

---

### Task 11: CI, release workflow, push, PR, and stop

**Files:**
- Create: `.github/workflows/antigravity-ci.yml`, `.github/workflows/antigravity-release.yml`

**Interfaces:**
- Consumes: every CLI above.

- [ ] **Step 1: `antigravity-ci.yml`.** It runs on `push` and `pull_request` with matrix `os: [ubuntu-latest, windows-latest]`, `permissions: contents: read`. Actions are pinned by SHA: `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1` and `actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0` with `node-version: 22`. It uses `actions/cache` (SHA-pinned to its latest release at implementation time) keyed on `hashFiles('antigravity/sources.json')` for `.cache/upstreams`. Steps, in order: `node scripts/antigravity/build.mjs --check`, `node scripts/antigravity/validate.mjs --strict`, `node --test scripts/tests/`, `node scripts/antigravity/package-release.mjs --out swift-agent-skills-antigravity.zip`. Ubuntu-only: `unzip -Z swift-agent-skills-antigravity.zip | grep -q '^-rwxr-xr-x.*swift-ios-simulator/'`.
- [ ] **Step 2: `antigravity-release.yml`.** It runs on tags `v*` with `permissions: contents: write` on ubuntu-latest, runs the same verification, packages the zip, then runs `gh release create "$GITHUB_REF_NAME" swift-agent-skills-antigravity.zip --generate-notes --title "$GITHUB_REF_NAME"` with `GH_TOKEN: ${{ github.token }}`.
- [ ] **Step 3: Full local verification**

Run: `node scripts/antigravity/build.mjs --check; node scripts/antigravity/validate.mjs --strict; node --test scripts/tests/`
Expected: verified, OK, 0 failures (sh tests skipped locally).

- [ ] **Step 4: Commit** `ci: add Antigravity CI and tag release workflows`
- [ ] **Step 5: Push and open the PR**

```bash
git push -u origin feat/antigravity-port
gh pr create --repo momochisoundpost/Swift-Agent-Skills-Antigravity --base main --head feat/antigravity-port \
  --title "Antigravity port: 8 Swift skill packs, installers, CI" --body-file <summary listing packs, skill counts, rewrites/allowlist count, verification output>
```

- [ ] **Step 6: Wait for CI.** Run `gh pr checks --watch`. Expected: both matrix jobs pass. If one fails, fix it on the branch, push, and re-watch.
- [ ] **Step 7: STOP.** Report the PR URL and CI results to the user for review. Do not merge, tag, or release.
