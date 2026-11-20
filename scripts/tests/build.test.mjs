import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildAll } from "../antigravity/build.mjs";
import { ANTIGRAVITY_SCHEMA_URL, listFilesRelative } from "../antigravity/lib.mjs";
import { makeFixtureRepo, makeTempDir } from "./helpers.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BUILD_CLI = path.join(REPO_ROOT, "scripts", "antigravity", "build.mjs");

const tempDirs = [];

function trackTemp(dir) {
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function writeOverride(overridesRoot, packName, manifestOverrides = {}, extraFiles = {}) {
  const packOverride = path.join(overridesRoot, packName);
  const manifest = {
    name: packName,
    displayName: `${packName} Display`,
    description: "Fixture pack description",
    version: "1.0.0",
    logo: "assets/logo.svg",
    suggestedPrompts: ["Prompt 1", "Prompt 2", "Prompt 3"],
    author: { name: "momochisoundpost", url: "https://github.com/momochisoundpost" },
    ...manifestOverrides,
  };
  writeJson(path.join(packOverride, "plugin.json"), manifest);
  fs.writeFileSync(path.join(packOverride, "README.md"), "# Fixture Pack\r\nDetails.\r\n", "utf8");
  fs.mkdirSync(path.join(packOverride, "assets"), { recursive: true });
  fs.writeFileSync(
    path.join(packOverride, "assets", "logo.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"></svg>\r\n',
    "utf8",
  );
  for (const [rel, contents] of Object.entries(extraFiles)) {
    const full = path.join(packOverride, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, contents);
  }
}

function setupWorkspace() {
  const repoRoot = trackTemp(makeTempDir("build-ws-"));
  const cacheDir = trackTemp(makeTempDir("build-cache-"));
  const sourcesPath = path.join(repoRoot, "antigravity", "sources.json");
  const rewritesPath = path.join(repoRoot, "antigravity", "rewrites.json");
  const overridesRoot = path.join(repoRoot, "antigravity", "overrides");
  const outputRoot = path.join(repoRoot, "antigravity", "plugins");
  const noticesPath = path.join(repoRoot, "THIRD_PARTY_NOTICES.md");

  writeJson(rewritesPath, { rewrites: [], allowlist: [] });

  return {
    repoRoot,
    cacheDir,
    sourcesPath,
    rewritesPath,
    overridesRoot,
    outputRoot,
    noticesPath,
  };
}

describe("buildAll", () => {
  test("builds a pack from path and glob entries with renaming, excludes, binaries, and LF", async () => {
    const ws = setupWorkspace();
    const binaryIcon = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

    const upstreamA = makeFixtureRepo({
      "pro/SKILL.md": "---\r\nname: a-pro\r\ndescription: A pro skill.\r\n---\r\nBody A\r\n",
      "pro/references/x.md": "# Ref X\r\nLine 2\r\n",
      "pro/skills/a-pro/SKILL.md": "nested duplicate should be skipped\n",
      "pro/.claude-plugin/plugin.json": '{"name":"skip"}\n',
      "pro/agents/openai.yaml": "skip me\n",
      "pro/.github/workflows/ci.yml": "skip me\n",
      "pro/.gitignore": "*.tmp\n",
      "pro/.DS_Store": "junk",
      "pro/CLAUDE.md": "skip anywhere\n",
      "pro/references/CLAUDE.md": "skip nested CLAUDE.md\n",
      "pro/extra/drop.md": "excluded by prefix\n",
      "pro/extra-keep/keep.md": "not excluded by exact prefix\n",
      "pro/scripts/run.sh": { data: "#!/bin/sh\r\necho hi\r\n", mode: "100755" },
      "pro/scripts/sub/helper.sh": { data: "#!/bin/sh\necho sub\n", mode: "100644" },
      "pro/scripts/lib.py": { data: "print('lib')\n", mode: "100644" },
      "pro/refs-link": { symlink: "references/x.md" },
      LICENSE: "MIT License A\r\nCopyright (c) Author A\r\n",
    });
    trackTemp(upstreamA.dir);

    const upstreamB = makeFixtureRepo({
      "SKILL.md": "---\r\nname: b-root\r\ndescription: Root level skill.\r\n---\r\nBody B\r\n",
      "README.md": "repo readme should be skipped\n",
      "README-extra.md": "also skipped at root\n",
      "CONTRIBUTING.md": "skip\n",
      "CHANGELOG.md": "skip\n",
      "CODE_OF_CONDUCT.md": "skip\n",
      "assets/logo.svg": "<svg>skip</svg>\n",
      "docs/guide.md": "skip\n",
      "tests/unit.swift": "skip\n",
      "test/spec.swift": "skip\n",
      "evals/eval.json": "{}\n",
      "references/y.md": "Ref Y\r\n",
      "references/README.md": "nested readme inside references is kept\n",
      LICENSE: "MIT License B\nCopyright (c) Author B\n",
    });
    trackTemp(upstreamB.dir);

    const upstreamC = makeFixtureRepo({
      "skills/asc-one/SKILL.md": "---\nname: asc-one\ndescription: One.\n---\nBody 1\n",
      "skills/asc-two/SKILL.md": "---\nname: asc-two\ndescription: Two.\n---\nBody 2\n",
      "skills/asc-ignored/notes.md": "not a skill\n",
      "LICENSE.md": "MIT License C\nCopyright (c) Author C\n",
    });
    const upstreamCDotGitDir = `${upstreamC.dir}.git`;
    fs.renameSync(upstreamC.dir, upstreamCDotGitDir);
    trackTemp(upstreamCDotGitDir);
    const upstreamCDotGitUrl = pathToFileURL(upstreamCDotGitDir).href;

    writeJson(ws.sourcesPath, {
      upstreams: {
        "owner-c/repo-c": {
          repo: upstreamCDotGitUrl,
          ref: "main",
          sha: upstreamC.sha,
          license: "LICENSE.md",
          author: "Author C",
          credit: "originally old-owner/repo-c",
        },
        "owner-a/repo-a": {
          repo: upstreamA.url,
          ref: "main",
          sha: upstreamA.sha,
          license: "LICENSE",
          author: "Author A",
        },
        "owner-b/repo-b": {
          repo: upstreamB.url,
          ref: "main",
          sha: upstreamB.sha,
          license: "LICENSE",
          author: "Author B",
        },
      },
      plugins: {
        "fixture-pack": {
          skills: [
            { upstream: "owner-a/repo-a", path: "pro", exclude: ["extra"] },
            { upstream: "owner-b/repo-b", path: "." },
            { upstream: "owner-c/repo-c", glob: "skills/asc-*" },
          ],
        },
      },
    });

    writeOverride(
      ws.overridesRoot,
      "fixture-pack",
      { ignoredCustomKey: "should be stripped" },
      { "assets/icon.png": binaryIcon },
    );

    const result = await buildAll(ws);
    assert.deepEqual(result, { plugins: ["fixture-pack"], skillCount: 4 });

    assert.deepEqual(listFilesRelative(path.join(ws.outputRoot, "fixture-pack/skills")), [
      "a-pro/SKILL.md",
      "a-pro/extra-keep/keep.md",
      "a-pro/references/x.md",
      "a-pro/scripts/lib.py",
      "a-pro/scripts/run.sh",
      "a-pro/scripts/sub/helper.sh",
      "asc-one/SKILL.md",
      "asc-two/SKILL.md",
      "b-root/SKILL.md",
      "b-root/references/README.md",
      "b-root/references/y.md",
    ]);

    const skillMd = fs.readFileSync(
      path.join(ws.outputRoot, "fixture-pack/skills/a-pro/SKILL.md"),
      "utf8",
    );
    assert.doesNotMatch(skillMd, /\r/);
    assert.match(skillMd, /^---\nname: a-pro\n/);

    const readme = fs.readFileSync(path.join(ws.outputRoot, "fixture-pack/README.md"), "utf8");
    assert.doesNotMatch(readme, /\r/);

    const svg = fs.readFileSync(path.join(ws.outputRoot, "fixture-pack/assets/logo.svg"), "utf8");
    assert.doesNotMatch(svg, /\r/);

    assert.deepEqual(
      fs.readFileSync(path.join(ws.outputRoot, "fixture-pack/assets/icon.png")),
      binaryIcon,
    );

    assert.equal(
      fs.readFileSync(path.join(ws.outputRoot, "EXECUTABLES.txt"), "utf8"),
      "fixture-pack/skills/a-pro/scripts/run.sh\nfixture-pack/skills/a-pro/scripts/sub/helper.sh\n",
    );

    const generatedBanner = fs.readFileSync(path.join(ws.outputRoot, "GENERATED.md"), "utf8");
    assert.doesNotMatch(generatedBanner, /\r/);
    assert.match(generatedBanner, /sources\.json/);
    assert.match(generatedBanner, /overrides\//);
    assert.match(generatedBanner, /rewrites\.json/);

    const manifestRaw = fs.readFileSync(
      path.join(ws.outputRoot, "fixture-pack/plugin.json"),
      "utf8",
    );
    assert.doesNotMatch(manifestRaw, /\r/);
    assert.ok(manifestRaw.endsWith("\n"));
    const manifest = JSON.parse(manifestRaw);
    assert.equal(Object.keys(manifest)[0], "$schema");
    assert.equal(manifest.$schema, ANTIGRAVITY_SCHEMA_URL);
    assert.equal("ignoredCustomKey" in manifest, false);

    const notice = fs.readFileSync(path.join(ws.outputRoot, "fixture-pack/NOTICE.md"), "utf8");
    assert.doesNotMatch(notice, /\r/);
    assert.match(notice, /^# Third-Party Notices \(fixture-pack\)/);
    assert.match(notice, /- a-pro: .* @ [0-9a-f]{40} \(path: pro\) by Author A, MIT/);
    assert.match(notice, /- b-root: .* @ [0-9a-f]{40} \(path: \.\) by Author B, MIT/);
    assert.match(
      notice,
      /- asc-one: .* @ [0-9a-f]{40} \(path: skills\/asc-one\) by Author C, MIT/,
    );
    assert.doesNotMatch(notice, /\.git @/);
    assert.match(notice, /## owner-a\/repo-a[\s\S]*MIT License A/);
    assert.match(notice, /## owner-b\/repo-b[\s\S]*MIT License B/);
    assert.match(notice, /## owner-c\/repo-c[\s\S]*MIT License C/);

    const thirdParty = fs.readFileSync(ws.noticesPath, "utf8");
    assert.doesNotMatch(thirdParty, /\r/);
    const twostrawsPos = thirdParty.indexOf("twostraws/Swift-Agent-Skills");
    const idxA = thirdParty.indexOf("## owner-a/repo-a");
    const idxB = thirdParty.indexOf("## owner-b/repo-b");
    const idxC = thirdParty.indexOf("## owner-c/repo-c");
    assert.ok(twostrawsPos >= 0 && twostrawsPos < idxA);
    assert.ok(idxA < idxB && idxB < idxC);
    assert.match(thirdParty, new RegExp(`Pinned commit: ${upstreamA.sha}`));
    assert.match(thirdParty, /MIT License A/);
    assert.match(thirdParty, /MIT License C/);
  });

  test("writes empty EXECUTABLES.txt when no executables exist", async () => {
    const ws = setupWorkspace();
    const upstream = makeFixtureRepo({
      "s1/SKILL.md": "---\nname: s1\ndescription: S1.\n---\nBody\n",
      LICENSE: "MIT\n",
    });
    trackTemp(upstream.dir);

    writeJson(ws.sourcesPath, {
      upstreams: {
        "o/r": { repo: upstream.url, ref: "main", sha: upstream.sha, license: "LICENSE", author: "O" },
      },
      plugins: {
        "pack-one": { skills: [{ upstream: "o/r", path: "s1" }] },
      },
    });
    writeOverride(ws.overridesRoot, "pack-one");

    await buildAll(ws);
    assert.equal(fs.readFileSync(path.join(ws.outputRoot, "EXECUTABLES.txt"), "utf8"), "");
  });

  test("applies rewrites with LF normalization and fails on unmatched rewrite", async () => {
    const ws = setupWorkspace();
    const upstream = makeFixtureRepo({
      "s1/SKILL.md":
        "---\r\nname: s1\r\ndescription: S1.\r\n---\r\nUse Claude Code here and Claude Code there.\r\n",
      LICENSE: "MIT\n",
    });
    trackTemp(upstream.dir);

    writeJson(ws.sourcesPath, {
      upstreams: {
        "o/r": { repo: upstream.url, ref: "main", sha: upstream.sha, license: "LICENSE", author: "O" },
      },
      plugins: {
        "pack-one": { skills: [{ upstream: "o/r", path: "s1" }] },
      },
    });
    writeOverride(ws.overridesRoot, "pack-one");
    writeJson(ws.rewritesPath, {
      rewrites: [
        {
          plugin: "pack-one",
          file: "skills/s1/SKILL.md",
          find: "Claude Code",
          replace: "Antigravity ($&)",
        },
      ],
      allowlist: [],
    });

    await buildAll(ws);
    const outSkill = fs.readFileSync(
      path.join(ws.outputRoot, "pack-one/skills/s1/SKILL.md"),
      "utf8",
    );
    assert.match(outSkill, /Use Antigravity \(\$&\)/);
    assert.doesNotMatch(outSkill, /Claude Code/);

    writeJson(ws.rewritesPath, {
      rewrites: [
        {
          plugin: "pack-one",
          file: "skills/s1/SKILL.md",
          find: "does-not-exist",
          replace: "Antigravity",
        },
      ],
      allowlist: [],
    });

    await assert.rejects(buildAll(ws), /Rewrite did not match/);
  });

  test("fails on host reference unless allowlisted", async () => {
    const ws = setupWorkspace();
    const upstream = makeFixtureRepo({
      "s1/SKILL.md":
        "---\nname: s1\ndescription: S1.\n---\nRead CLAUDE.md or run AskUserQuestion.\n",
      LICENSE: "MIT\n",
    });
    trackTemp(upstream.dir);

    writeJson(ws.sourcesPath, {
      upstreams: {
        "o/r": { repo: upstream.url, ref: "main", sha: upstream.sha, license: "LICENSE", author: "O" },
      },
      plugins: {
        "pack-one": { skills: [{ upstream: "o/r", path: "s1" }] },
      },
    });
    writeOverride(ws.overridesRoot, "pack-one");

    await assert.rejects(
      buildAll(ws),
      /Host-specific reference detected[\s\S]*pack-one\/skills\/s1\/SKILL\.md:5/,
    );

    writeJson(ws.rewritesPath, {
      rewrites: [{ plugin: "pack-one", file: "skills/s1/SKILL.md", find: "AskUserQuestion", replace: "ask_question" }],
      allowlist: [{ plugin: "pack-one", file: "skills/s1/SKILL.md", pattern: "CLAUDE.md" }],
    });

    const res = await buildAll(ws);
    assert.equal(res.skillCount, 1);
  });

  test("fails on duplicate skill names across packs", async () => {
    const ws = setupWorkspace();
    const upstream = makeFixtureRepo({
      "s1/SKILL.md": "---\nname: a-pro\ndescription: S1.\n---\nBody\n",
      LICENSE: "MIT\n",
    });
    trackTemp(upstream.dir);

    writeJson(ws.sourcesPath, {
      upstreams: {
        "o/r": { repo: upstream.url, ref: "main", sha: upstream.sha, license: "LICENSE", author: "O" },
      },
      plugins: {
        "pack-a": { skills: [{ upstream: "o/r", path: "s1" }] },
        "pack-b": { skills: [{ upstream: "o/r", path: "s1" }] },
      },
    });
    writeOverride(ws.overridesRoot, "pack-a");
    writeOverride(ws.overridesRoot, "pack-b");

    await assert.rejects(buildAll(ws), /Duplicate skill name 'a-pro' in pack-a and pack-b/);
  });

  test("fails on unknown upstream or missing SKILL.md", async () => {
    const ws = setupWorkspace();
    const upstream = makeFixtureRepo({
      "empty-dir/notes.md": "no skill md here\n",
      LICENSE: "MIT\n",
    });
    trackTemp(upstream.dir);

    writeJson(ws.sourcesPath, {
      upstreams: {
        "o/r": { repo: upstream.url, ref: "main", sha: upstream.sha, license: "LICENSE", author: "O" },
      },
      plugins: {
        "pack-a": { skills: [{ upstream: "missing/repo", path: "empty-dir" }] },
      },
    });
    writeOverride(ws.overridesRoot, "pack-a");

    await assert.rejects(buildAll(ws), /Unknown upstream/);

    writeJson(ws.sourcesPath, {
      upstreams: {
        "o/r": { repo: upstream.url, ref: "main", sha: upstream.sha, license: "LICENSE", author: "O" },
      },
      plugins: {
        "pack-a": { skills: [{ upstream: "o/r", path: "empty-dir" }] },
      },
    });

    await assert.rejects(buildAll(ws), /Missing SKILL\.md/);
  });

  test("fails when override plugin.json contains disabled or required override files are missing", async () => {
    const ws = setupWorkspace();
    const upstream = makeFixtureRepo({
      "s1/SKILL.md": "---\nname: s1\ndescription: S1.\n---\nBody\n",
      LICENSE: "MIT\n",
    });
    trackTemp(upstream.dir);

    writeJson(ws.sourcesPath, {
      upstreams: {
        "o/r": { repo: upstream.url, ref: "main", sha: upstream.sha, license: "LICENSE", author: "O" },
      },
      plugins: {
        "pack-a": { skills: [{ upstream: "o/r", path: "s1" }] },
      },
    });
    writeOverride(ws.overridesRoot, "pack-a", { disabled: true });

    await assert.rejects(buildAll(ws), /disabled/);

    writeOverride(ws.overridesRoot, "pack-a");
    fs.rmSync(path.join(ws.overridesRoot, "pack-a/assets/logo.svg"));
    await assert.rejects(buildAll(ws), /logo\.svg/);
  });

  test("--check passes on fresh output and fails after manual edit or missing output", async () => {
    const ws = setupWorkspace();
    const upstream = makeFixtureRepo({
      "s1/SKILL.md": "---\nname: s1\ndescription: S1.\n---\nBody\n",
      LICENSE: "MIT\n",
    });
    trackTemp(upstream.dir);

    writeJson(ws.sourcesPath, {
      upstreams: {
        "o/r": { repo: upstream.url, ref: "main", sha: upstream.sha, license: "LICENSE", author: "O" },
      },
      plugins: {
        "fixture-pack": { skills: [{ upstream: "o/r", path: "s1" }] },
      },
    });
    writeOverride(ws.overridesRoot, "fixture-pack");

    await assert.rejects(buildAll({ ...ws, check: true }), /out of sync/);

    await buildAll({ ...ws, check: false });
    await buildAll({ ...ws, check: true });

    fs.appendFileSync(path.join(ws.outputRoot, "fixture-pack/README.md"), "edit");
    await assert.rejects(
      buildAll({ ...ws, check: true }),
      /out of sync[\s\S]*M fixture-pack\/README\.md/,
    );

    await buildAll({ ...ws, check: false });
    fs.appendFileSync(ws.noticesPath, "tamper");
    await assert.rejects(
      buildAll({ ...ws, check: true }),
      /out of sync[\s\S]*THIRD_PARTY_NOTICES\.md/,
    );
  });

  test("CLI builds and verifies with --check", () => {
    const ws = setupWorkspace();
    const upstream = makeFixtureRepo({
      "s1/SKILL.md": "---\nname: s1\ndescription: S1.\n---\nBody\n",
      LICENSE: "MIT\n",
    });
    trackTemp(upstream.dir);

    writeJson(ws.sourcesPath, {
      upstreams: {
        "o/r": { repo: upstream.url, ref: "main", sha: upstream.sha, license: "LICENSE", author: "O" },
      },
      plugins: {
        "fixture-pack": { skills: [{ upstream: "o/r", path: "s1" }] },
      },
    });
    writeOverride(ws.overridesRoot, "fixture-pack");

    const buildRes = spawnSync(
      process.execPath,
      [BUILD_CLI, "--root", ws.repoRoot, "--cache-dir", ws.cacheDir],
      { encoding: "utf8" },
    );
    assert.equal(buildRes.status, 0, buildRes.stderr);
    assert.match(buildRes.stdout.trim(), /^Built 1 plugins, 1 skills$/);

    const checkRes = spawnSync(
      process.execPath,
      [BUILD_CLI, "--check", "--root", ws.repoRoot, "--cache-dir", ws.cacheDir],
      { encoding: "utf8" },
    );
    assert.equal(checkRes.status, 0, checkRes.stderr);
    assert.match(checkRes.stdout.trim(), /^Verified 1 plugins, 1 skills$/);

    fs.appendFileSync(path.join(ws.outputRoot, "fixture-pack/README.md"), "drift");
    const failRes = spawnSync(
      process.execPath,
      [BUILD_CLI, "--check", "--root", ws.repoRoot, "--cache-dir", ws.cacheDir],
      { encoding: "utf8" },
    );
    assert.notEqual(failRes.status, 0);
    assert.match(failRes.stderr, /out of sync/);
  });
});
