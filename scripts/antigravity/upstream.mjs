import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const GIT_BASE_ARGS = ["-c", "core.autocrlf=false", "-c", "core.eol=lf"];
const MAX_BUFFER = 256 * 1024 * 1024;
const ALLOWED_MODES = new Set(["100644", "100755", "120000"]);

function execGit(args, options = {}) {
  const res = spawnSync("git", [...GIT_BASE_ARGS, ...args], {
    maxBuffer: MAX_BUFFER,
    ...options,
  });
  if (res.error) {
    throw res.error;
  }
  return res;
}

function runGit(args, options = {}) {
  const res = execGit(args, options);
  if (res.status !== 0) {
    const stderr = res.stderr ? res.stderr.toString("utf8").trim() : "";
    throw new Error(
      `git ${args.join(" ")} failed (exit ${res.status})${stderr ? `: ${stderr}` : ""}`,
    );
  }
  return res.stdout;
}

function comparePosix(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Derives a filesystem-safe `<owner>__<repo>` cache key from a repository URL.
 */
export function cacheKeyForRepo(repoUrl) {
  let normalized = String(repoUrl ?? "").trim().replace(/\\/g, "/");
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(normalized) && /^[^/:]+:.+/.test(normalized)) {
    normalized = normalized.replace(":", "/");
  }
  normalized = normalized.replace(/\/+$/, "").replace(/\.git$/i, "").replace(/\/+$/, "");

  const segments = normalized.split("/").filter(Boolean);
  if (segments.length < 2) {
    throw new Error(`Cannot derive owner__repo cache key from repoUrl: ${repoUrl}`);
  }

  const owner = segments[segments.length - 2].replace(/[^A-Za-z0-9._-]/g, "_");
  const repo = segments[segments.length - 1].replace(/[^A-Za-z0-9._-]/g, "_");
  return `${owner}__${repo}`;
}

function hasCommit(gitDir, sha) {
  const res = execGit(["--git-dir", gitDir, "cat-file", "-e", `${sha}^{commit}`]);
  return res.status === 0;
}

/**
 * Ensures `sha` is available in a bare git cache at `<cacheDir>/<cacheKey>.git`, fetching shallowly if missing.
 */
export function ensureCommit({ repoUrl, sha, cacheDir }) {
  if (!/^[0-9a-fA-F]{4,64}$/.test(String(sha ?? ""))) {
    throw new Error(`Invalid commit sha: ${sha}`);
  }

  const gitDir = path.join(cacheDir, `${cacheKeyForRepo(repoUrl)}.git`);
  if (!fs.existsSync(path.join(gitDir, "HEAD"))) {
    fs.mkdirSync(cacheDir, { recursive: true });
    runGit(["init", "--bare", gitDir]);
  }

  if (hasCommit(gitDir, sha)) {
    return gitDir;
  }

  const fetchRes = execGit([
    "-c",
    "protocol.file.allow=always",
    "--git-dir",
    gitDir,
    "fetch",
    "--depth=1",
    repoUrl,
    sha,
  ]);

  if (fetchRes.status !== 0 || !hasCommit(gitDir, sha)) {
    const stderr = fetchRes.stderr ? fetchRes.stderr.toString("utf8").trim() : "";
    throw new Error(
      `Failed to fetch commit ${sha} from ${repoUrl}${stderr ? `: ${stderr}` : ""}`,
    );
  }

  return gitDir;
}

function parseLsTreeEntries(stdoutBuffer) {
  const raw = stdoutBuffer.toString("utf8");
  const entries = [];
  for (const record of raw.split("\0")) {
    if (!record) {
      continue;
    }
    const tabIdx = record.indexOf("\t");
    if (tabIdx === -1) {
      continue;
    }
    const meta = record.slice(0, tabIdx);
    const entryPath = record.slice(tabIdx + 1);
    const [mode, type] = meta.split(" ");
    entries.push({ mode, type, path: entryPath });
  }
  return entries;
}

function normalizeLeadingPath(value) {
  return String(value ?? "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/^(\.\/)+/, "");
}

/**
 * Lists blob and symlink entries under `subpath` (or whole tree for `.`) in `sha`, sorted by relative path.
 */
export function listTree(gitDir, sha, subpath = ".") {
  const cleanSub = normalizeLeadingPath(subpath ?? ".").replace(/\/+$/, "");
  const isRoot = cleanSub === "" || cleanSub === ".";

  const args = ["--git-dir", gitDir, "ls-tree", "-r", "-z", sha];
  if (!isRoot) {
    args.push("--", cleanSub);
  }

  const parsed = parseLsTreeEntries(runGit(args));
  const results = [];

  for (const entry of parsed) {
    if (entry.type !== "blob" || !ALLOWED_MODES.has(entry.mode)) {
      continue;
    }
    let relPath = entry.path;
    if (!isRoot) {
      const prefix = `${cleanSub}/`;
      if (!entry.path.startsWith(prefix)) {
        continue;
      }
      relPath = entry.path.slice(prefix.length);
    }
    results.push({ path: relPath, mode: entry.mode });
  }

  return results.sort((a, b) => comparePosix(a.path, b.path));
}

/**
 * Reads the raw bytes of a blob at `<sha>:<fullPath>` without smudge or EOL conversion.
 */
export function readBlob(gitDir, sha, fullPath) {
  const cleanPath = normalizeLeadingPath(fullPath);
  return runGit(["--git-dir", gitDir, "cat-file", "blob", `${sha}:${cleanPath}`]);
}

/**
 * Resolves a `<dir>/<prefix>*` glob to sorted child directories containing `SKILL.md`.
 */
export function resolveGlob(gitDir, sha, pattern) {
  const cleanPattern = normalizeLeadingPath(pattern);
  if (!cleanPattern.endsWith("*") || cleanPattern.indexOf("*") !== cleanPattern.length - 1) {
    throw new Error(
      `Invalid glob pattern "${pattern}": expected <dir>/<prefix>* with a single trailing *`,
    );
  }

  const slashIdx = cleanPattern.lastIndexOf("/");
  const parentDir = slashIdx === -1 ? "" : cleanPattern.slice(0, slashIdx);
  const prefix = cleanPattern.slice(slashIdx + 1, -1);

  const args = ["--git-dir", gitDir, "ls-tree", "-d", "-z", sha];
  if (parentDir !== "") {
    args.push("--", `${parentDir}/`);
  }

  const childTrees = parseLsTreeEntries(runGit(args));
  const matchedDirs = [];

  for (const entry of childTrees) {
    if (entry.type !== "tree") {
      continue;
    }
    const base = parentDir === "" ? entry.path : entry.path.slice(parentDir.length + 1);
    if (!base.startsWith(prefix)) {
      continue;
    }
    const skillCheck = runGit([
      "--git-dir",
      gitDir,
      "ls-tree",
      "-z",
      sha,
      "--",
      `${entry.path}/SKILL.md`,
    ]);
    const skillEntries = parseLsTreeEntries(skillCheck);
    if (skillEntries.some((item) => item.type === "blob" && item.path === `${entry.path}/SKILL.md`)) {
      matchedDirs.push(entry.path);
    }
  }

  return matchedDirs.sort(comparePosix);
}

/**
 * Returns the remote commit SHA for `refs/heads/<ref>` in `repoUrl`.
 */
export function lsRemoteHead(repoUrl, ref) {
  const refName = ref.startsWith("refs/") ? ref : `refs/heads/${ref}`;
  const stdout = runGit([
    "-c",
    "protocol.file.allow=always",
    "ls-remote",
    repoUrl,
    refName,
  ]).toString("utf8");

  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }
    const [sha, matchedRef] = line.split("\t");
    if (matchedRef === refName && /^[0-9a-fA-F]{40,64}$/.test(sha)) {
      return sha;
    }
  }

  throw new Error(`Remote ref ${refName} not found in ${repoUrl}`);
}
