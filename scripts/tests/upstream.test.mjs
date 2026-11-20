import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  cacheKeyForRepo,
  ensureCommit,
  listTree,
  readBlob,
  resolveGlob,
  lsRemoteHead,
} from "../antigravity/upstream.mjs";
import { makeFixtureRepo, makeTempDir } from "./helpers.mjs";

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

describe("cacheKeyForRepo", () => {
  test("produces owner__repo across URL formats", () => {
    assert.equal(
      cacheKeyForRepo("https://github.com/Dimillian/Skills.git"),
      "Dimillian__Skills",
    );
    assert.equal(
      cacheKeyForRepo("https://github.com/andrewgleave/skills"),
      "andrewgleave__skills",
    );
    assert.equal(
      cacheKeyForRepo("git@github.com:Dimillian/Skills.git"),
      "Dimillian__Skills",
    );
    assert.equal(
      cacheKeyForRepo("file:///C:/tmp/cache-test/Dimillian/Skills"),
      "Dimillian__Skills",
    );
  });

  test("sanitizes unsafe characters in path segments", () => {
    assert.equal(
      cacheKeyForRepo("https://example.com/my org/my:repo.git"),
      "my_org__my_repo",
    );
  });
});

describe("ensureCommit, listTree, readBlob", () => {
  test("roundtrips modes, symlinks, and raw CRLF bytes", () => {
    const binaryBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    const fixture = makeFixtureRepo({
      "skill/SKILL.md": "---\r\nname: skill\r\ndescription: d\r\n---\r\n",
      "skill/scripts/run.sh": { data: "#!/bin/sh\necho hi\n", mode: "100755" },
      "skill/assets/icon.png": { data: binaryBytes },
      "skill/link": { symlink: "SKILL.md" },
      "skill-extra/SKILL.md": "should not leak into skill tree\n",
      "other/README.md": "hello\n",
    });
    trackTemp(fixture.dir);
    const cacheDir = trackTemp(makeTempDir("upstream-cache-"));

    const gitDir = ensureCommit({ repoUrl: fixture.url, sha: fixture.sha, cacheDir });
    assert.equal(path.basename(gitDir), `${cacheKeyForRepo(fixture.url)}.git`);

    const tree = listTree(gitDir, fixture.sha, "skill");
    assert.deepEqual(
      tree.map((e) => [e.path, e.mode]),
      [
        ["SKILL.md", "100644"],
        ["assets/icon.png", "100644"],
        ["link", "120000"],
        ["scripts/run.sh", "100755"],
      ],
    );
    assert.deepEqual(listTree(gitDir, fixture.sha, "./skill"), tree);

    const wholeTree = listTree(gitDir, fixture.sha, ".");
    assert.deepEqual(
      wholeTree.map((e) => e.path),
      [
        "other/README.md",
        "skill-extra/SKILL.md",
        "skill/SKILL.md",
        "skill/assets/icon.png",
        "skill/link",
        "skill/scripts/run.sh",
      ],
    );
    assert.deepEqual(listTree(gitDir, fixture.sha, "./"), wholeTree);

    const rawSkill = readBlob(gitDir, fixture.sha, "skill/SKILL.md");
    assert.ok(Buffer.isBuffer(rawSkill));
    assert.match(rawSkill.toString("utf8"), /\r\n/);
    assert.deepEqual(readBlob(gitDir, fixture.sha, "skill/assets/icon.png"), binaryBytes);
    assert.equal(readBlob(gitDir, fixture.sha, "skill/link").toString("utf8"), "SKILL.md");
  });

  test("ensureCommit is idempotent and offline on second call", () => {
    const fixture = makeFixtureRepo({
      "skill/SKILL.md": "---\nname: skill\ndescription: d\n---\n",
    });
    trackTemp(fixture.dir);
    const cacheDir = trackTemp(makeTempDir("upstream-offline-"));

    const firstDir = ensureCommit({ repoUrl: fixture.url, sha: fixture.sha, cacheDir });
    const repoSuffix = path.basename(fixture.dir);
    const parentSegment = path.basename(path.dirname(fixture.dir));
    const unreachableUrl = `https://invalid.invalid/${parentSegment}/${repoSuffix}.git`;

    const secondDir = ensureCommit({ repoUrl: unreachableUrl, sha: fixture.sha, cacheDir });
    assert.equal(secondDir, firstDir);
    assert.equal(
      readBlob(secondDir, fixture.sha, "skill/SKILL.md").toString("utf8"),
      "---\nname: skill\ndescription: d\n---\n",
    );
  });

  test("ensureCommit throws on unknown sha", () => {
    const fixture = makeFixtureRepo({ "a.txt": "hi\n" });
    trackTemp(fixture.dir);
    const cacheDir = trackTemp(makeTempDir("upstream-badsha-"));

    assert.throws(
      () => ensureCommit({ repoUrl: fixture.url, sha: "0".repeat(40), cacheDir }),
      /sha|commit/i,
    );
  });
});

describe("resolveGlob", () => {
  test("returns only sorted child dirs containing SKILL.md", () => {
    const fixture = makeFixtureRepo({
      "skills/asc-b/SKILL.md": "b\n",
      "skills/asc-a/SKILL.md": "a\n",
      "skills/asc-c/notes.md": "no skill\n",
      "skills/other/SKILL.md": "other\n",
      "root-one/SKILL.md": "r1\n",
      "root-two/notes.md": "r2\n",
    });
    trackTemp(fixture.dir);
    const cacheDir = trackTemp(makeTempDir("upstream-glob-"));
    const gitDir = ensureCommit({ repoUrl: fixture.url, sha: fixture.sha, cacheDir });

    assert.deepEqual(resolveGlob(gitDir, fixture.sha, "skills/asc-*"), [
      "skills/asc-a",
      "skills/asc-b",
    ]);
    assert.deepEqual(resolveGlob(gitDir, fixture.sha, "skills/*"), [
      "skills/asc-a",
      "skills/asc-b",
      "skills/other",
    ]);
    assert.deepEqual(resolveGlob(gitDir, fixture.sha, "root-*"), ["root-one"]);
    assert.deepEqual(resolveGlob(gitDir, fixture.sha, "missing/*"), []);
  });

  test("rejects unsupported glob patterns", () => {
    const fixture = makeFixtureRepo({ "a/SKILL.md": "a\n" });
    trackTemp(fixture.dir);
    const cacheDir = trackTemp(makeTempDir("upstream-badglob-"));
    const gitDir = ensureCommit({ repoUrl: fixture.url, sha: fixture.sha, cacheDir });

    assert.throws(() => resolveGlob(gitDir, fixture.sha, "skills/*/sub"), /glob|pattern/i);
    assert.throws(() => resolveGlob(gitDir, fixture.sha, "skills/asc"), /glob|pattern/i);
  });
});

describe("lsRemoteHead", () => {
  test("returns remote branch head SHA and throws when missing", () => {
    const fixture = makeFixtureRepo({ "SKILL.md": "hi\n" });
    trackTemp(fixture.dir);

    assert.equal(lsRemoteHead(fixture.url, "main"), fixture.sha);
    assert.throws(() => lsRemoteHead(fixture.url, "does-not-exist"), /does-not-exist|not found/i);
  });
});
