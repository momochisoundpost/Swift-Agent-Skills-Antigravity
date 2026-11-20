import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lsRemoteHead } from "./upstream.mjs";

const DEFAULT_REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_SOURCES_PATH = path.join(DEFAULT_REPO_ROOT, "antigravity", "sources.json");

function readSources(sourcesPath) {
  const resolved = path.resolve(sourcesPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Missing sources file: ${resolved}`);
  }
  const data = JSON.parse(fs.readFileSync(resolved, "utf8"));
  if (!data || typeof data !== "object" || !data.upstreams || typeof data.upstreams !== "object") {
    throw new Error(`Invalid sources file (missing "upstreams" object): ${resolved}`);
  }
  return { resolved, data };
}

/**
 * Checks each upstream in `sourcesPath` against its remote branch HEAD via `lsRemoteHead`.
 */
export async function checkUpstreams({ sourcesPath = DEFAULT_SOURCES_PATH } = {}) {
  const { data } = readSources(sourcesPath);
  const results = [];

  for (const [key, entry] of Object.entries(data.upstreams)) {
    if (!entry || typeof entry.repo !== "string" || typeof entry.ref !== "string") {
      throw new Error(`Invalid upstream entry "${key}": expected "repo" and "ref" strings`);
    }
    const pinned = String(entry.sha ?? "");
    const latest = lsRemoteHead(entry.repo, entry.ref);
    results.push({
      key,
      pinned,
      latest,
      outdated: pinned !== latest,
    });
  }

  return results;
}

/**
 * Updates only the `sha` fields in `sourcesPath` for outdated entries, preserving 2-space LF JSON.
 */
export function writeUpdates({ sourcesPath = DEFAULT_SOURCES_PATH, updates = [] } = {}) {
  const { resolved, data } = readSources(sourcesPath);
  let changed = false;

  for (const update of updates) {
    if (!update || typeof update.key !== "string") {
      throw new Error("Invalid update entry: expected a string key");
    }
    if (!Object.hasOwn(data.upstreams, update.key)) {
      throw new Error(`Unknown upstream key: ${update.key}`);
    }
    if (update.outdated === false) {
      continue;
    }
    if (typeof update.latest !== "string" || update.latest.length === 0) {
      throw new Error(`Invalid latest SHA for upstream "${update.key}"`);
    }
    if (data.upstreams[update.key].sha !== update.latest) {
      data.upstreams[update.key].sha = update.latest;
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(resolved, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  }
}

function shortSha(sha) {
  return sha ? sha.slice(0, 12) : "(none)";
}

function formatTable(results) {
  if (results.length === 0) {
    return "No upstreams configured.";
  }

  const rows = results.map((entry) => ({
    key: entry.key,
    pinned: shortSha(entry.pinned),
    latest: shortSha(entry.latest),
    status: entry.outdated ? "outdated" : "up-to-date",
  }));

  const headers = {
    key: "UPSTREAM",
    pinned: "PINNED",
    latest: "LATEST",
    status: "STATUS",
  };

  const widths = {
    key: Math.max(headers.key.length, ...rows.map((r) => r.key.length)),
    pinned: Math.max(headers.pinned.length, ...rows.map((r) => r.pinned.length)),
    latest: Math.max(headers.latest.length, ...rows.map((r) => r.latest.length)),
    status: Math.max(headers.status.length, ...rows.map((r) => r.status.length)),
  };

  const formatRow = (row) =>
    `${row.key.padEnd(widths.key)}  ${row.pinned.padEnd(widths.pinned)}  ${row.latest.padEnd(widths.latest)}  ${row.status.padEnd(widths.status)}`;

  const separator = `${"-".repeat(widths.key)}  ${"-".repeat(widths.pinned)}  ${"-".repeat(widths.latest)}  ${"-".repeat(widths.status)}`;

  return [formatRow(headers), separator, ...rows.map(formatRow)].join("\n");
}

const CLI_VALUE_FLAGS = new Map([["--sources", "sourcesPath"]]);

function parseCliArgs(argv) {
  const options = { write: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--write") {
      options.write = true;
      continue;
    }

    const eqIdx = arg.indexOf("=");
    const flag = eqIdx === -1 ? arg : arg.slice(0, eqIdx);
    const optionKey = CLI_VALUE_FLAGS.get(flag);
    if (!optionKey) {
      throw new Error(`Unknown argument: ${arg}`);
    }

    const value = eqIdx === -1 ? argv[++i] : arg.slice(eqIdx + 1);
    if (!value || (eqIdx === -1 && value.startsWith("--"))) {
      throw new Error(`${flag} requires a path argument`);
    }
    options[optionKey] = value;
  }
  return options;
}

function isMainModule() {
  if (!process.argv[1]) {
    return false;
  }
  let entryPath = path.resolve(process.argv[1]);
  let selfPath = path.resolve(fileURLToPath(import.meta.url));
  try {
    entryPath = fs.realpathSync(entryPath);
    selfPath = fs.realpathSync(selfPath);
  } catch {
    // Fall back to resolved paths if entry cannot be realpathed.
  }
  return process.platform === "win32"
    ? entryPath.toLowerCase() === selfPath.toLowerCase()
    : entryPath === selfPath;
}

if (isMainModule()) {
  try {
    const options = parseCliArgs(process.argv.slice(2));
    const sourcesPath = options.sourcesPath
      ? path.resolve(options.sourcesPath)
      : DEFAULT_SOURCES_PATH;
    const results = await checkUpstreams({ sourcesPath });
    console.log(formatTable(results));

    const outdated = results.filter((entry) => entry.outdated);
    if (options.write) {
      if (outdated.length > 0) {
        writeUpdates({ sourcesPath, updates: outdated });
        console.log(`\nUpdated ${outdated.length} upstream SHA(s) in ${sourcesPath}.`);
        console.log("Next: run `node scripts/antigravity/build.mjs` and review the diff.");
      } else {
        console.log(`\nAll ${results.length} upstream(s) are already up to date; no changes written.`);
      }
    } else {
      console.log(`\nChecked ${results.length} upstream(s): ${outdated.length} outdated.`);
      if (outdated.length > 0) {
        console.log("Run with --write to update pinned SHAs.");
      }
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}
