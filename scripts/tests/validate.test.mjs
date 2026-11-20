import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ANTIGRAVITY_SCHEMA_URL } from "../antigravity/lib.mjs";
import { validatePlugins } from "../antigravity/validate.mjs";
import { makeTempDir } from "./helpers.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const VALIDATE_CLI = path.join(REPO_ROOT, "scripts", "antigravity", "validate.mjs");

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

function defaultManifest(name) {
  return {
    $schema: ANTIGRAVITY_SCHEMA_URL,
    name,
    displayName: `${name} Tools`,
    description: "Valid fixture plugin description.",
    version: "1.0.0",
    logo: "assets/logo.svg",
    suggestedPrompts: ["Prompt one", "Prompt two", "Prompt three"],
    author: { name: "Author Name", url: "https://example.com" },
    homepage: "https://example.com/plugin",
    repository: "https://github.com/example/plugin",
  };
}

function writeValidPlugin(root, name, skills = ["s1"], manifestMutator = null) {
  const packDir = path.join(root, name);
  fs.mkdirSync(path.join(packDir, "assets"), { recursive: true });
  fs.writeFileSync(
    path.join(packDir, "assets", "logo.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"></svg>\n',
    "utf8",
  );
  fs.writeFileSync(path.join(packDir, "README.md"), `# ${name}\n`, "utf8");
  fs.writeFileSync(path.join(packDir, "NOTICE.md"), `# Notices\n`, "utf8");

  const manifest = defaultManifest(name);
  if (manifestMutator) {
    manifestMutator(manifest);
  }
  writeJson(path.join(packDir, "plugin.json"), manifest);

  const skillsDir = path.join(packDir, "skills");
  fs.mkdirSync(skillsDir, { recursive: true });
  for (const skill of skills) {
    const skillDir = path.join(skillsDir, skill);
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, "SKILL.md"),
      `---\nname: ${skill}\ndescription: Valid skill ${skill}.\n---\nBody for ${skill}.\n`,
      "utf8",
    );
  }
  return packDir;
}

describe("validatePlugins", () => {
  test("valid plugin passes strict mode and ignores non-directories at root", () => {
    const root = trackTemp(makeTempDir("val-valid-"));
    writeValidPlugin(root, "alpha-pack", ["s1", "s2"]);
    fs.writeFileSync(path.join(root, "EXECUTABLES.txt"), "", "utf8");
    fs.writeFileSync(path.join(root, "GENERATED.md"), "# Generated\n", "utf8");

    const res = validatePlugins(root, { strict: true });
    assert.equal(res.valid, true);
    assert.equal(res.skillCount, 2);
    assert.equal(res.results.length, 1);
    assert.deepEqual(res.results[0], {
      plugin: "alpha-pack",
      errors: [],
      warnings: [],
      skills: ["s1", "s2"],
    });
  });

  test("fails when pluginsRoot does not exist or has zero plugins", () => {
    const missing = path.join(trackTemp(makeTempDir("val-missing-")), "nope");
    const resMissing = validatePlugins(missing);
    assert.equal(resMissing.valid, false);
    assert.ok(resMissing.results.some((r) => r.errors.length > 0));

    const empty = trackTemp(makeTempDir("val-empty-"));
    const resEmpty = validatePlugins(empty);
    assert.equal(resEmpty.valid, false);
    assert.ok(resEmpty.results.some((r) => r.errors.length > 0));
  });

  for (const [label, mutate, re] of [
    ["unknown key", (m) => (m.foo = 1), /Unknown top-level plugin\.json key 'foo'/],
    ["disabled present", (m) => (m.disabled = true), /must not ship 'disabled'/],
    ["disabled false present", (m) => (m.disabled = false), /must not ship 'disabled'/],
    ["missing marketplace author", (m) => delete m.author, /author/],
    ["missing marketplace description", (m) => delete m.description, /description/],
    ["name not kebab-case", (m) => (m.name = "Alpha_Pack"), /kebab-case/],
    ["name mismatch", (m) => (m.name = "other-pack"), /does not match directory/],
    ["two prompts", (m) => (m.suggestedPrompts = ["a", "b"]), /exactly 3 suggestedPrompts/],
    ["four prompts", (m) => (m.suggestedPrompts = ["a", "b", "c", "d"]), /exactly 3 suggestedPrompts/],
    ["empty prompt", (m) => (m.suggestedPrompts = ["a", "  ", "c"]), /exactly 3 suggestedPrompts/],
    ["displayName Claude prefix", (m) => (m.displayName = "Claude Swift"), /displayName/],
    ["displayName Antigravity prefix", (m) => (m.displayName = "antigravity-kit"), /displayName/],
    ["displayName Gemini prefix", (m) => (m.displayName = "Gemini Helper"), /displayName/],
    ["displayName Cursor prefix", (m) => (m.displayName = "Cursor Pack"), /displayName/],
    ["displayName Plugin suffix", (m) => (m.displayName = "Swift Plugin"), /displayName/],
    ["displayName MCP suffix", (m) => (m.displayName = "Swift MCP"), /displayName/],
    ["logo https URL", (m) => (m.logo = "https://example.com/logo.svg"), /logo/],
    ["logo absolute path", (m) => (m.logo = "/assets/logo.svg"), /logo/],
    ["logo parent traversal", (m) => (m.logo = "../logo.svg"), /logo/],
    ["logo missing file", (m) => (m.logo = "assets/missing.svg"), /logo/],
    ["logo unsupported extension", (m) => (m.logo = "README.md"), /logo/],
    ["homepage non-https", (m) => (m.homepage = "http://example.com"), /homepage/],
    ["repository non-https string", (m) => (m.repository = "http://github.com/a/b"), /repository/],
    [
      "repository non-https object",
      (m) => (m.repository = { type: "git", url: "git://github.com/a/b" }),
      /repository/,
    ],
    [
      "author.url non-https",
      (m) => (m.author = { name: "Author", url: "http://example.com" }),
      /author\.url/,
    ],
  ]) {
    test(`manifest: ${label}`, () => {
      const root = trackTemp(makeTempDir("val-mf-"));
      writeValidPlugin(root, "alpha-pack", ["s1"], mutate);
      const res = validatePlugins(root);
      assert.equal(res.valid, false);
      assert.ok(
        res.results[0].errors.some((e) => re.test(e)),
        `Expected error matching ${re}, got: ${JSON.stringify(res.results[0].errors)}`,
      );
    });
  }

  test("manifest allows valid displayName edge cases, repository object, string author, and png logo", () => {
    const root = trackTemp(makeTempDir("val-mf-ok-"));
    const packDir = writeValidPlugin(root, "alpha-pack", ["s1"], (m) => {
      m.displayName = "Gemstone SwiftPlugins";
      m.logo = "assets/logo.png";
      m.author = "Paul Hudson";
      m.repository = { type: "git", url: "https://github.com/example/repo" };
    });
    fs.writeFileSync(path.join(packDir, "assets", "logo.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const res = validatePlugins(root, { strict: true });
    assert.equal(res.valid, true, JSON.stringify(res.results));
  });

  test("fails on missing or invalid plugin.json, missing README.md, or missing NOTICE.md", () => {
    const root = trackTemp(makeTempDir("val-docs-"));
    const p1 = writeValidPlugin(root, "p-one");
    fs.rmSync(path.join(p1, "plugin.json"));
    const p2 = writeValidPlugin(root, "p-two", ["s2"]);
    fs.writeFileSync(path.join(p2, "plugin.json"), "{bad json", "utf8");
    const p3 = writeValidPlugin(root, "p-three", ["s3"]);
    fs.rmSync(path.join(p3, "README.md"));
    const p4 = writeValidPlugin(root, "p-four", ["s4"]);
    fs.rmSync(path.join(p4, "NOTICE.md"));

    const res = validatePlugins(root);
    assert.equal(res.valid, false);
    const byName = new Map(res.results.map((r) => [r.plugin, r]));
    assert.ok(byName.get("p-one").errors.some((e) => /plugin\.json/i.test(e)));
    assert.ok(byName.get("p-two").errors.some((e) => /plugin\.json/i.test(e)));
    assert.ok(byName.get("p-three").errors.some((e) => /README\.md/.test(e)));
    assert.ok(byName.get("p-four").errors.some((e) => /NOTICE\.md/.test(e)));
  });

  test("fails on missing skills/, zero skills, missing SKILL.md, or invalid frontmatter", () => {
    const root = trackTemp(makeTempDir("val-skills-"));
    const p1 = writeValidPlugin(root, "p-one", ["s1"]);
    fs.rmSync(path.join(p1, "skills"), { recursive: true, force: true });

    writeValidPlugin(root, "p-two", []);

    const p3 = writeValidPlugin(root, "p-three", ["s3"]);
    fs.rmSync(path.join(p3, "skills", "s3", "SKILL.md"));

    const p4 = writeValidPlugin(root, "p-four", ["s4"]);
    fs.writeFileSync(path.join(p4, "skills", "s4", "SKILL.md"), "No frontmatter\n", "utf8");

    const res = validatePlugins(root);
    assert.equal(res.valid, false);
    const byName = new Map(res.results.map((r) => [r.plugin, r]));
    assert.ok(byName.get("p-one").errors.some((e) => /skills/i.test(e)));
    assert.ok(byName.get("p-two").errors.some((e) => /zero skills|no skills/i.test(e)));
    assert.ok(byName.get("p-three").errors.some((e) => /SKILL\.md/.test(e)));
    assert.ok(byName.get("p-four").errors.some((e) => /frontmatter/i.test(e)));
  });

  test("skill name must match skill directory", () => {
    const root = trackTemp(makeTempDir("val-sname-"));
    const packDir = writeValidPlugin(root, "alpha-pack", ["s1"]);
    fs.writeFileSync(
      path.join(packDir, "skills", "s1", "SKILL.md"),
      "---\nname: wrong-name\ndescription: Mismatch.\n---\nBody\n",
      "utf8",
    );

    const res = validatePlugins(root);
    assert.equal(res.valid, false);
    assert.ok(res.results[0].errors.some((e) => /does not match skill directory/.test(e)));
  });

  test("duplicate skill across plugins fails", () => {
    const root = trackTemp(makeTempDir("val-dup-"));
    writeValidPlugin(root, "alpha-pack", ["shared-skill"]);
    writeValidPlugin(root, "beta-pack", ["shared-skill"]);

    const res = validatePlugins(root);
    assert.equal(res.valid, false);
    const allErrors = res.results.flatMap((r) => r.errors);
    assert.ok(allErrors.some((e) => /Duplicate skill name/.test(e)));
  });

  test("forbidden paths (.DS_Store, .claude-plugin, .git) and symlinks fail, while .gitignore passes", () => {
    const root = trackTemp(makeTempDir("val-forbid-"));
    const p1 = writeValidPlugin(root, "p-ds", ["s1"]);
    fs.writeFileSync(path.join(p1, "skills", "s1", ".DS_Store"), "junk", "utf8");

    const p2 = writeValidPlugin(root, "p-cp", ["s2"]);
    fs.mkdirSync(path.join(p2, ".claude-plugin"), { recursive: true });
    fs.writeFileSync(path.join(p2, ".claude-plugin", "plugin.json"), "{}", "utf8");

    const p3 = writeValidPlugin(root, "p-git", ["s3"]);
    fs.mkdirSync(path.join(p3, "skills", "s3", ".git"), { recursive: true });
    fs.writeFileSync(path.join(p3, "skills", "s3", ".git", "HEAD"), "ref: refs/heads/main\n");

    const p4 = writeValidPlugin(root, "p-sym", ["s4"]);
    fs.symlinkSync("README.md", path.join(p4, "link.md"));

    const p5 = writeValidPlugin(root, "p-ok", ["s5"]);
    fs.writeFileSync(path.join(p5, "skills", "s5", ".gitignore"), "*.tmp\n", "utf8");

    const res = validatePlugins(root, { strict: true });
    assert.equal(res.valid, false);
    const byName = new Map(res.results.map((r) => [r.plugin, r]));
    assert.ok(byName.get("p-ds").errors.some((e) => /\.DS_Store/.test(e)));
    assert.ok(byName.get("p-cp").errors.some((e) => /\.claude-plugin/.test(e)));
    assert.ok(byName.get("p-git").errors.some((e) => /\.git/.test(e)));
    assert.ok(byName.get("p-sym").errors.some((e) => /symlink/i.test(e)));
    assert.deepEqual(byName.get("p-ok").errors, []);
  });

  test("host reference flagged and allowlist clears it", () => {
    const root = trackTemp(makeTempDir("val-host-"));
    const packDir = writeValidPlugin(root, "alpha-pack", ["s1"]);
    fs.writeFileSync(
      path.join(packDir, "skills", "s1", "SKILL.md"),
      "---\nname: s1\ndescription: Skill.\n---\nSee Claude Code for details.\n",
      "utf8",
    );

    const resFlagged = validatePlugins(root);
    assert.equal(resFlagged.valid, false);
    assert.ok(resFlagged.results[0].errors.some((e) => /claude/i.test(e)));

    const resAllowed = validatePlugins(root, {
      allowlist: [{ plugin: "alpha-pack", file: "skills/s1/SKILL.md", pattern: "Claude Code" }],
    });
    assert.equal(resAllowed.valid, true);
  });

  test("long description emits warning and fails only in strict mode", () => {
    const root = trackTemp(makeTempDir("val-desc-warn-"));
    const packDir = writeValidPlugin(root, "alpha-pack", ["s1"]);
    const longDesc = "x".repeat(1025);
    fs.writeFileSync(
      path.join(packDir, "skills", "s1", "SKILL.md"),
      `---\nname: s1\ndescription: ${longDesc}\n---\nBody\n`,
      "utf8",
    );

    const nonStrict = validatePlugins(root, { strict: false });
    assert.equal(nonStrict.valid, true);
    assert.ok(nonStrict.results[0].warnings.some((w) => /1024/.test(w)));

    const strictRes = validatePlugins(root, { strict: true });
    assert.equal(strictRes.valid, false);
  });

  test("unlisted .sh script is warning, strict makes it fail; listed .sh and .py pass", () => {
    const root = trackTemp(makeTempDir("val-exec-warn-"));
    const packDir = writeValidPlugin(root, "alpha-pack", ["s1"]);
    const scriptsDir = path.join(packDir, "skills", "s1", "scripts", "sub");
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.writeFileSync(path.join(packDir, "skills", "s1", "scripts", "run.sh"), "#!/bin/sh\n", "utf8");
    fs.writeFileSync(path.join(scriptsDir, "helper.sh"), "#!/bin/sh\n", "utf8");
    fs.writeFileSync(path.join(packDir, "skills", "s1", "scripts", "lib.py"), "print('ok')\n", "utf8");

    const nonStrict = validatePlugins(root, { strict: false });
    assert.equal(nonStrict.valid, true);
    assert.equal(nonStrict.results[0].warnings.length, 2);

    const strictUnlisted = validatePlugins(root, { strict: true });
    assert.equal(strictUnlisted.valid, false);

    fs.writeFileSync(
      path.join(root, "EXECUTABLES.txt"),
      "alpha-pack/skills/s1/scripts/run.sh\nalpha-pack/skills/s1/scripts/sub/helper.sh\n",
      "utf8",
    );
    const strictListed = validatePlugins(root, { strict: true });
    assert.equal(strictListed.valid, true);
    assert.deepEqual(strictListed.results[0].warnings, []);
  });

  test("EXECUTABLES.txt entry for missing file fails and attributes to plugin or root", () => {
    const root = trackTemp(makeTempDir("val-exec-err-"));
    writeValidPlugin(root, "alpha-pack", ["s1"]);
    fs.writeFileSync(
      path.join(root, "EXECUTABLES.txt"),
      "alpha-pack/skills/s1/scripts/missing.sh\nunknown-pack/skills/s9/scripts/nope.sh\n",
      "utf8",
    );

    const res = validatePlugins(root);
    assert.equal(res.valid, false);
    const alpha = res.results.find((r) => r.plugin === "alpha-pack");
    assert.ok(alpha.errors.some((e) => /missing\.sh/.test(e)));
    const otherErrors = res.results
      .filter((r) => r.plugin !== "alpha-pack")
      .flatMap((r) => r.errors);
    assert.ok(otherErrors.some((e) => /unknown-pack/.test(e)));
  });

  test("CLI exits 0 with OK summary, honors --rewrites, and exits 1 on failure or --strict warnings", () => {
    const root = trackTemp(makeTempDir("val-cli-"));
    const packDir = writeValidPlugin(root, "alpha-pack", ["s1"]);
    const scriptsDir = path.join(packDir, "skills", "s1", "scripts");
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.writeFileSync(path.join(scriptsDir, "run.sh"), "#!/bin/sh\n", "utf8");
    fs.writeFileSync(
      path.join(packDir, "skills", "s1", "SKILL.md"),
      "---\nname: s1\ndescription: Skill.\n---\nSee Claude Code.\n",
      "utf8",
    );
    const rewritesFile = path.join(trackTemp(makeTempDir("val-rw-")), "rewrites.json");
    writeJson(rewritesFile, {
      rewrites: [],
      allowlist: [{ plugin: "alpha-pack", file: "skills/s1/SKILL.md", pattern: "Claude Code" }],
    });

    const okNonStrict = spawnSync(
      process.execPath,
      [VALIDATE_CLI, "--root", root, "--rewrites", rewritesFile],
      { encoding: "utf8" },
    );
    assert.equal(okNonStrict.status, 0, okNonStrict.stderr);
    assert.match(okNonStrict.stdout, /OK: 1 plugins, 1 skills/);

    const failStrict = spawnSync(
      process.execPath,
      [VALIDATE_CLI, "--strict", "--root", root, "--rewrites", rewritesFile],
      { encoding: "utf8" },
    );
    assert.equal(failStrict.status, 1);

    fs.writeFileSync(
      path.join(root, "EXECUTABLES.txt"),
      "alpha-pack/skills/s1/scripts/run.sh\n",
      "utf8",
    );
    const okStrict = spawnSync(
      process.execPath,
      [VALIDATE_CLI, "--strict", "--root", root, "--rewrites", rewritesFile],
      { encoding: "utf8" },
    );
    assert.equal(okStrict.status, 0, okStrict.stderr);
    assert.match(okStrict.stdout, /OK: 1 plugins, 1 skills/);
  });
});
