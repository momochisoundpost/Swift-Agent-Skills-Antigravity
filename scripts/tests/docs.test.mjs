import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const EXPECTED_PACKS = {
  "swift-core": { alias: "core", skills: 5, displayName: "Swift Core (Community)" },
  "swift-ui-craft": { alias: "ui-craft", skills: 7, displayName: "SwiftUI Craft (Community)" },
  "swift-apple-frameworks": {
    alias: "frameworks",
    skills: 7,
    displayName: "Apple Frameworks for Swift (Community)",
  },
  "swift-quality": { alias: "quality", skills: 3, displayName: "Swift Code Quality (Community)" },
  "swift-app-store": { alias: "app-store", skills: 3, displayName: "App Store Toolkit (Community)" },
  "swift-asc-cli": { alias: "asc-cli", skills: 26, displayName: "App Store Connect CLI (Community)" },
  "swift-ios-simulator": { alias: "ios-simulator", skills: 1, displayName: "iOS Simulator (Community)" },
  "swift-extras": { alias: "extras", skills: 9, displayName: "Swift Extras: Alternatives (Community)" },
};

function readTextLf(relPath) {
  const fullPath = path.join(REPO_ROOT, relPath);
  assert.ok(fs.existsSync(fullPath), `Missing required file: ${relPath}`);
  const raw = fs.readFileSync(fullPath);
  assert.equal(
    raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf,
    false,
    `${relPath} must not contain a UTF-8 BOM`,
  );
  const text = raw.toString("utf8");
  assert.equal(text.includes("\r"), false, `${relPath} must use LF line endings`);
  return text;
}

function parsePs1PackTable(ps1Text) {
  const match = ps1Text.match(/\$PackTable\s*=\s*@\(([\s\S]*?)\r?\n[ \t]*\)/);
  assert.ok(match, "Could not locate $PackTable in install.ps1");
  const rows = [];
  for (const line of match[1].split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const rowMatch = trimmed.match(
      /Name\s*=\s*'([^']+)'\s*;\s*Alias\s*=\s*'([^']+)'\s*;\s*Skills\s*=\s*(\d+)\s*;/,
    );
    assert.ok(rowMatch, `Unrecognized $PackTable row in install.ps1: ${trimmed}`);
    rows.push({
      name: rowMatch[1],
      alias: rowMatch[2],
      skills: Number(rowMatch[3]),
    });
  }
  return rows;
}

function parseShPackTable(shText) {
  const match = shText.match(/PACK_TABLE='\r?\n([\s\S]*?)\r?\n'/);
  assert.ok(match, "Could not locate PACK_TABLE in install.sh");
  const rows = [];
  for (const line of match[1].split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const parts = trimmed.split("|");
    assert.equal(parts.length, 4, `Expected 4 pipe-delimited fields in PACK_TABLE row: ${trimmed}`);
    rows.push({
      name: parts[0],
      alias: parts[1],
      skills: Number(parts[2]),
    });
  }
  return rows;
}

function parseMarkdownPackRows(mdText, expectedHeadingFragment) {
  const lines = mdText.split("\n");
  const headerIdx = lines.findIndex(
    (line) => line.startsWith("|") && line.includes(expectedHeadingFragment),
  );
  assert.notEqual(headerIdx, -1, `Could not locate pack table with '${expectedHeadingFragment}'`);

  const rows = [];
  for (let i = headerIdx + 2; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line.startsWith("|")) {
      break;
    }
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
    assert.ok(cells.length >= 5, `Unexpected pack table row format: ${line}`);
    rows.push(cells);
  }
  return rows;
}

function assertRelativeLinksExist(mdText, relFile) {
  const withoutCodeFences = mdText.replace(/```[\s\S]*?```/g, "");
  const linkRe = /\[[^\]]+\]\(([^)\s]+)\)/g;
  for (const match of withoutCodeFences.matchAll(linkRe)) {
    const target = match[1];
    if (
      target.startsWith("https://") ||
      target.startsWith("http://") ||
      target.startsWith("customization://") ||
      target.startsWith("#")
    ) {
      continue;
    }
    const cleanTarget = target.split("#")[0];
    const resolved = path.resolve(REPO_ROOT, path.dirname(relFile), cleanTarget);
    assert.ok(
      fs.existsSync(resolved),
      `${relFile} contains broken relative link '${target}' (${resolved})`,
    );
  }
}

describe("documentation consistency", () => {
  test("README has both one-liners, the prompt, all 8 packs, credits, safety note, and unbundled links", () => {
    const readme = readTextLf("README.md");
    assertRelativeLinksExist(readme, "README.md");
    const sources = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, "antigravity", "sources.json"), "utf8"),
    );

    assert.match(readme, /not affiliated with or endorsed by Apple, Google/i);
    assert.match(readme, /Google AI Plus/i);
    assert.match(
      readme,
      /curl -fsSL https:\/\/raw\.githubusercontent\.com\/momochisoundpost\/Swift-Agent-Skills-Antigravity\/main\/install\.sh \| sh/,
    );
    assert.match(
      readme,
      /irm https:\/\/raw\.githubusercontent\.com\/momochisoundpost\/Swift-Agent-Skills-Antigravity\/main\/install\.ps1 \| iex/,
    );
    assert.match(
      readme,
      /Install Swift Agent Skills from https:\/\/github\.com\/momochisoundpost\/Swift-Agent-Skills-Antigravity/,
    );

    for (const flag of ["--packs", "--all-disabled", "--workspace", "--list", "--uninstall"]) {
      assert.ok(readme.includes(flag), `README.md missing install.sh flag ${flag}`);
    }
    for (const flag of ["-Packs", "-AllDisabled", "-Workspace", "-List", "-Uninstall"]) {
      assert.ok(readme.includes(flag), `README.md missing install.ps1 flag ${flag}`);
    }
    assert.match(readme, /agy plugin install/);
    assert.match(readme, /swift-agent-skills-antigravity\.zip/);

    const readmePackRows = parseMarkdownPackRows(readme, "Pack (`name`)").map((cells) => ({
      name: cells[1].replace(/[*`]/g, ""),
      alias: cells[2].replace(/[*`]/g, ""),
      skills: Number(cells[4]),
    }));
    assert.deepEqual(
      readmePackRows,
      Object.entries(EXPECTED_PACKS).map(([name, info]) => ({
        name,
        alias: info.alias,
        skills: info.skills,
      })),
    );
    assert.match(readme, /\b61\b/);
    assert.match(readme, /Customizations/);
    assert.match(readme, /swift-extras[\s\S]*overlap|overlap[\s\S]*swift-extras/i);
    assert.match(readme, /xcode/i);
    assert.match(readme, /Python 3\.12/i);
    assert.match(readme, /\bidb\b/);
    assert.match(readme, /\basc\b/);

    assert.match(readme, /Important Safety Note/i);
    assert.match(readme, /twostraws\/Swift-Agent-Skills/);
    assert.match(readme, /Paul Hudson/);
    assert.match(readme, /rudrankriyam\/app-store-connect-cli-skills/);
    for (const upstreamKey of Object.keys(sources.upstreams)) {
      assert.ok(
        readme.includes(upstreamKey),
        `README.md missing upstream attribution for ${upstreamKey}`,
      );
    }

    assert.match(readme, /^#{2,3} Unbundled Community Links \(No License Declared\)$/m);
    assert.match(readme, /twostraws\/SwiftAgents/);
    assert.match(readme, /daetojemax\/figma-to-swiftui-skill/);

    for (const doc of [
      "INSTALL.md",
      "THIRD_PARTY_NOTICES.md",
      "CHANGELOG-antigravity.md",
      "RELEASING-antigravity.md",
    ]) {
      assert.ok(readme.includes(doc), `README.md missing pointer to ${doc}`);
    }
  });

  test("INSTALL.md has human guides and Antigravity instructions without config.json edits", () => {
    const installDoc = readTextLf("INSTALL.md");
    assertRelativeLinksExist(installDoc, "INSTALL.md");

    const installPackRows = parseMarkdownPackRows(installDoc, "Pack (`name`)").map((cells) => ({
      name: cells[0].replace(/[*`]/g, ""),
      alias: cells[1].replace(/[*`]/g, ""),
      skills: Number(cells[3]),
      displayName: cells[4],
    }));
    assert.deepEqual(
      installPackRows,
      Object.entries(EXPECTED_PACKS).map(([name, info]) => ({
        name,
        alias: info.alias,
        skills: info.skills,
        displayName: info.displayName,
      })),
    );

    assert.match(installDoc, /## Instructions for Antigravity/);
    const agentHeadingIdx = installDoc.indexOf("## Instructions for Antigravity");
    assert.notEqual(agentHeadingIdx, -1, "INSTALL.md missing ## Instructions for Antigravity");
    const agentSection = installDoc.slice(agentHeadingIdx);
    assert.match(agentSection, /sh -s --/);
    assert.match(agentSection, /\[scriptblock\]::Create/);
    for (const flag of ["--packs", "-Packs", "--all-disabled", "-AllDisabled", "--workspace", "-Workspace"]) {
      assert.ok(
        agentSection.includes(flag),
        `INSTALL.md Instructions for Antigravity missing ${flag}`,
      );
    }

    assert.match(installDoc, /config\.json/);
    assert.match(installDoc, /never.*config\.json|do not.*config\.json/i);
    assert.match(installDoc, /install\.sh/);
    assert.match(installDoc, /install\.ps1/);
    assert.match(installDoc, /agy plugin install/);
    assert.match(installDoc, /swift-agent-skills-antigravity\.zip/);

    for (const [pack, info] of Object.entries(EXPECTED_PACKS)) {
      const link = `[${info.displayName}](customization://${pack})`;
      assert.ok(installDoc.includes(link), `INSTALL.md missing link ${link}`);
    }
  });

  test("RELEASING-antigravity.md and CHANGELOG-antigravity.md document the release pipeline", () => {
    const changelog = readTextLf("CHANGELOG-antigravity.md");
    assertRelativeLinksExist(changelog, "CHANGELOG-antigravity.md");
    assert.match(changelog, /1\.0\.0/);
    assert.match(changelog, /Unreleased/i);
    assert.match(changelog, /\b8\b.*pack|8 plugin packs|8 modular/i);
    assert.match(changelog, /\b61\b/);
    assert.match(changelog, /\b30\b/);

    const releasing = readTextLf("RELEASING-antigravity.md");
    assertRelativeLinksExist(releasing, "RELEASING-antigravity.md");
    for (const step of [
      "sync-upstream.mjs",
      "build.mjs",
      "build.mjs --check",
      "validate.mjs --strict",
      "node --test scripts/tests/*.test.mjs",
      "package-release.mjs",
      "antigravity-release.yml",
      "vX.Y.Z",
    ]) {
      assert.ok(releasing.includes(step), `RELEASING-antigravity.md missing '${step}'`);
    }
    assert.doesNotMatch(
      releasing,
      /node --test scripts\/tests\/(?:\s|$)/,
      "RELEASING-antigravity.md must use scripts/tests/*.test.mjs rather than trailing-slash directory form",
    );
  });

  test("installer pack tables match sources.json and generated plugin directories", () => {
    const sources = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, "antigravity", "sources.json"), "utf8"),
    );
    const pluginsRoot = path.join(REPO_ROOT, "antigravity", "plugins");
    const ps1Rows = parsePs1PackTable(fs.readFileSync(path.join(REPO_ROOT, "install.ps1"), "utf8"));
    const shRows = parseShPackTable(fs.readFileSync(path.join(REPO_ROOT, "install.sh"), "utf8"));

    assert.deepEqual(ps1Rows, shRows, "install.ps1 $PackTable and install.sh PACK_TABLE must match");

    const sourcePackNames = Object.keys(sources.plugins);
    assert.deepEqual(
      ps1Rows.map((row) => row.name),
      sourcePackNames,
      "Installer pack order and names must match sources.json plugins",
    );

    const diskCounts = {};
    for (const packName of sourcePackNames) {
      const skillsDir = path.join(pluginsRoot, packName, "skills");
      const skillCount = fs
        .readdirSync(skillsDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory()).length;
      diskCounts[packName] = skillCount;

      const manifest = JSON.parse(
        fs.readFileSync(path.join(pluginsRoot, packName, "plugin.json"), "utf8"),
      );
      assert.equal(manifest.displayName, EXPECTED_PACKS[packName].displayName);
    }

    const installerCounts = Object.fromEntries(ps1Rows.map((row) => [row.name, row.skills]));
    assert.deepEqual(installerCounts, diskCounts, "Installer skill counts must match plugins/");

    const expectedCounts = Object.fromEntries(
      Object.entries(EXPECTED_PACKS).map(([name, info]) => [name, info.skills]),
    );
    assert.deepEqual(installerCounts, expectedCounts);
    assert.deepEqual(
      Object.fromEntries(ps1Rows.map((row) => [row.name, row.alias])),
      Object.fromEntries(Object.entries(EXPECTED_PACKS).map(([name, info]) => [name, info.alias])),
    );
  });
});
