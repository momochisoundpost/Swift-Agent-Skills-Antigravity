import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validatePlugins } from "../antigravity/validate.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const EXPECTED = {
  "swift-apple-frameworks": 7,
  "swift-app-store": 3,
  "swift-asc-cli": 26,
  "swift-core": 5,
  "swift-extras": 9,
  "swift-ios-simulator": 1,
  "swift-quality": 3,
  "swift-ui-craft": 7,
};

function loadAllowlist() {
  const rewritesPath = path.join(REPO_ROOT, "antigravity", "rewrites.json");
  if (!fs.existsSync(rewritesPath)) {
    return [];
  }
  const data = JSON.parse(fs.readFileSync(rewritesPath, "utf8"));
  return Array.isArray(data.allowlist) ? data.allowlist : [];
}

describe("catalog", () => {
  test("committed plugins match expected packs and 61 skills", () => {
    const allowlist = loadAllowlist();
    const report = validatePlugins(path.join(REPO_ROOT, "antigravity", "plugins"), {
      strict: true,
      allowlist,
    });
    assert.equal(
      report.valid,
      true,
      JSON.stringify(
        report.results.filter((x) => x.errors.length > 0 || x.warnings.length > 0),
        null,
        2,
      ),
    );
    assert.deepEqual(
      Object.fromEntries(report.results.map((x) => [x.plugin, x.skills.length])),
      EXPECTED,
    );
    assert.equal(report.skillCount, 61);
  });

  test("sources.json plugins match EXPECTED keys and every sha is 40-hex", () => {
    const sources = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, "antigravity", "sources.json"), "utf8"),
    );
    const upstreamKeys = Object.keys(sources.upstreams);
    assert.equal(upstreamKeys.length, 30);

    for (const [key, entry] of Object.entries(sources.upstreams)) {
      assert.match(entry.sha, /^[0-9a-f]{40}$/, `Invalid sha for ${key}: ${entry.sha}`);
      assert.equal(entry.repo, `https://github.com/${key}.git`);
      assert.equal(entry.ref, "main");
      assert.ok(entry.license, `Missing license path for ${key}`);
      assert.ok(entry.author, `Missing author for ${key}`);
    }

    assert.deepEqual(Object.keys(sources.plugins).sort(), Object.keys(EXPECTED).sort());
  });

  test("ios-simulator scripts and app-store-changelog script are recorded executable", () => {
    const executablesPath = path.join(REPO_ROOT, "antigravity", "plugins", "EXECUTABLES.txt");
    const lines = fs
      .readFileSync(executablesPath, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean);
    assert.ok(lines.filter((p) => p.startsWith("swift-ios-simulator/")).length >= 18);
    assert.ok(lines.some((p) => p.startsWith("swift-app-store/skills/app-store-changelog/")));
  });

  test("no unlicensed upstream is bundled", () => {
    const raw = fs.readFileSync(path.join(REPO_ROOT, "antigravity", "sources.json"), "utf8");
    assert.doesNotMatch(raw, /SwiftAgents|figma-to-swiftui/);
  });

  test("THIRD_PARTY_NOTICES.md includes all 30 pinned upstream commits", () => {
    const sources = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, "antigravity", "sources.json"), "utf8"),
    );
    const notices = fs.readFileSync(path.join(REPO_ROOT, "THIRD_PARTY_NOTICES.md"), "utf8");
    for (const [key, entry] of Object.entries(sources.upstreams)) {
      assert.ok(notices.includes(`## ${key}`), `Missing section for ${key}`);
      assert.ok(notices.includes(entry.sha), `Missing sha for ${key}`);
    }
  });
});
