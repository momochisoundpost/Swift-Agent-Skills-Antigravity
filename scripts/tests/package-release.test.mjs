import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ANTIGRAVITY_SCHEMA_URL } from "../antigravity/lib.mjs";
import { packageRelease } from "../antigravity/package-release.mjs";
import { readZipEntries } from "../antigravity/zip.mjs";
import { makeTempDir } from "./helpers.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PACKAGE_CLI = path.join(REPO_ROOT, "scripts", "antigravity", "package-release.mjs");

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

function writeValidPlugin(root, name, { includeScript = false, skillBody = null } = {}) {
  const packDir = path.join(root, name);
  fs.mkdirSync(path.join(packDir, "assets"), { recursive: true });
  fs.writeFileSync(
    path.join(packDir, "assets", "logo.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"></svg>\n',
    "utf8",
  );
  fs.writeFileSync(path.join(packDir, "README.md"), `# ${name}\n`, "utf8");
  fs.writeFileSync(path.join(packDir, "NOTICE.md"), "# Notices\n", "utf8");
  writeJson(path.join(packDir, "plugin.json"), {
    $schema: ANTIGRAVITY_SCHEMA_URL,
    name,
    displayName: `${name} Tools`,
    description: "Valid fixture plugin description.",
    version: "1.0.0",
    logo: "assets/logo.svg",
    suggestedPrompts: ["Prompt one", "Prompt two", "Prompt three"],
    author: { name: "Author Name", url: "https://example.com" },
  });

  const skillDir = path.join(packDir, "skills", "s1");
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, "SKILL.md"),
    skillBody ?? "---\nname: s1\ndescription: Valid skill s1.\n---\nBody for s1.\n",
    "utf8",
  );

  if (includeScript) {
    const scriptsDir = path.join(skillDir, "scripts");
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.writeFileSync(path.join(scriptsDir, "run.sh"), "#!/bin/sh\necho ok\n", "utf8");
    fs.writeFileSync(path.join(scriptsDir, "helper.py"), "print('ok')\n", "utf8");
  }

  return packDir;
}

describe("packageRelease", () => {
  test("marks EXECUTABLES as 0755, includes EXECUTABLES.txt, excludes GENERATED.md, and sorts entries", () => {
    const root = trackTemp(makeTempDir("pkg-valid-"));
    const outDir = trackTemp(makeTempDir("pkg-out-"));
    const zipPath = path.join(outDir, "nested", "release", "out.zip");

    writeValidPlugin(root, "pack", { includeScript: true });
    fs.writeFileSync(
      path.join(root, "EXECUTABLES.txt"),
      "pack/skills/s1/scripts/run.sh\n",
      "utf8",
    );
    fs.writeFileSync(path.join(root, "GENERATED.md"), "# Generated banner\n", "utf8");

    const res = packageRelease({ pluginsRoot: root, outPath: zipPath });
    assert.ok(fs.existsSync(zipPath));

    const entries = readZipEntries(fs.readFileSync(zipPath));
    assert.equal(res.fileCount, entries.length);

    const byName = new Map(entries.map((e) => [e.name, e.mode & 0o777]));
    assert.equal(byName.get("pack/skills/s1/scripts/run.sh"), 0o755);
    assert.equal(byName.get("pack/skills/s1/scripts/helper.py"), 0o644);
    assert.equal(byName.get("pack/plugin.json"), 0o644);
    assert.equal(byName.get("EXECUTABLES.txt"), 0o644);
    assert.equal(byName.has("GENERATED.md"), false);

    const names = entries.map((e) => e.name);
    const sorted = [...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    assert.deepEqual(names, sorted);
  });

  test("succeeds when EXECUTABLES.txt is absent", () => {
    const root = trackTemp(makeTempDir("pkg-noexec-"));
    const outDir = trackTemp(makeTempDir("pkg-noexec-out-"));
    const zipPath = path.join(outDir, "out.zip");

    writeValidPlugin(root, "pack", { includeScript: false });
    fs.writeFileSync(path.join(root, "GENERATED.md"), "# Generated banner\n", "utf8");

    const res = packageRelease({ pluginsRoot: root, outPath: zipPath });
    const entries = readZipEntries(fs.readFileSync(zipPath));
    assert.equal(res.fileCount, entries.length);
    assert.ok(!entries.some((e) => e.name === "EXECUTABLES.txt"));
    assert.ok(!entries.some((e) => e.name === "GENERATED.md"));
    assert.ok(entries.every((e) => (e.mode & 0o777) === 0o644));
  });

  test("refuses invalid plugins and strict-mode warnings, and honors allowlist", () => {
    const root = trackTemp(makeTempDir("pkg-invalid-"));
    const outDir = trackTemp(makeTempDir("pkg-invalid-out-"));
    const zipPath = path.join(outDir, "should-not-exist.zip");

    // Unlisted .sh script fails under strict validation
    writeValidPlugin(root, "pack", { includeScript: true });
    assert.throws(
      () => packageRelease({ pluginsRoot: root, outPath: zipPath }),
      /Cannot package invalid plugins/,
    );
    assert.equal(fs.existsSync(zipPath), false);

    // Fix EXECUTABLES.txt, but introduce host reference
    fs.writeFileSync(
      path.join(root, "EXECUTABLES.txt"),
      "pack/skills/s1/scripts/run.sh\n",
      "utf8",
    );
    fs.writeFileSync(
      path.join(root, "pack", "skills", "s1", "SKILL.md"),
      "---\nname: s1\ndescription: Skill.\n---\nSee Claude Code.\n",
      "utf8",
    );

    assert.throws(
      () => packageRelease({ pluginsRoot: root, outPath: zipPath }),
      /Cannot package invalid plugins[\s\S]*Claude Code/,
    );
    assert.equal(fs.existsSync(zipPath), false);

    const ok = packageRelease({
      pluginsRoot: root,
      outPath: zipPath,
      allowlist: [{ plugin: "pack", file: "skills/s1/SKILL.md", pattern: "Claude Code" }],
    });
    assert.ok(ok.fileCount > 0);
    assert.equal(fs.existsSync(zipPath), true);
  });

  test("CLI honors --root, --out, --rewrites and exits 1 on failure or bad arguments", () => {
    const root = trackTemp(makeTempDir("pkg-cli-"));
    const outDir = trackTemp(makeTempDir("pkg-cli-out-"));
    const zipPath = path.join(outDir, "cli-release.zip");
    const rewritesPath = path.join(outDir, "rewrites.json");

    writeValidPlugin(root, "pack", {
      includeScript: true,
      skillBody: "---\nname: s1\ndescription: Skill.\n---\nSee Claude Code.\n",
    });
    fs.writeFileSync(
      path.join(root, "EXECUTABLES.txt"),
      "pack/skills/s1/scripts/run.sh\n",
      "utf8",
    );
    writeJson(rewritesPath, {
      rewrites: [],
      allowlist: [{ plugin: "pack", file: "skills/s1/SKILL.md", pattern: "Claude Code" }],
    });

    const failRes = spawnSync(
      process.execPath,
      [PACKAGE_CLI, "--root", root, "--out", zipPath],
      { encoding: "utf8" },
    );
    assert.equal(failRes.status, 1);
    assert.match(failRes.stderr, /Cannot package invalid plugins/);
    assert.equal(fs.existsSync(zipPath), false);

    const badArgRes = spawnSync(process.execPath, [PACKAGE_CLI, "--bogus"], { encoding: "utf8" });
    assert.equal(badArgRes.status, 1);
    assert.match(badArgRes.stderr, /Unknown argument/);

    const missingRewritesRes = spawnSync(
      process.execPath,
      [PACKAGE_CLI, "--root", root, "--out", zipPath, "--rewrites", path.join(outDir, "missing.json")],
      { encoding: "utf8" },
    );
    assert.equal(missingRewritesRes.status, 1);
    assert.match(missingRewritesRes.stderr, /Missing rewrites file/);

    const okRes = spawnSync(
      process.execPath,
      [PACKAGE_CLI, `--root=${root}`, `--out=${zipPath}`, `--rewrites=${rewritesPath}`],
      { encoding: "utf8" },
    );
    assert.equal(okRes.status, 0, okRes.stderr);
    assert.ok(fs.existsSync(zipPath));
    const entries = readZipEntries(fs.readFileSync(zipPath));
    assert.ok(entries.some((e) => e.name === "pack/skills/s1/scripts/run.sh" && (e.mode & 0o777) === 0o755));
  });
});
