import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ANTIGRAVITY_SCHEMA_URL } from "../antigravity/lib.mjs";
import { createZip } from "../antigravity/zip.mjs";
import { EIGHT_PACK_NAMES, makeEightPackFixtureZip, makeTempDir } from "./helpers.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const INSTALL_PS1 = path.join(REPO_ROOT, "install.ps1");

function findPowerShell() {
  if (process.platform === "win32") {
    return "powershell";
  }
  const probe = spawnSync("pwsh", ["-NoLogo", "-NoProfile", "-Command", "1"], {
    encoding: "utf8",
  });
  return probe.error || probe.status !== 0 ? null : "pwsh";
}

const PS_SHELL = findPowerShell();
const MUST_NOT_SKIP = Boolean(process.env.CI && process.platform === "win32");

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

function runInstaller(args, { cwd = REPO_ROOT, env = process.env } = {}) {
  const res = spawnSync(
    PS_SHELL,
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", INSTALL_PS1, ...args],
    {
      cwd,
      env,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  if (res.error) {
    throw res.error;
  }
  return res;
}

function listDirNames(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }
  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function readJsonStrict(filePath) {
  const buf = fs.readFileSync(filePath);
  assert.equal(
    buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf,
    false,
    `Expected UTF-8 without BOM in ${filePath}`,
  );
  return JSON.parse(buf.toString("utf8"));
}

function makeSpacedFixtureZip(root, options = {}) {
  const zipDir = path.join(root, "zip with space");
  return makeEightPackFixtureZip(zipDir, options);
}

function assertBalancedPowerShellDelimiters(source) {
  const stack = [];
  const pairs = new Map([
    [")", "("],
    ["}", "{"],
    ["]", "["],
  ]);

  let i = 0;
  let state = "code"; // code | single | double | line_comment | block_comment
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];

    if (state === "line_comment") {
      if (ch === "\n") {
        state = "code";
      }
      i += 1;
      continue;
    }

    if (state === "block_comment") {
      if (ch === "#" && next === ">") {
        state = "code";
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }

    if (state === "single") {
      if (ch === "'" && next === "'") {
        i += 2;
        continue;
      }
      if (ch === "'") {
        state = "code";
      }
      i += 1;
      continue;
    }

    if (state === "double") {
      if (ch === "`") {
        i += 2;
        continue;
      }
      if (ch === '"' && next === '"') {
        i += 2;
        continue;
      }
      if (ch === '"') {
        state = "code";
      }
      i += 1;
      continue;
    }

    if (ch === "<" && next === "#") {
      state = "block_comment";
      i += 2;
      continue;
    }
    if (ch === "#") {
      state = "line_comment";
      i += 1;
      continue;
    }
    if (ch === "'") {
      state = "single";
      i += 1;
      continue;
    }
    if (ch === '"') {
      state = "double";
      i += 1;
      continue;
    }

    if (ch === "(" || ch === "{" || ch === "[") {
      stack.push(ch);
    } else if (pairs.has(ch)) {
      const expected = pairs.get(ch);
      const actual = stack.pop();
      assert.equal(actual, expected, `Unbalanced delimiter '${ch}' at index ${i}`);
    }
    i += 1;
  }

  assert.equal(state, "code", `Unterminated lexical state: ${state}`);
  assert.deepEqual(stack, [], `Unclosed delimiters: ${stack.join(", ")}`);
}

describe("install.ps1 static checks", () => {
  test("script is PS 5.1-safe, enables TLS 1.2, has balanced delimiters, and never mentions config.json", () => {
    assert.ok(fs.existsSync(INSTALL_PS1), `Missing ${INSTALL_PS1}`);
    const text = fs.readFileSync(INSTALL_PS1, "utf8");

    assert.doesNotMatch(text, /config\.json/i);
    assert.doesNotMatch(text, /\?\?/);
    assert.doesNotMatch(text, /\?:/);
    assert.doesNotMatch(text, /-AsHashtable\b/i);
    assert.doesNotMatch(text, /-Parallel\b/i);
    assert.doesNotMatch(text, /\$IsWindows\b/i);
    assert.doesNotMatch(text, /Join-Path[^\r\n]*'[^']*\\[^']*'/);
    assert.match(text, /SecurityProtocolType\]::Tls12/);
    assert.match(text, /\$PackTable\b/);

    for (const pack of EIGHT_PACK_NAMES) {
      assert.match(text, new RegExp(`'${pack}'`));
    }

    assertBalancedPowerShellDelimiters(text);
  });
});

describe("install.ps1 runtime", { skip: !PS_SHELL && !MUST_NOT_SKIP }, () => {
  test("PS_SHELL is available on Windows CI", () => {
    assert.ok(PS_SHELL, "PowerShell must be available to run install.ps1 tests");
  });

  test("PowerShell Language Parser parses install.ps1 with zero errors", () => {
    const parseRes = spawnSync(
      PS_SHELL,
      [
        "-NoProfile",
        "-Command",
        "$errors = $null; $tokens = $null; [void][System.Management.Automation.Language.Parser]::ParseFile($env:TARGET_PS1, [ref]$tokens, [ref]$errors); if ($errors.Count -gt 0) { $errors | ForEach-Object { [Console]::Error.WriteLine($_.Message) }; exit 1 }",
      ],
      {
        encoding: "utf8",
        env: { ...process.env, TARGET_PS1: INSTALL_PS1 },
      },
    );
    assert.equal(parseRes.status, 0, parseRes.stderr);
  });

  test("default installs swift-core only into spaced destination from spaced zip", () => {
    const root = trackTemp(makeTempDir("ps1-default-"));
    const zipPath = makeSpacedFixtureZip(root);
    const dest = path.join(root, "dest with space");

    const res = runInstaller(["-FromZip", zipPath, "-Destination", dest]);
    assert.equal(res.status, 0, `${res.stdout}\n${res.stderr}`);
    assert.deepEqual(listDirNames(dest), ["swift-core"]);

    const coreManifest = readJsonStrict(path.join(dest, "swift-core", "plugin.json"));
    assert.equal(coreManifest.name, "swift-core");
    assert.equal(Object.hasOwn(coreManifest, "disabled"), false);

    assert.match(res.stdout, /Installed:\s*swift-core/);
    assert.match(
      res.stdout,
      /Open Antigravity -> Customizations -> Installed \(no restart needed\)\./,
    );
    assert.equal(fs.existsSync(path.join(root, ".swift-agent-skills-staging")), false);
  });

  test("default destination without -Destination uses USERPROFILE\\.gemini\\config\\plugins", () => {
    const root = trackTemp(makeTempDir("ps1-profile-"));
    const zipPath = makeSpacedFixtureZip(root);
    const fakeProfile = path.join(root, "user with space");
    fs.mkdirSync(fakeProfile, { recursive: true });

    const res = runInstaller(["-FromZip", zipPath], {
      env: { ...process.env, USERPROFILE: fakeProfile },
    });
    assert.equal(res.status, 0, `${res.stdout}\n${res.stderr}`);

    const expectedDest = path.join(fakeProfile, ".gemini", "config", "plugins");
    assert.deepEqual(listDirNames(expectedDest), ["swift-core"]);
    assert.equal(
      fs.existsSync(path.join(fakeProfile, ".gemini", "config", ".swift-agent-skills-staging")),
      false,
    );
  });

  test("additive -Packs keeps existing swift-core and foreign plugins", () => {
    const root = trackTemp(makeTempDir("ps1-additive-"));
    const zipPath = makeSpacedFixtureZip(root);
    const dest = path.join(root, "dest with space");

    const first = runInstaller(["-FromZip", zipPath, "-Destination", dest]);
    assert.equal(first.status, 0, first.stderr);

    const foreignDir = path.join(dest, "superpowers");
    fs.mkdirSync(foreignDir, { recursive: true });
    fs.writeFileSync(path.join(foreignDir, "marker.txt"), "foreign-keep\n", "utf8");

    const second = runInstaller(["-FromZip", zipPath, "-Destination", dest, "-Packs", "ui-craft"]);
    assert.equal(second.status, 0, `${second.stdout}\n${second.stderr}`);

    assert.deepEqual(listDirNames(dest), ["superpowers", "swift-core", "swift-ui-craft"]);
    assert.equal(fs.readFileSync(path.join(foreignDir, "marker.txt"), "utf8"), "foreign-keep\n");
    assert.equal(readJsonStrict(path.join(dest, "swift-core", "plugin.json")).name, "swift-core");
  });

  test("-Packs ' Core,UI-Craft,swift-core ' normalizes, maps aliases, and deduplicates", () => {
    const root = trackTemp(makeTempDir("ps1-normalize-"));
    const zipPath = makeSpacedFixtureZip(root);
    const dest = path.join(root, "dest with space");

    const res = runInstaller([
      "-FromZip",
      zipPath,
      "-Destination",
      dest,
      "-Packs",
      " Core,UI-Craft,swift-core ",
    ]);
    assert.equal(res.status, 0, `${res.stdout}\n${res.stderr}`);
    assert.deepEqual(listDirNames(dest), ["swift-core", "swift-ui-craft"]);
  });

  test("unknown pack exits 2, prints Valid packs:, and installs nothing", () => {
    const root = trackTemp(makeTempDir("ps1-unknown-"));
    const zipPath = makeSpacedFixtureZip(root);
    const dest = path.join(root, "dest with space");

    const res = runInstaller(["-FromZip", zipPath, "-Destination", dest, "-Packs", "core,bogus"]);
    assert.equal(res.status, 2);
    const combined = `${res.stdout}\n${res.stderr}`;
    assert.match(combined, /Unknown pack 'bogus'/);
    assert.match(combined, /Valid packs:/);
    assert.equal(fs.existsSync(dest), false);
  });

  test("conflicting switches and empty -Packs exit 2 and install nothing", () => {
    const root = trackTemp(makeTempDir("ps1-conflicts-"));
    const zipPath = makeSpacedFixtureZip(root);
    const dest = path.join(root, "dest with space");

    for (const args of [
      ["-FromZip", zipPath, "-Destination", dest, "-All", "-Packs", "core"],
      ["-FromZip", zipPath, "-Destination", dest, "-AllDisabled", "-Packs", "core"],
      ["-FromZip", zipPath, "-Destination", dest, "-All", "-AllDisabled"],
      ["-FromZip", zipPath, "-Destination", dest, "-Packs", " , "],
    ]) {
      const res = runInstaller(args);
      assert.equal(res.status, 2, `Expected exit 2 for args ${args.join(" ")}, got ${res.status}`);
      assert.equal(fs.existsSync(dest), false);
    }
  });

  test("-AllDisabled injects disabled into non-core only; re-running -Packs ui-craft removes disabled", () => {
    const root = trackTemp(makeTempDir("ps1-all-disabled-"));
    const zipPath = makeSpacedFixtureZip(root);
    const dest = path.join(root, "dest with space");

    const res = runInstaller(["-FromZip", zipPath, "-Destination", dest, "-AllDisabled"]);
    assert.equal(res.status, 0, `${res.stdout}\n${res.stderr}`);
    assert.deepEqual(listDirNames(dest), [...EIGHT_PACK_NAMES].sort());

    for (const pack of EIGHT_PACK_NAMES) {
      const manifest = readJsonStrict(path.join(dest, pack, "plugin.json"));
      if (pack === "swift-core") {
        assert.equal(Object.hasOwn(manifest, "disabled"), false);
      } else {
        assert.equal(manifest.disabled, true, `Expected disabled:true on ${pack}`);
      }
    }

    const reEnable = runInstaller(["-FromZip", zipPath, "-Destination", dest, "-Packs", "ui-craft"]);
    assert.equal(reEnable.status, 0, `${reEnable.stdout}\n${reEnable.stderr}`);

    const uiCraft = readJsonStrict(path.join(dest, "swift-ui-craft", "plugin.json"));
    assert.equal(Object.hasOwn(uiCraft, "disabled"), false);

    const frameworks = readJsonStrict(path.join(dest, "swift-apple-frameworks", "plugin.json"));
    assert.equal(frameworks.disabled, true);
  });

  test("-Workspace installs into <cwd>\\.agents\\plugins with spaced cwd", () => {
    const root = trackTemp(makeTempDir("ps1-workspace-"));
    const zipPath = makeSpacedFixtureZip(root);
    const workspaceDir = path.join(root, "workspace with space");
    fs.mkdirSync(workspaceDir, { recursive: true });

    const res = runInstaller(["-FromZip", zipPath, "-Workspace"], { cwd: workspaceDir });
    assert.equal(res.status, 0, `${res.stdout}\n${res.stderr}`);

    const expectedDest = path.join(workspaceDir, ".agents", "plugins");
    assert.deepEqual(listDirNames(expectedDest), ["swift-core"]);
    assert.equal(
      fs.existsSync(path.join(workspaceDir, ".agents", ".swift-agent-skills-staging")),
      false,
    );
  });

  test("-Uninstall removes selected or all 8 known packs and preserves foreign plugins", () => {
    const root = trackTemp(makeTempDir("ps1-uninstall-"));
    const zipPath = makeSpacedFixtureZip(root);
    const dest = path.join(root, "dest with space");

    const installRes = runInstaller(["-FromZip", zipPath, "-Destination", dest, "-All"]);
    assert.equal(installRes.status, 0, installRes.stderr);

    const swiftFoo = path.join(dest, "swift-foo");
    const superpowers = path.join(dest, "superpowers");
    fs.mkdirSync(swiftFoo, { recursive: true });
    fs.mkdirSync(superpowers, { recursive: true });
    fs.writeFileSync(path.join(swiftFoo, "keep.txt"), "swift-foo\n", "utf8");
    fs.writeFileSync(path.join(superpowers, "keep.txt"), "superpowers\n", "utf8");

    const singleUninstall = runInstaller([
      "-Destination",
      dest,
      "-Uninstall",
      "-Packs",
      "ui-craft",
    ]);
    assert.equal(singleUninstall.status, 0, singleUninstall.stderr);
    assert.equal(fs.existsSync(path.join(dest, "swift-ui-craft")), false);
    assert.equal(fs.existsSync(path.join(dest, "swift-core")), true);
    assert.equal(fs.existsSync(swiftFoo), true);
    assert.equal(fs.existsSync(superpowers), true);

    const allUninstall = runInstaller(["-Destination", dest, "-Uninstall"]);
    assert.equal(allUninstall.status, 0, allUninstall.stderr);
    assert.deepEqual(listDirNames(dest), ["superpowers", "swift-foo"]);
    assert.equal(fs.readFileSync(path.join(swiftFoo, "keep.txt"), "utf8"), "swift-foo\n");
    assert.equal(fs.readFileSync(path.join(superpowers, "keep.txt"), "utf8"), "superpowers\n");
  });

  test("corrupt -FromZip exits non-zero and keeps existing install untouched", () => {
    const root = trackTemp(makeTempDir("ps1-corrupt-"));
    const zipPath = makeSpacedFixtureZip(root);
    const dest = path.join(root, "dest with space");

    const ok = runInstaller(["-FromZip", zipPath, "-Destination", dest]);
    assert.equal(ok.status, 0, ok.stderr);

    const coreManifestPath = path.join(dest, "swift-core", "plugin.json");
    const beforeBytes = fs.readFileSync(coreManifestPath);

    const corruptZip = path.join(root, "zip with space", "corrupt.zip");
    fs.writeFileSync(corruptZip, "this is definitely not a zip archive", "utf8");

    const fail = runInstaller(["-FromZip", corruptZip, "-Destination", dest]);
    assert.notEqual(fail.status, 0);
    assert.deepEqual(fs.readFileSync(coreManifestPath), beforeBytes);
    assert.equal(fs.existsSync(path.join(root, ".swift-agent-skills-staging")), false);
  });

  test("fail-closed: archive missing a requested pack exits non-zero and leaves destination untouched", () => {
    const root = trackTemp(makeTempDir("ps1-missing-pack-"));
    const fullZip = makeSpacedFixtureZip(root, { zipName: "full.zip" });
    const partialZip = makeSpacedFixtureZip(root, {
      packs: ["swift-core"],
      zipName: "partial.zip",
    });
    const dest = path.join(root, "dest with space");

    const init = runInstaller(["-FromZip", fullZip, "-Destination", dest]);
    assert.equal(init.status, 0, init.stderr);
    const coreManifestPath = path.join(dest, "swift-core", "plugin.json");
    const sentinelManifest = Buffer.from('{"name":"swift-core","sentinel":true}\n', "utf8");
    fs.writeFileSync(coreManifestPath, sentinelManifest);

    const fail = runInstaller([
      "-FromZip",
      partialZip,
      "-Destination",
      dest,
      "-Packs",
      "core,ui-craft",
    ]);
    assert.notEqual(fail.status, 0);
    assert.deepEqual(fs.readFileSync(coreManifestPath), sentinelManifest);
    assert.equal(fs.existsSync(path.join(dest, "swift-ui-craft")), false);
    assert.equal(fs.existsSync(path.join(root, ".swift-agent-skills-staging")), false);
  });

  test("supports GitHub branch-archive zip layout offline via -FromZip", () => {
    const root = trackTemp(makeTempDir("ps1-branch-layout-"));
    const zipDir = path.join(root, "zip with space");
    fs.mkdirSync(zipDir, { recursive: true });
    const branchZipPath = path.join(zipDir, "main.zip");
    const dest = path.join(root, "dest with space");

    const manifest = `${JSON.stringify(
      {
        $schema: ANTIGRAVITY_SCHEMA_URL,
        name: "swift-core",
        displayName: "swift-core Tools",
        description: "Branch archive fixture.",
        version: "1.0.0",
        logo: "assets/logo.svg",
        suggestedPrompts: ["Prompt one", "Prompt two", "Prompt three"],
        author: { name: "Test Author", url: "https://example.com" },
      },
      null,
      2,
    )}\n`;

    const zipBuf = createZip([
      {
        name: "Swift-Agent-Skills-Antigravity-main/antigravity/plugins/swift-core/plugin.json",
        data: Buffer.from(manifest, "utf8"),
        mode: 0o644,
      },
      {
        name: "Swift-Agent-Skills-Antigravity-main/antigravity/plugins/swift-core/assets/logo.svg",
        data: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"></svg>\n'),
        mode: 0o644,
      },
      {
        name: "Swift-Agent-Skills-Antigravity-main/antigravity/plugins/swift-core/skills/s1/SKILL.md",
        data: Buffer.from("---\nname: s1\ndescription: Skill one.\n---\nBody\n"),
        mode: 0o644,
      },
    ]);
    fs.writeFileSync(branchZipPath, zipBuf);

    const res = runInstaller(["-FromZip", branchZipPath, "-Destination", dest]);
    assert.equal(res.status, 0, `${res.stdout}\n${res.stderr}`);
    assert.deepEqual(listDirNames(dest), ["swift-core"]);
    assert.equal(readJsonStrict(path.join(dest, "swift-core", "plugin.json")).name, "swift-core");
  });

  test("-List shows Installed column without network", () => {
    const root = trackTemp(makeTempDir("ps1-list-"));
    const zipPath = makeSpacedFixtureZip(root);
    const dest = path.join(root, "dest with space");

    const init = runInstaller(["-FromZip", zipPath, "-Destination", dest]);
    assert.equal(init.status, 0, init.stderr);

    const listRes = runInstaller(["-Destination", dest, "-List"]);
    assert.equal(listRes.status, 0, `${listRes.stdout}\n${listRes.stderr}`);
    assert.match(listRes.stdout, /\bInstalled\b/);

    for (const pack of EIGHT_PACK_NAMES) {
      assert.match(listRes.stdout, new RegExp(`\\b${pack}\\b`));
    }

    const coreLine = listRes.stdout.split(/\r?\n/).find((line) => line.includes("swift-core"));
    const uiCraftLine = listRes.stdout
      .split(/\r?\n/)
      .find((line) => line.includes("swift-ui-craft"));
    assert.ok(coreLine && /\bYes\b/i.test(coreLine), `Expected swift-core Yes in: ${coreLine}`);
    assert.ok(
      uiCraftLine && /\bNo\b/i.test(uiCraftLine),
      `Expected swift-ui-craft No in: ${uiCraftLine}`,
    );
  });

  test("works via [scriptblock]::Create one-liner style without terminating caller session", () => {
    const root = trackTemp(makeTempDir("ps1-scriptblock-"));
    const zipPath = makeSpacedFixtureZip(root);
    const dest = path.join(root, "dest with space");

    const script = [
      "$sb = [scriptblock]::Create([System.IO.File]::ReadAllText($env:TARGET_PS1, [System.Text.Encoding]::UTF8))",
      "& $sb -FromZip $env:TARGET_ZIP -Destination $env:TARGET_DEST -Packs core,ui-craft",
      "& $sb -Destination $env:TARGET_DEST -List",
      "Write-Host 'CALLER_ALIVE'",
    ].join("; ");

    const res = spawnSync(PS_SHELL, ["-NoProfile", "-Command", script], {
      encoding: "utf8",
      env: {
        ...process.env,
        TARGET_PS1: INSTALL_PS1,
        TARGET_ZIP: zipPath,
        TARGET_DEST: dest,
      },
    });
    assert.equal(res.status, 0, `${res.stdout}\n${res.stderr}`);
    assert.match(res.stdout, /CALLER_ALIVE/);
    assert.deepEqual(listDirNames(dest), ["swift-core", "swift-ui-craft"]);
  });

  test("usage error under [scriptblock]::Create throws without terminating caller session", () => {
    const script = [
      "$sb = [scriptblock]::Create([System.IO.File]::ReadAllText($env:TARGET_PS1, [System.Text.Encoding]::UTF8))",
      "$caught = $null",
      "try { & $sb -Packs bogus } catch { $caught = $_.Exception.Message }",
      "Write-Host \"CAUGHT:$caught\"",
      "Write-Host 'CALLER_ALIVE'",
    ].join("; ");

    const res = spawnSync(PS_SHELL, ["-NoProfile", "-Command", script], {
      encoding: "utf8",
      env: { ...process.env, TARGET_PS1: INSTALL_PS1 },
    });
    assert.equal(res.status, 0, `${res.stdout}\n${res.stderr}`);
    assert.match(res.stdout, /CAUGHT:Unknown pack 'bogus'/);
    assert.match(res.stdout, /Valid packs:/);
    assert.match(res.stdout, /CALLER_ALIVE/);
  });
});
