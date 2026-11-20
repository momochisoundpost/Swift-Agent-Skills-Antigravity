import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listFilesRelative } from "./lib.mjs";
import { validatePlugins } from "./validate.mjs";
import { createZip } from "./zip.mjs";

const DEFAULT_REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_PLUGINS_ROOT = path.join(DEFAULT_REPO_ROOT, "antigravity", "plugins");
const DEFAULT_OUT_PATH = "swift-agent-skills-antigravity.zip";

function comparePosix(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function formatValidationFailures(results) {
  const lines = [];
  for (const res of results) {
    for (const err of res.errors) {
      lines.push(`ERROR [${res.plugin}]: ${err}`);
    }
    for (const warn of res.warnings) {
      lines.push(`WARN [${res.plugin}]: ${warn}`);
    }
  }
  return lines.join("\n");
}

function readExecutablesSet(executablesPath) {
  const set = new Set();
  if (!fs.existsSync(executablesPath) || !fs.lstatSync(executablesPath).isFile()) {
    return { exists: false, executables: set };
  }
  const lines = fs.readFileSync(executablesPath, "utf8").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line) {
      set.add(line);
    }
  }
  return { exists: true, executables: set };
}

/**
 * Strictly validates plugins under pluginsRoot and packages them into a deterministic release ZIP.
 */
export function packageRelease({
  pluginsRoot = DEFAULT_PLUGINS_ROOT,
  outPath = DEFAULT_OUT_PATH,
  allowlist = [],
} = {}) {
  const resolvedRoot = path.resolve(pluginsRoot);
  const resolvedOut = path.resolve(outPath);

  const report = validatePlugins(resolvedRoot, { strict: true, allowlist });
  if (!report.valid) {
    throw new Error(`Cannot package invalid plugins:\n${formatValidationFailures(report.results)}`);
  }

  const executablesPath = path.join(resolvedRoot, "EXECUTABLES.txt");
  const { exists: hasExecutablesFile, executables } = readExecutablesSet(executablesPath);

  const entries = [];
  const pluginNames = report.results
    .map((res) => res.plugin)
    .filter((name) => name !== "(root)");

  for (const pluginName of pluginNames) {
    const pluginDir = path.join(resolvedRoot, pluginName);
    for (const rel of listFilesRelative(pluginDir)) {
      const zipName = `${pluginName}/${rel}`;
      const mode = executables.has(zipName) ? 0o755 : 0o644;
      entries.push({
        name: zipName,
        data: fs.readFileSync(path.join(pluginDir, rel)),
        mode,
      });
    }
  }

  if (hasExecutablesFile) {
    entries.push({
      name: "EXECUTABLES.txt",
      data: fs.readFileSync(executablesPath),
      mode: 0o644,
    });
  }

  entries.sort((a, b) => comparePosix(a.name, b.name));

  fs.mkdirSync(path.dirname(resolvedOut), { recursive: true });
  fs.writeFileSync(resolvedOut, createZip(entries));

  return { fileCount: entries.length };
}

const CLI_VALUE_FLAGS = new Map([
  ["--root", "root"],
  ["--out", "out"],
  ["--rewrites", "rewrites"],
]);

function parseCliArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
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

function loadAllowlist(rewritesArg) {
  const rewritesPath = rewritesArg
    ? path.resolve(rewritesArg)
    : path.join(DEFAULT_REPO_ROOT, "antigravity", "rewrites.json");

  if (!fs.existsSync(rewritesPath)) {
    if (rewritesArg) {
      throw new Error(`Missing rewrites file: ${rewritesPath}`);
    }
    return [];
  }

  const data = JSON.parse(fs.readFileSync(rewritesPath, "utf8"));
  return Array.isArray(data.allowlist) ? data.allowlist : [];
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
    const pluginsRoot = options.root ? path.resolve(options.root) : DEFAULT_PLUGINS_ROOT;
    const outPath = options.out ? path.resolve(options.out) : path.resolve(DEFAULT_OUT_PATH);
    const allowlist = loadAllowlist(options.rewrites);

    const { fileCount } = packageRelease({ pluginsRoot, outPath, allowlist });
    console.log(`Packaged ${fileCount} files to ${outPath}`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}
