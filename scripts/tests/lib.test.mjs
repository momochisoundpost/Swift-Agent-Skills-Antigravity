import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ANTIGRAVITY_SCHEMA_URL,
  ALLOWED_MANIFEST_KEYS,
  MARKETPLACE_REQUIRED_KEYS,
  TEXT_EXTENSIONS,
  HOST_REF_PATTERN,
  isTextPath,
  normalizeText,
  listFilesRelative,
  diffDirectories,
  findHostReferences,
} from "../antigravity/lib.mjs";

describe("constants", () => {
  test("ANTIGRAVITY_SCHEMA_URL and manifest key sets match spec", () => {
    assert.equal(ANTIGRAVITY_SCHEMA_URL, "https://antigravity.google/schemas/v1/plugin.json");
    assert.deepEqual(
      [...ALLOWED_MANIFEST_KEYS].sort(),
      [
        "$schema",
        "author",
        "description",
        "disabled",
        "displayName",
        "extensions",
        "homepage",
        "keywords",
        "license",
        "logo",
        "name",
        "repository",
        "skills",
        "suggestedPrompts",
        "version",
      ].sort(),
    );
    assert.deepEqual(MARKETPLACE_REQUIRED_KEYS, [
      "name",
      "displayName",
      "description",
      "version",
      "logo",
      "suggestedPrompts",
      "author",
    ]);
    assert.ok(TEXT_EXTENSIONS.has(".md"));
    assert.ok(TEXT_EXTENSIONS.has(".gitignore"));
    assert.ok(HOST_REF_PATTERN instanceof RegExp);
  });
});

describe("isTextPath and normalizeText", () => {
  test("isTextPath recognizes text extensions and .gitignore", () => {
    assert.equal(isTextPath("SKILL.md"), true);
    assert.equal(isTextPath("README.MD"), true);
    assert.equal(isTextPath(".gitignore"), true);
    assert.equal(isTextPath("sub/.gitignore"), true);
    assert.equal(isTextPath("assets/logo.png"), false);
  });

  test("normalizeText converts CRLF and CR only for text paths", () => {
    assert.equal(normalizeText(Buffer.from("a\r\nb\r"), "x.md").toString(), "a\nb\n");
    assert.equal(normalizeText(Buffer.from(".DS_Store\r\n"), ".gitignore").toString(), ".DS_Store\n");
    const bin = Buffer.from([0x0d, 0x0a, 0x00]);
    assert.deepEqual(normalizeText(bin, "x.png"), bin);
  });
});

describe("listFilesRelative and diffDirectories", () => {
  test("listFilesRelative returns sorted POSIX paths and skips .DS_Store", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lib-list-"));
    try {
      fs.mkdirSync(path.join(tmp, "b", "c"), { recursive: true });
      fs.writeFileSync(path.join(tmp, ".DS_Store"), "junk");
      fs.writeFileSync(path.join(tmp, "b", ".DS_Store"), "junk");
      fs.writeFileSync(path.join(tmp, "b", "c", "file.md"), "hi");
      fs.writeFileSync(path.join(tmp, "a.txt"), "hello");
      assert.deepEqual(listFilesRelative(tmp), ["a.txt", "b/c/file.md"]);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("diffDirectories reports added, missing, modified in path-sorted order", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lib-diff-"));
    const a = path.join(tmp, "a");
    const b = path.join(tmp, "b");
    try {
      fs.mkdirSync(a, { recursive: true });
      fs.mkdirSync(b, { recursive: true });
      fs.writeFileSync(path.join(a, "same"), "same");
      fs.writeFileSync(path.join(b, "same"), "same");
      fs.writeFileSync(path.join(a, "changed"), "v1");
      fs.writeFileSync(path.join(b, "changed"), "v2");
      fs.writeFileSync(path.join(a, "onlyA"), "a");
      fs.writeFileSync(path.join(b, "onlyB"), "b");

      assert.deepEqual(diffDirectories(a, b), [
        "M changed",
        "- onlyA (missing in second directory)",
        "+ onlyB (only in second directory)",
      ]);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("findHostReferences", () => {
  test("flags claude and honors allowlist, ignores cursor and NOTICE.md", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lib-host-"));
    try {
      fs.writeFileSync(
        path.join(dir, "SKILL.md"),
        "Use with Claude Code\nmove the text cursor\nCheck CLAUDE.md\n",
      );
      fs.writeFileSync(path.join(dir, "NOTICE.md"), "Claude Code attribution\n");
      fs.writeFileSync(path.join(dir, "notes.txt"), "Claude Code in txt\n");

      const hits = findHostReferences(
        dir,
        [{ file: "SKILL.md", pattern: "CLAUDE.md" }],
        "my-plugin",
      );
      assert.deepEqual(
        hits.map((h) => h.line),
        [1],
      );
      assert.equal(hits[0].file, "SKILL.md");
      assert.equal(hits[0].match.toLowerCase(), "claude");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("honors plugin-scoped allowlist entries", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lib-host-plugin-"));
    try {
      fs.writeFileSync(path.join(dir, "SKILL.md"), "Check CLAUDE.md\n");
      const allowlist = [{ plugin: "other-plugin", file: "SKILL.md", pattern: "CLAUDE.md" }];
      assert.equal(findHostReferences(dir, allowlist, "my-plugin").length, 1);
      assert.equal(findHostReferences(dir, allowlist, "other-plugin").length, 0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
