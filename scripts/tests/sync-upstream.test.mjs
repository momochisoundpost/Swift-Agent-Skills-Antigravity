import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkUpstreams, writeUpdates } from "../antigravity/sync-upstream.mjs";
import { makeFixtureRepo, makeTempDir } from "./helpers.mjs";

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const SYNC_CLI = path.resolve(TESTS_DIR, "../antigravity/sync-upstream.mjs");

const GIT_BASE_ARGS = ["-c", "core.autocrlf=false", "-c", "core.eol=lf"];
const FIXED_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Test Author",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_AUTHOR_DATE: "2026-01-02T00:00:00Z",
  GIT_COMMITTER_NAME: "Test Author",
  GIT_COMMITTER_EMAIL: "test@example.com",
  GIT_COMMITTER_DATE: "2026-01-02T00:00:00Z",
};

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

function addSecondCommit(repoDir, relPath, content) {
  const fullPath = path.join(repoDir, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, "utf8");

  const addRes = spawnSync("git", [...GIT_BASE_ARGS, "add", relPath], {
    cwd: repoDir,
    encoding: "utf8",
  });
  assert.equal(addRes.status, 0, addRes.stderr);

  const commitRes = spawnSync(
    "git",
    [...GIT_BASE_ARGS, "-c", "commit.gpgsign=false", "commit", "-m", "second commit"],
    { cwd: repoDir, env: FIXED_ENV, encoding: "utf8" },
  );
  assert.equal(commitRes.status, 0, commitRes.stderr);

  const revRes = spawnSync("git", [...GIT_BASE_ARGS, "rev-parse", "HEAD"], {
    cwd: repoDir,
    encoding: "utf8",
  });
  assert.equal(revRes.status, 0, revRes.stderr);
  return revRes.stdout.trim();
}

function makeTwoRepoSourcesFixture() {
  const repoA = makeFixtureRepo({ "skill-a/SKILL.md": "---\nname: skill-a\ndescription: A.\n---\n" });
  trackTemp(repoA.dir);
  const repoB = makeFixtureRepo({ "skill-b/SKILL.md": "---\nname: skill-b\ndescription: B.\n---\n" });
  trackTemp(repoB.dir);

  const commit1B = repoB.sha;
  const commit2B = addSecondCommit(
    repoB.dir,
    "skill-b/SKILL.md",
    "---\nname: skill-b\ndescription: B v2.\n---\n",
  );
  assert.notEqual(commit2B, commit1B);

  const workDir = trackTemp(makeTempDir("sync-upstream-"));
  const sourcesPath = path.join(workDir, "sources.json");
  const initialSources = {
    upstreams: {
      "owner/repo-a": {
        repo: repoA.url,
        ref: "main",
        sha: repoA.sha,
        license: "LICENSE",
        author: "Alice",
      },
      "owner/repo-b": {
        repo: repoB.url,
        ref: "main",
        sha: commit1B,
        license: "LICENSE.md",
        author: "Bob",
        credit: "originally someone/repo-b",
      },
    },
    plugins: {
      "test-pack": {
        skills: [
          { upstream: "owner/repo-a", path: "skill-a" },
          { upstream: "owner/repo-b", path: "skill-b" },
        ],
      },
    },
  };
  fs.writeFileSync(sourcesPath, `${JSON.stringify(initialSources, null, 2)}\n`, "utf8");

  return { repoA, repoB, commit1B, commit2B, sourcesPath, initialSources };
}

describe("checkUpstreams and writeUpdates", () => {
  test("detects outdated upstreams and rewrites only outdated sha fields with 2-space LF JSON", async () => {
    const { repoA, commit1B, commit2B, sourcesPath, initialSources } = makeTwoRepoSourcesFixture();

    const updates = await checkUpstreams({ sourcesPath });
    assert.deepEqual(updates, [
      {
        key: "owner/repo-a",
        pinned: repoA.sha,
        latest: repoA.sha,
        outdated: false,
      },
      {
        key: "owner/repo-b",
        pinned: commit1B,
        latest: commit2B,
        outdated: true,
      },
    ]);

    writeUpdates({ sourcesPath, updates });

    const rawAfter = fs.readFileSync(sourcesPath, "utf8");
    assert.equal(rawAfter.includes("\r\n"), false);
    assert.equal(rawAfter.endsWith("\n"), true);
    assert.equal(rawAfter.endsWith("\n\n"), false);
    assert.match(rawAfter, /^  "upstreams": \{/m);

    const parsedAfter = JSON.parse(rawAfter);
    const expected = structuredClone(initialSources);
    expected.upstreams["owner/repo-b"].sha = commit2B;
    assert.deepEqual(parsedAfter, expected);
  });

  test("writeUpdates leaves file untouched when nothing is outdated and rejects unknown keys", () => {
    const { repoA, sourcesPath } = makeTwoRepoSourcesFixture();
    const before = fs.readFileSync(sourcesPath, "utf8");

    writeUpdates({
      sourcesPath,
      updates: [{ key: "owner/repo-a", pinned: repoA.sha, latest: repoA.sha, outdated: false }],
    });
    assert.equal(fs.readFileSync(sourcesPath, "utf8"), before);

    assert.throws(
      () =>
        writeUpdates({
          sourcesPath,
          updates: [{ key: "missing/repo", pinned: "a".repeat(40), latest: "b".repeat(40), outdated: true }],
        }),
      /unknown upstream/i,
    );
  });
});

describe("sync-upstream CLI", () => {
  test("dry-run prints table without modifying sources.json; --write updates SHAs and prints reminder", () => {
    const { commit1B, commit2B, sourcesPath } = makeTwoRepoSourcesFixture();
    const initialRaw = fs.readFileSync(sourcesPath, "utf8");

    const dryRes = spawnSync(process.execPath, [SYNC_CLI, "--sources", sourcesPath], {
      encoding: "utf8",
    });
    assert.equal(dryRes.status, 0, dryRes.stderr);
    assert.match(dryRes.stdout, /owner\/repo-a/);
    assert.match(dryRes.stdout, /owner\/repo-b/);
    assert.match(dryRes.stdout, /outdated/i);
    assert.match(dryRes.stdout, /up-to-date/i);
    assert.equal(fs.readFileSync(sourcesPath, "utf8"), initialRaw);

    const writeRes = spawnSync(
      process.execPath,
      [SYNC_CLI, "--write", `--sources=${sourcesPath}`],
      { encoding: "utf8" },
    );
    assert.equal(writeRes.status, 0, writeRes.stderr);
    assert.match(writeRes.stdout, /build\.mjs/);
    assert.match(writeRes.stdout, /diff/i);

    const afterWrite = JSON.parse(fs.readFileSync(sourcesPath, "utf8"));
    assert.notEqual(afterWrite.upstreams["owner/repo-b"].sha, commit1B);
    assert.equal(afterWrite.upstreams["owner/repo-b"].sha, commit2B);

    const secondDry = spawnSync(process.execPath, [SYNC_CLI, "--write", "--sources", sourcesPath], {
      encoding: "utf8",
    });
    assert.equal(secondDry.status, 0, secondDry.stderr);
    assert.doesNotMatch(secondDry.stdout, /outdated/i);
  });

  test("exits 1 on invalid CLI flags", () => {
    const badFlag = spawnSync(process.execPath, [SYNC_CLI, "--bogus"], { encoding: "utf8" });
    assert.equal(badFlag.status, 1);
    assert.match(badFlag.stderr, /Unknown argument/);

    const missingVal = spawnSync(process.execPath, [SYNC_CLI, "--sources"], { encoding: "utf8" });
    assert.equal(missingVal.status, 1);
    assert.match(missingVal.stderr, /requires a path argument/);
  });
});
