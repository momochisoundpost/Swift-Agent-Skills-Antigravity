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
const INSTALL_SH = path.join(REPO_ROOT, "install.sh");

function findPosixTools() {
  const probe = spawnSync(
    "sh",
    [
      "-c",
      "command -v unzip >/dev/null 2>&1 && command -v awk >/dev/null 2>&1 && command -v mktemp >/dev/null 2>&1",
    ],
    { encoding: "utf8" },
  );
  return !probe.error && probe.status === 0;
}

const HAS_POSIX_TOOLS = findPosixTools();
const MUST_NOT_SKIP = Boolean(process.env.CI && process.platform !== "win32");

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

function runInstaller(args, { cwd = REPO_ROOT, env = process.env, input } = {}) {
  const res = spawnSync("sh", [INSTALL_SH, ...args], {
    cwd,
    env,
    input,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (res.error) {
    throw res.error;
  }
  return res;
}

function runPipedInstaller(args, { cwd = REPO_ROOT, env = process.env } = {}) {
  const scriptText = fs.readFileSync(INSTALL_SH, "utf8");
  const res = spawnSync("sh", ["-s", "--", ...args], {
    cwd,
    env,
    input: scriptText,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
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

describe("install.sh static checks", () => {
  test("script uses LF, POSIX sh shebang, set -eu, no bashisms, and never mentions config.json", () => {
    assert.ok(fs.existsSync(INSTALL_SH), `Missing ${INSTALL_SH}`);
    const raw = fs.readFileSync(INSTALL_SH);
    assert.equal(
      raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf,
      false,
      "install.sh must not have a UTF-8 BOM",
    );
    const text = raw.toString("utf8");

    assert.equal(text.includes("\r"), false, "install.sh must use LF line endings");
    assert.match(text, /^#!\/bin\/sh\n/);
    assert.match(text, /\bset -eu\b/);
    assert.doesNotMatch(text, /config\.json/i);
    assert.doesNotMatch(text, /\[\[|\]\]/);
    assert.doesNotMatch(text, /\becho\s+-[en]\b/);
    assert.doesNotMatch(text, /<<</);
    assert.doesNotMatch(text, /pipefail/);
    assert.doesNotMatch(text, /(^|[;\n]\s*)local\s+/m);
    assert.doesNotMatch(text, /(^|[;\n]\s*)function\s+/m);
    assert.match(text, /momochisoundpost\/Swift-Agent-Skills-Antigravity/);
    assert.match(text, /swift-agent-skills-antigravity\.zip/);

    for (const pack of EIGHT_PACK_NAMES) {
      assert.match(text, new RegExp(`\\b${pack}\\b`));
    }
  });
});

describe("install.sh runtime", { skip: !HAS_POSIX_TOOLS && !MUST_NOT_SKIP }, () => {
  test("POSIX sh, unzip, awk, and mktemp are available on non-Windows CI", () => {
    assert.ok(HAS_POSIX_TOOLS, "POSIX sh, unzip, awk, and mktemp must be available on PATH");
  });

  test("sh -n parses install.sh with zero syntax errors", () => {
    const res = spawnSync("sh", ["-n", INSTALL_SH], { encoding: "utf8" });
    assert.equal(res.status, 0, res.stderr);
  });

  test("default installs swift-core only into spaced destination from spaced zip", () => {
    const root = trackTemp(makeTempDir("sh-default-"));
    const zipPath = makeSpacedFixtureZip(root);
    const dest = path.join(root, "dest with space");

    const res = runInstaller(["--from-zip", zipPath, "--dest", dest]);
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

  test("default destination without --dest uses $HOME/.gemini/config/plugins", () => {
    const root = trackTemp(makeTempDir("sh-home-"));
    const zipPath = makeSpacedFixtureZip(root);
    const fakeHome = path.join(root, "user with space");
    fs.mkdirSync(fakeHome, { recursive: true });

    const res = runInstaller(["--from-zip", zipPath], {
      env: { ...process.env, HOME: fakeHome },
    });
    assert.equal(res.status, 0, `${res.stdout}\n${res.stderr}`);

    const expectedDest = path.join(fakeHome, ".gemini", "config", "plugins");
    assert.deepEqual(listDirNames(expectedDest), ["swift-core"]);
    assert.equal(
      fs.existsSync(path.join(fakeHome, ".gemini", "config", ".swift-agent-skills-staging")),
      false,
    );
  });

  test("additive --packs keeps existing swift-core and foreign plugins", () => {
    const root = trackTemp(makeTempDir("sh-additive-"));
    const zipPath = makeSpacedFixtureZip(root);
    const dest = path.join(root, "dest with space");

    const first = runInstaller(["--from-zip", zipPath, "--dest", dest]);
    assert.equal(first.status, 0, first.stderr);

    const foreignDir = path.join(dest, "superpowers");
    fs.mkdirSync(foreignDir, { recursive: true });
    fs.writeFileSync(path.join(foreignDir, "marker.txt"), "foreign-keep\n", "utf8");

    const second = runInstaller([`--from-zip=${zipPath}`, `--dest=${dest}`, "--packs=ui-craft"]);
    assert.equal(second.status, 0, `${second.stdout}\n${second.stderr}`);

    assert.deepEqual(listDirNames(dest), ["superpowers", "swift-core", "swift-ui-craft"]);
    assert.equal(fs.readFileSync(path.join(foreignDir, "marker.txt"), "utf8"), "foreign-keep\n");
    assert.equal(readJsonStrict(path.join(dest, "swift-core", "plugin.json")).name, "swift-core");
  });

  test("--packs ' Core,UI-Craft,swift-core ' normalizes, maps aliases, and deduplicates", () => {
    const root = trackTemp(makeTempDir("sh-normalize-"));
    const zipPath = makeSpacedFixtureZip(root);
    const dest = path.join(root, "dest with space");

    const res = runInstaller([
      "--from-zip",
      zipPath,
      "--dest",
      dest,
      "--packs",
      " Core,UI-Craft,swift-core ",
    ]);
    assert.equal(res.status, 0, `${res.stdout}\n${res.stderr}`);
    assert.deepEqual(listDirNames(dest), ["swift-core", "swift-ui-craft"]);
  });

  test("unknown pack exits 2, prints Valid packs:, and installs nothing", () => {
    const root = trackTemp(makeTempDir("sh-unknown-"));
    const zipPath = makeSpacedFixtureZip(root);
    const dest = path.join(root, "dest with space");

    const res = runInstaller(["--from-zip", zipPath, "--dest", dest, "--packs", "core,bogus"]);
    assert.equal(res.status, 2);
    const combined = `${res.stdout}\n${res.stderr}`;
    assert.match(combined, /Unknown pack 'bogus'/);
    assert.match(combined, /Valid packs:/);
    assert.equal(fs.existsSync(dest), false);
  });

  test("conflicting flags, missing values, unknown flags, and empty --packs exit 2 and install nothing", () => {
    const root = trackTemp(makeTempDir("sh-conflicts-"));
    const zipPath = makeSpacedFixtureZip(root);
    const dest = path.join(root, "dest with space");

    for (const args of [
      ["--from-zip", zipPath, "--dest", dest, "--all", "--packs", "core"],
      ["--from-zip", zipPath, "--dest", dest, "--all-disabled", "--packs", "core"],
      ["--from-zip", zipPath, "--dest", dest, "--all", "--all-disabled"],
      ["--from-zip", zipPath, "--dest", dest, "--list", "--uninstall"],
      ["--from-zip", zipPath, "--dest", dest, "--uninstall", "--all-disabled"],
      ["--from-zip", zipPath, "--dest", dest, "--packs", " , "],
      ["--from-zip", zipPath, "--dest", dest, "--packs="],
      ["--from-zip", zipPath, "--dest", dest, "--packs"],
      ["--from-zip", zipPath, "--dest="],
      ["--from-zip", zipPath, "--dest", dest, "--version", ""],
      ["--from-zip", zipPath, "--dest", dest, "--unknown-flag"],
    ]) {
      const res = runInstaller(args);
      assert.equal(res.status, 2, `Expected exit 2 for args ${args.join(" ")}, got ${res.status}`);
      assert.equal(fs.existsSync(dest), false);
    }
  });

  test("--all-disabled injects disabled into non-core only; re-running --packs ui-craft removes disabled", () => {
    const root = trackTemp(makeTempDir("sh-all-disabled-"));
    const zipPath = makeSpacedFixtureZip(root);
    const dest = path.join(root, "dest with space");

    const res = runInstaller(["--from-zip", zipPath, "--dest", dest, "--all-disabled"]);
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

    const reEnable = runInstaller(["--from-zip", zipPath, "--dest", dest, "--packs", "ui-craft"]);
    assert.equal(reEnable.status, 0, `${reEnable.stdout}\n${reEnable.stderr}`);

    const uiCraft = readJsonStrict(path.join(dest, "swift-ui-craft", "plugin.json"));
    assert.equal(Object.hasOwn(uiCraft, "disabled"), false);

    const frameworks = readJsonStrict(path.join(dest, "swift-apple-frameworks", "plugin.json"));
    assert.equal(frameworks.disabled, true);
  });

  test("--workspace installs into <cwd>/.agents/plugins with spaced cwd", () => {
    const root = trackTemp(makeTempDir("sh-workspace-"));
    const zipPath = makeSpacedFixtureZip(root);
    const workspaceDir = path.join(root, "workspace with space");
    fs.mkdirSync(workspaceDir, { recursive: true });

    const res = runInstaller(["--from-zip", zipPath, "--workspace"], { cwd: workspaceDir });
    assert.equal(res.status, 0, `${res.stdout}\n${res.stderr}`);

    const expectedDest = path.join(workspaceDir, ".agents", "plugins");
    assert.deepEqual(listDirNames(expectedDest), ["swift-core"]);
    assert.equal(
      fs.existsSync(path.join(workspaceDir, ".agents", ".swift-agent-skills-staging")),
      false,
    );
  });

  test("--uninstall removes selected or all 8 known packs and preserves foreign plugins", () => {
    const root = trackTemp(makeTempDir("sh-uninstall-"));
    const zipPath = makeSpacedFixtureZip(root);
    const dest = path.join(root, "dest with space");

    const installRes = runInstaller(["--from-zip", zipPath, "--dest", dest, "--all"]);
    assert.equal(installRes.status, 0, installRes.stderr);

    const swiftFoo = path.join(dest, "swift-foo");
    const superpowers = path.join(dest, "superpowers");
    fs.mkdirSync(swiftFoo, { recursive: true });
    fs.mkdirSync(superpowers, { recursive: true });
    fs.writeFileSync(path.join(swiftFoo, "keep.txt"), "swift-foo\n", "utf8");
    fs.writeFileSync(path.join(superpowers, "keep.txt"), "superpowers\n", "utf8");

    const singleUninstall = runInstaller([
      "--dest",
      dest,
      "--uninstall",
      "--packs",
      "ui-craft",
    ]);
    assert.equal(singleUninstall.status, 0, singleUninstall.stderr);
    assert.equal(fs.existsSync(path.join(dest, "swift-ui-craft")), false);
    assert.equal(fs.existsSync(path.join(dest, "swift-core")), true);
    assert.equal(fs.existsSync(swiftFoo), true);
    assert.equal(fs.existsSync(superpowers), true);

    const allUninstall = runInstaller(["--dest", dest, "--uninstall"]);
    assert.equal(allUninstall.status, 0, allUninstall.stderr);
    assert.deepEqual(listDirNames(dest), ["superpowers", "swift-foo"]);
    assert.equal(fs.readFileSync(path.join(swiftFoo, "keep.txt"), "utf8"), "swift-foo\n");
    assert.equal(fs.readFileSync(path.join(superpowers, "keep.txt"), "utf8"), "superpowers\n");
  });

  test("corrupt --from-zip exits non-zero and keeps existing install untouched", () => {
    const root = trackTemp(makeTempDir("sh-corrupt-"));
    const zipPath = makeSpacedFixtureZip(root);
    const dest = path.join(root, "dest with space");

    const ok = runInstaller(["--from-zip", zipPath, "--dest", dest]);
    assert.equal(ok.status, 0, ok.stderr);

    const coreManifestPath = path.join(dest, "swift-core", "plugin.json");
    const beforeBytes = fs.readFileSync(coreManifestPath);

    const corruptZip = path.join(root, "zip with space", "corrupt.zip");
    fs.writeFileSync(corruptZip, "this is definitely not a zip archive", "utf8");

    const fail = runInstaller(["--from-zip", corruptZip, "--dest", dest]);
    assert.notEqual(fail.status, 0);
    assert.deepEqual(fs.readFileSync(coreManifestPath), beforeBytes);
    assert.equal(fs.existsSync(path.join(root, ".swift-agent-skills-staging")), false);
  });

  test("fail-closed: archive missing a requested pack exits non-zero and leaves destination untouched", () => {
    const root = trackTemp(makeTempDir("sh-missing-pack-"));
    const fullZip = makeSpacedFixtureZip(root, { zipName: "full.zip" });
    const partialZip = makeSpacedFixtureZip(root, {
      packs: ["swift-core"],
      zipName: "partial.zip",
    });
    const dest = path.join(root, "dest with space");

    const init = runInstaller(["--from-zip", fullZip, "--dest", dest]);
    assert.equal(init.status, 0, init.stderr);
    const coreManifestPath = path.join(dest, "swift-core", "plugin.json");
    const sentinelManifest = Buffer.from('{"name":"swift-core","sentinel":true}\n', "utf8");
    fs.writeFileSync(coreManifestPath, sentinelManifest);

    const fail = runInstaller([
      "--from-zip",
      partialZip,
      "--dest",
      dest,
      "--packs",
      "core,ui-craft",
    ]);
    assert.notEqual(fail.status, 0);
    assert.deepEqual(fs.readFileSync(coreManifestPath), sentinelManifest);
    assert.equal(fs.existsSync(path.join(dest, "swift-ui-craft")), false);
    assert.equal(fs.existsSync(path.join(root, ".swift-agent-skills-staging")), false);
  });

  test("supports GitHub branch-archive zip layout offline via --from-zip and applies EXECUTABLES.txt chmod", () => {
    const root = trackTemp(makeTempDir("sh-branch-layout-"));
    const zipDir = path.join(root, "zip with space");
    fs.mkdirSync(zipDir, { recursive: true });
    const branchZipPath = path.join(zipDir, "main.zip");
    const dest = path.join(root, "dest with space");

    const manifest = `${JSON.stringify(
      {
        $schema: ANTIGRAVITY_SCHEMA_URL,
        name: "swift-ios-simulator",
        displayName: "iOS Simulator Tools",
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
        name: "Swift-Agent-Skills-Antigravity-main/antigravity/plugins/EXECUTABLES.txt",
        data: Buffer.from(
          "swift-ios-simulator/skills/ios-simulator-skill/scripts/run.sh\n",
          "utf8",
        ),
        mode: 0o644,
      },
      {
        name: "Swift-Agent-Skills-Antigravity-main/antigravity/plugins/swift-ios-simulator/plugin.json",
        data: Buffer.from(manifest, "utf8"),
        mode: 0o644,
      },
      {
        name: "Swift-Agent-Skills-Antigravity-main/antigravity/plugins/swift-ios-simulator/assets/logo.svg",
        data: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"></svg>\n'),
        mode: 0o644,
      },
      {
        name: "Swift-Agent-Skills-Antigravity-main/antigravity/plugins/swift-ios-simulator/skills/ios-simulator-skill/SKILL.md",
        data: Buffer.from("---\nname: ios-simulator-skill\ndescription: Sim skill.\n---\nBody\n"),
        mode: 0o644,
      },
      {
        name: "Swift-Agent-Skills-Antigravity-main/antigravity/plugins/swift-ios-simulator/skills/ios-simulator-skill/scripts/run.sh",
        data: Buffer.from("#!/bin/sh\necho ok\n"),
        mode: 0o644,
      },
    ]);
    fs.writeFileSync(branchZipPath, zipBuf);

    const res = runInstaller([
      "--from-zip",
      branchZipPath,
      "--dest",
      dest,
      "--packs",
      "ios-simulator",
    ]);
    assert.equal(res.status, 0, `${res.stdout}\n${res.stderr}`);
    assert.deepEqual(listDirNames(dest), ["swift-ios-simulator"]);
    assert.equal(
      readJsonStrict(path.join(dest, "swift-ios-simulator", "plugin.json")).name,
      "swift-ios-simulator",
    );

    const runShPath = path.join(
      dest,
      "swift-ios-simulator",
      "skills",
      "ios-simulator-skill",
      "scripts",
      "run.sh",
    );
    assert.equal(fs.existsSync(runShPath), true);
    if (process.platform !== "win32") {
      assert.notEqual(fs.statSync(runShPath).mode & 0o111, 0, "Expected +x bit on run.sh");
    }
  });

  test("ios-simulator style script is executable after install", () => {
    const root = trackTemp(makeTempDir("sh-exec-"));
    const zipPath = makeSpacedFixtureZip(root);
    const dest = path.join(root, "dest with space");

    const res = runInstaller(["--from-zip", zipPath, "--dest", dest, "--packs", "ios-simulator"]);
    assert.equal(res.status, 0, `${res.stdout}\n${res.stderr}`);

    const runShPath = path.join(
      dest,
      "swift-ios-simulator",
      "skills",
      "ios-simulator-skill",
      "scripts",
      "run.sh",
    );
    assert.equal(fs.existsSync(runShPath), true);
    if (process.platform !== "win32") {
      assert.notEqual(fs.statSync(runShPath).mode & 0o111, 0, "Expected +x bit on run.sh");
    }
  });

  test("--list shows Installed column without network", () => {
    const root = trackTemp(makeTempDir("sh-list-"));
    const zipPath = makeSpacedFixtureZip(root);
    const dest = path.join(root, "dest with space");

    const init = runInstaller(["--from-zip", zipPath, "--dest", dest]);
    assert.equal(init.status, 0, init.stderr);

    const listRes = runInstaller(["--dest", dest, "--list"]);
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

  test("-h and --help print usage and exit 0 without modifying destination", () => {
    const root = trackTemp(makeTempDir("sh-help-"));
    const dest = path.join(root, "dest with space");

    for (const flag of ["-h", "--help"]) {
      const res = runInstaller([flag, "--dest", dest]);
      assert.equal(res.status, 0, `${res.stdout}\n${res.stderr}`);
      assert.match(res.stdout, /--packs/);
      assert.match(res.stdout, /--all-disabled/);
      assert.equal(fs.existsSync(dest), false);
    }
  });

  test("works when piped via stdin", () => {
    const root = trackTemp(makeTempDir("sh-stdin-"));
    const zipPath = makeSpacedFixtureZip(root);
    const dest = path.join(root, "dest with space");

    const res = runPipedInstaller(["--from-zip", zipPath, "--dest", dest, "--all-disabled"]);
    assert.equal(res.status, 0, `${res.stdout}\n${res.stderr}`);
    assert.deepEqual(listDirNames(dest), [...EIGHT_PACK_NAMES].sort());
    assert.equal(
      readJsonStrict(path.join(dest, "swift-ui-craft", "plugin.json")).disabled,
      true,
    );
    assert.equal(
      Object.hasOwn(readJsonStrict(path.join(dest, "swift-core", "plugin.json")), "disabled"),
      false,
    );
  });

  test("--version normalizes tag and fails closed without falling back to main.zip", () => {
    const root = trackTemp(makeTempDir("sh-version-"));
    const zipPath = makeSpacedFixtureZip(root);
    const dest = path.join(root, "dest with space");
    const binDir = path.join(root, "stub bin");
    const urlLog = path.join(root, "curl-urls.log");
    fs.mkdirSync(binDir, { recursive: true });

    const stubCurl = [
      "#!/bin/sh",
      "out=''",
      "url=''",
      'while [ "$#" -gt 0 ]; do',
      '  case "$1" in',
      '    -o) out="$2"; shift 2 ;;',
      '    -*) shift ;;',
      '    *) url="$1"; shift ;;',
      "  esac",
      "done",
      'printf "%s\\n" "$url" >> "$STUB_CURL_LOG"',
      'case "$url" in',
      '  */releases/download/v1.2.3/swift-agent-skills-antigravity.zip)',
      '    cp -- "$STUB_ZIP" "$out"',
      "    exit 0",
      "    ;;",
      "  *)",
      "    exit 22",
      "    ;;",
      "esac",
      "",
    ].join("\n");
    fs.writeFileSync(path.join(binDir, "curl"), stubCurl, { mode: 0o755 });

    const env = {
      ...process.env,
      PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
      STUB_CURL_LOG: urlLog,
      STUB_ZIP: zipPath,
    };

    const ok = runInstaller(["--version", "1.2.3", "--dest", dest], { env });
    assert.equal(ok.status, 0, `${ok.stdout}\n${ok.stderr}`);
    assert.deepEqual(listDirNames(dest), ["swift-core"]);

    const logged = fs.readFileSync(urlLog, "utf8").trim().split(/\r?\n/);
    assert.deepEqual(logged, [
      "https://github.com/momochisoundpost/Swift-Agent-Skills-Antigravity/releases/download/v1.2.3/swift-agent-skills-antigravity.zip",
    ]);

    fs.writeFileSync(urlLog, "", "utf8");
    const coreManifestPath = path.join(dest, "swift-core", "plugin.json");
    const beforeBytes = fs.readFileSync(coreManifestPath);

    const fail = runInstaller(["--version", "v9.9.9", "--dest", dest, "--packs", "ui-craft"], {
      env,
    });
    assert.notEqual(fail.status, 0);
    assert.match(fail.stderr, /releases/);
    assert.match(fail.stderr, /agy plugin install/);
    assert.deepEqual(fs.readFileSync(coreManifestPath), beforeBytes);
    assert.equal(fs.existsSync(path.join(dest, "swift-ui-craft")), false);

    const failLogged = fs.readFileSync(urlLog, "utf8").trim().split(/\r?\n/);
    assert.deepEqual(failLogged, [
      "https://github.com/momochisoundpost/Swift-Agent-Skills-Antigravity/releases/download/v9.9.9/swift-agent-skills-antigravity.zip",
    ]);
  });

  test("default download warns and falls back to main.zip when latest release asset is missing", () => {
    const root = trackTemp(makeTempDir("sh-fallback-"));
    const mainZip = path.join(root, "main.zip");
    const dest = path.join(root, "dest with space");
    const binDir = path.join(root, "stub bin");
    const urlLog = path.join(root, "curl-urls.log");
    fs.mkdirSync(binDir, { recursive: true });

    const manifest = `${JSON.stringify(
      {
        $schema: ANTIGRAVITY_SCHEMA_URL,
        name: "swift-core",
        displayName: "Swift Core",
        description: "Fallback branch archive fixture.",
        version: "1.0.0",
        logo: "assets/logo.svg",
        suggestedPrompts: ["Prompt one", "Prompt two", "Prompt three"],
        author: { name: "Test Author", url: "https://example.com" },
      },
      null,
      2,
    )}\n`;
    fs.writeFileSync(
      mainZip,
      createZip([
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
      ]),
    );

    const stubCurl = [
      "#!/bin/sh",
      "out=''",
      "url=''",
      'while [ "$#" -gt 0 ]; do',
      '  case "$1" in',
      '    -o) out="$2"; shift 2 ;;',
      '    -*) shift ;;',
      '    *) url="$1"; shift ;;',
      "  esac",
      "done",
      'printf "%s\\n" "$url" >> "$STUB_CURL_LOG"',
      'case "$url" in',
      '  */archive/refs/heads/main.zip)',
      '    cp -- "$STUB_MAIN_ZIP" "$out"',
      "    exit 0",
      "    ;;",
      "  *)",
      "    exit 22",
      "    ;;",
      "esac",
      "",
    ].join("\n");
    fs.writeFileSync(path.join(binDir, "curl"), stubCurl, { mode: 0o755 });

    const env = {
      ...process.env,
      PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
      STUB_CURL_LOG: urlLog,
      STUB_MAIN_ZIP: mainZip,
    };

    const res = runInstaller(["--dest", dest], { env });
    assert.equal(res.status, 0, `${res.stdout}\n${res.stderr}`);
    assert.match(res.stderr, /falling back to main branch archive/i);
    assert.deepEqual(listDirNames(dest), ["swift-core"]);

    const logged = fs.readFileSync(urlLog, "utf8").trim().split(/\r?\n/);
    assert.deepEqual(logged, [
      "https://github.com/momochisoundpost/Swift-Agent-Skills-Antigravity/releases/latest/download/swift-agent-skills-antigravity.zip",
      "https://github.com/momochisoundpost/Swift-Agent-Skills-Antigravity/archive/refs/heads/main.zip",
    ]);
  });
});
