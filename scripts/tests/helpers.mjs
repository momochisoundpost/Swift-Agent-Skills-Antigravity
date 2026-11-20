import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const GIT_BASE_ARGS = ["-c", "core.autocrlf=false", "-c", "core.eol=lf"];
const FIXED_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Test Author",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z",
  GIT_COMMITTER_NAME: "Test Author",
  GIT_COMMITTER_EMAIL: "test@example.com",
  GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z",
};

function runGitIn(cwd, args, options = {}) {
  const res = spawnSync("git", [...GIT_BASE_ARGS, ...args], {
    cwd,
    maxBuffer: 256 * 1024 * 1024,
    ...options,
  });
  if (res.error) {
    throw res.error;
  }
  if (res.status !== 0) {
    const stderr = res.stderr ? res.stderr.toString("utf8").trim() : "";
    throw new Error(`git ${args.join(" ")} failed (exit ${res.status}): ${stderr}`);
  }
  return res.stdout;
}

/**
 * Creates a unique temporary directory under the OS temp dir.
 */
export function makeTempDir(prefix = "ag-test-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/**
 * Creates a non-bare git fixture repository with deterministic commit metadata and returns its file:// URL, HEAD SHA, and path.
 */
export function makeFixtureRepo(files) {
  const dir = makeTempDir("fixture-repo-");
  runGitIn(dir, ["init", "-b", "main"]);

  for (const [rawPath, spec] of Object.entries(files)) {
    const posixPath = rawPath
      .replace(/\\/g, "/")
      .replace(/^\/+/, "")
      .replace(/^(\.\/)+/, "");
    let mode = "100644";
    let dataBuf;

    if (typeof spec === "string") {
      dataBuf = Buffer.from(spec, "utf8");
    } else if (spec && typeof spec === "object" && "symlink" in spec) {
      mode = "120000";
      dataBuf = Buffer.from(spec.symlink, "utf8");
    } else if (spec && typeof spec === "object" && "data" in spec) {
      mode = spec.mode ?? "100644";
      dataBuf = Buffer.isBuffer(spec.data) ? spec.data : Buffer.from(spec.data, "utf8");
    } else {
      throw new Error(`Unsupported fixture file spec for ${rawPath}`);
    }

    const blobSha = runGitIn(dir, ["hash-object", "-w", "--stdin"], {
      input: dataBuf,
    })
      .toString("utf8")
      .trim();

    runGitIn(dir, ["update-index", "--add", "--cacheinfo", `${mode},${blobSha},${posixPath}`]);
  }

  runGitIn(dir, ["-c", "commit.gpgsign=false", "commit", "--allow-empty", "-m", "fixture commit"], {
    env: FIXED_ENV,
  });
  const sha = runGitIn(dir, ["rev-parse", "HEAD"]).toString("utf8").trim();

  return {
    url: pathToFileURL(dir).href,
    sha,
    dir,
  };
}
