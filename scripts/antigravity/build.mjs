import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readSkillFrontmatter } from "./frontmatter.mjs";
import {
  ALLOWED_MANIFEST_KEYS,
  ANTIGRAVITY_SCHEMA_URL,
  diffDirectories,
  findHostReferences,
  listFilesRelative,
  normalizeText,
} from "./lib.mjs";
import { ensureCommit, listTree, readBlob, resolveGlob } from "./upstream.mjs";

const DEFAULT_REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ROOT_SKIP_PREFIXES = ["LICENSE", "README", "CONTRIBUTING", "CHANGELOG", "CODE_OF_CONDUCT"];
const ROOT_SKIP_DIRS = new Set(["assets", "docs", "tests", "test", "evals"]);

function comparePosix(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function readJsonFile(filePath, label) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(`Missing ${label}: ${filePath}`);
  }
  const raw = fs.readFileSync(filePath, "utf8");
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON in ${label} (${filePath}): ${err.message}`);
  }
}

function normalizeSubpath(subpath) {
  const cleanSub = String(subpath ?? ".")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/^(\.\/)+/, "")
    .replace(/\/+$/, "");
  const isRoot = cleanSub === "" || cleanSub === ".";
  const displayPath = isRoot ? "." : cleanSub;
  return {
    isRoot,
    displayPath,
    fullBlobPath(relPath) {
      return isRoot ? relPath : `${cleanSub}/${relPath}`;
    },
  };
}

function normalizeExcludePrefixes(excludes) {
  if (!Array.isArray(excludes)) {
    return [];
  }
  return excludes
    .map((ex) =>
      String(ex ?? "")
        .replace(/\\/g, "/")
        .replace(/^\/+/, "")
        .replace(/^(\.\/)+/, "")
        .replace(/\/+$/, ""),
    )
    .filter(Boolean);
}

function shouldKeepSkillFile(entry, { isRoot, excludePrefixes }) {
  if (entry.mode === "120000") {
    return false;
  }
  const rel = entry.path;
  const segments = rel.split("/");
  const basename = segments[segments.length - 1];

  if (segments.includes("..") || segments.includes(".DS_Store")) {
    return false;
  }
  if (
    segments.some(
      (seg) => seg.startsWith(".git") || seg === ".claude-plugin" || seg === ".github",
    )
  ) {
    return false;
  }
  if (segments.length > 1 && (segments[0] === "agents" || segments[0] === "skills")) {
    return false;
  }
  if (basename === "CLAUDE.md") {
    return false;
  }

  if (isRoot) {
    const upperTop = segments[0].toUpperCase();
    if (ROOT_SKIP_PREFIXES.some((prefix) => upperTop.startsWith(prefix))) {
      return false;
    }
    if (segments.length > 1 && ROOT_SKIP_DIRS.has(segments[0].toLowerCase())) {
      return false;
    }
  }

  if (excludePrefixes.some((prefix) => rel === prefix || rel.startsWith(`${prefix}/`))) {
    return false;
  }

  return true;
}

function readUpstreamLicense(upstreamKey, upstream, gitDir) {
  if (!upstream.license) {
    return "MIT License (see upstream repository).";
  }
  try {
    const raw = readBlob(gitDir, upstream.sha, upstream.license);
    return raw.toString("utf8").replace(/\r\n?/g, "\n").trimEnd();
  } catch (err) {
    throw new Error(
      `Failed to read license '${upstream.license}' for upstream '${upstreamKey}': ${err.message}`,
    );
  }
}

function resolveSkillTargets(packName, skillEntries, upstreams, getGitDir) {
  const targets = [];
  for (const spec of skillEntries) {
    const upstream = upstreams[spec.upstream];
    if (!upstream) {
      throw new Error(`Unknown upstream '${spec.upstream}' in plugin '${packName}'`);
    }

    const hasPath = typeof spec.path === "string" && spec.path.length > 0;
    const hasGlob = typeof spec.glob === "string" && spec.glob.length > 0;
    if (hasPath === hasGlob) {
      throw new Error(
        `Skill entry in plugin '${packName}' must specify exactly one of 'path' or 'glob'`,
      );
    }

    const gitDir = getGitDir(spec.upstream);
    const excludePrefixes = normalizeExcludePrefixes(spec.exclude);

    if (hasGlob) {
      const matched = resolveGlob(gitDir, upstream.sha, spec.glob);
      if (matched.length === 0) {
        throw new Error(
          `Glob '${spec.glob}' in upstream '${spec.upstream}' matched no skills (plugin '${packName}')`,
        );
      }
      for (const dir of matched) {
        targets.push({
          upstreamKey: spec.upstream,
          upstream,
          gitDir,
          subpath: dir,
          excludePrefixes,
        });
      }
    } else {
      targets.push({
        upstreamKey: spec.upstream,
        upstream,
        gitDir,
        subpath: spec.path,
        excludePrefixes,
      });
    }
  }
  return targets;
}

function stageSkill({ packName, target, stageSkillsDir, seenSkills, executables }) {
  const { isRoot, displayPath, fullBlobPath } = normalizeSubpath(target.subpath);
  const tree = listTree(target.gitDir, target.upstream.sha, displayPath);
  const kept = tree.filter((entry) =>
    shouldKeepSkillFile(entry, { isRoot, excludePrefixes: target.excludePrefixes }),
  );

  const skillMdEntry = kept.find((entry) => entry.path === "SKILL.md");
  if (!skillMdEntry) {
    throw new Error(
      `Missing SKILL.md in upstream '${target.upstreamKey}' at path '${displayPath}' (plugin '${packName}')`,
    );
  }

  const skillMdRaw = readBlob(target.gitDir, target.upstream.sha, fullBlobPath("SKILL.md"));
  const { name: skillName } = readSkillFrontmatter(skillMdRaw.toString("utf8"));

  if (!skillName || skillName === "." || skillName === ".." || /[\\/]/.test(skillName)) {
    throw new Error(
      `Invalid skill frontmatter name '${skillName}' in '${target.upstreamKey}' (${displayPath})`,
    );
  }

  if (seenSkills.has(skillName)) {
    throw new Error(
      `Duplicate skill name '${skillName}' in ${seenSkills.get(skillName)} and ${packName}`,
    );
  }
  seenSkills.set(skillName, packName);

  for (const entry of kept) {
    const raw =
      entry.path === "SKILL.md"
        ? skillMdRaw
        : readBlob(target.gitDir, target.upstream.sha, fullBlobPath(entry.path));
    const normalized = normalizeText(raw, entry.path);
    const dest = path.join(stageSkillsDir, skillName, entry.path);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, normalized);

    if (entry.mode === "100755" || (entry.path.startsWith("scripts/") && entry.path.endsWith(".sh"))) {
      executables.add(`${packName}/skills/${skillName}/${entry.path}`);
    }
  }

  return {
    skillName,
    upstreamKey: target.upstreamKey,
    upstream: target.upstream,
    skillPath: displayPath,
  };
}

function copyOverrides(packName, overridesRoot, packDir) {
  const overrideDir = path.join(overridesRoot, packName);
  const manifestPath = path.join(overrideDir, "plugin.json");
  const rawManifest = readJsonFile(manifestPath, `override plugin.json for '${packName}'`);

  if (!rawManifest || typeof rawManifest !== "object" || Array.isArray(rawManifest)) {
    throw new Error(`Invalid override plugin.json for '${packName}': expected JSON object`);
  }
  if (Object.hasOwn(rawManifest, "disabled")) {
    throw new Error(`Override plugin.json for '${packName}' must not contain 'disabled'`);
  }

  const manifest = {
    $schema: rawManifest.$schema || ANTIGRAVITY_SCHEMA_URL,
  };
  for (const [key, value] of Object.entries(rawManifest)) {
    if (key === "$schema") {
      continue;
    }
    if (ALLOWED_MANIFEST_KEYS.has(key)) {
      manifest[key] = value;
    }
  }
  fs.mkdirSync(packDir, { recursive: true });
  fs.writeFileSync(
    path.join(packDir, "plugin.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  const readmeSrc = path.join(overrideDir, "README.md");
  if (!fs.existsSync(readmeSrc) || !fs.statSync(readmeSrc).isFile()) {
    throw new Error(`Missing required override README.md for '${packName}': ${readmeSrc}`);
  }
  fs.writeFileSync(
    path.join(packDir, "README.md"),
    normalizeText(fs.readFileSync(readmeSrc), "README.md"),
  );

  const logoSrc = path.join(overrideDir, "assets", "logo.svg");
  if (!fs.existsSync(logoSrc) || !fs.statSync(logoSrc).isFile()) {
    throw new Error(`Missing required override assets/logo.svg for '${packName}': ${logoSrc}`);
  }

  const assetsSrcDir = path.join(overrideDir, "assets");
  const assetsDestDir = path.join(packDir, "assets");
  for (const rel of listFilesRelative(assetsSrcDir)) {
    const srcFile = path.join(assetsSrcDir, rel);
    const destFile = path.join(assetsDestDir, rel);
    fs.mkdirSync(path.dirname(destFile), { recursive: true });
    fs.writeFileSync(destFile, normalizeText(fs.readFileSync(srcFile), rel));
  }
}

function formatPackNotice(packName, skillRecords, licenseTexts) {
  const lines = [
    `# Third-Party Notices (${packName})`,
    "",
    "This plugin is an unofficial community port for Google Antigravity and is not affiliated with or endorsed by Apple, Google, or the upstream skill authors.",
    "",
  ];

  const usedUpstreams = new Map();
  for (const rec of skillRecords) {
    const repoNoGit = String(rec.upstream.repo).replace(/\.git$/i, "");
    const author = rec.upstream.author ?? "Unknown";
    lines.push(
      `- ${rec.skillName}: ${repoNoGit} @ ${rec.upstream.sha} (path: ${rec.skillPath}) by ${author}, MIT`,
    );
    usedUpstreams.set(rec.upstreamKey, rec.upstream);
  }

  const sortedUpstreamKeys = [...usedUpstreams.keys()].sort(comparePosix);
  for (const key of sortedUpstreamKeys) {
    const upstream = usedUpstreams.get(key);
    lines.push("", `## ${key}`, "");
    if (upstream.credit) {
      lines.push(`Credit: ${upstream.credit}`, "");
    }
    lines.push(licenseTexts.get(key));
  }

  return `${lines.join("\n").replace(/\r\n?/g, "\n").trimEnd()}\n`;
}

function formatGeneratedBanner() {
  return [
    "# Generated Directory — Do Not Edit Manually",
    "",
    "The files in this directory are generated by `scripts/antigravity/build.mjs` from:",
    "",
    "- `antigravity/sources.json` (pinned upstream commits and skill selections)",
    "- `antigravity/overrides/` (plugin manifests, READMEs, and SVG logos)",
    "- `antigravity/rewrites.json` (host-neutral rewrites and allowlist)",
    "",
    "Run `node scripts/antigravity/build.mjs` to regenerate, or `node scripts/antigravity/build.mjs --check` to verify.",
    "",
  ].join("\n");
}

function formatThirdPartyNotices(upstreams, licenseTexts) {
  const lines = [
    "# Third-Party Notices",
    "",
    "This community port packages MIT-licensed Swift and Apple skills cataloged in [twostraws/Swift-Agent-Skills](https://github.com/twostraws/Swift-Agent-Skills) by Paul Hudson.",
    "",
    "All bundled third-party skill repositories are pinned by commit SHA below and redistributed under their respective MIT licenses:",
  ];

  const sortedKeys = Object.keys(upstreams).sort(comparePosix);
  for (const key of sortedKeys) {
    const upstream = upstreams[key];
    const repoNoGit = String(upstream.repo).replace(/\.git$/i, "");
    const author = upstream.author ?? "Unknown";
    lines.push("", `## ${key}`, "");
    lines.push(`Repository: ${repoNoGit}`);
    lines.push(`Author: ${author}`);
    lines.push(`Pinned commit: ${upstream.sha}`);
    if (upstream.credit) {
      lines.push(`Credit: ${upstream.credit}`);
    }
    lines.push("", licenseTexts.get(key));
  }

  return `${lines.join("\n").replace(/\r\n?/g, "\n").trimEnd()}\n`;
}

function resolveInsideDir(baseDir, relPath, contextLabel) {
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(baseDir, relPath);
  const relative = path.relative(resolvedBase, resolvedTarget);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Invalid rewrite target path '${relPath}' in ${contextLabel}`);
  }
  return resolvedTarget;
}

function applyRewrites(packDir, packName, rewrites) {
  for (const rule of rewrites) {
    if (rule.plugin !== packName) {
      continue;
    }
    if (
      typeof rule.file !== "string" ||
      rule.file.length === 0 ||
      typeof rule.find !== "string" ||
      rule.find.length === 0 ||
      typeof rule.replace !== "string"
    ) {
      throw new Error(`Invalid rewrite rule for plugin '${packName}': ${JSON.stringify(rule)}`);
    }

    const targetPath = resolveInsideDir(packDir, rule.file, packName);
    if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isFile()) {
      throw new Error(`Rewrite did not match: missing file ${packName}/${rule.file}`);
    }

    const normalized = fs.readFileSync(targetPath, "utf8").replace(/\r\n?/g, "\n");
    const findText = rule.find.replace(/\r\n?/g, "\n");
    const replaceText = rule.replace.replace(/\r\n?/g, "\n");
    if (!normalized.includes(findText)) {
      throw new Error(`Rewrite did not match in ${packName}/${rule.file}: ${JSON.stringify(findText)}`);
    }

    const updated = normalized.replaceAll(findText, () => replaceText);
    fs.writeFileSync(targetPath, updated, "utf8");
  }
}

function verifyPackHostReferences(packDir, packName, allowlist) {
  const hits = findHostReferences(packDir, allowlist, packName);
  if (hits.length > 0) {
    const formatted = hits
      .map((hit) => `  ${packName}/${hit.file}:${hit.line} [${hit.match}] ${hit.text}`)
      .join("\n");
    throw new Error(`Host-specific reference detected:\n${formatted}`);
  }
}

function assertInSync({ stagePluginsDir, stageNoticesPath, outputRoot, noticesPath }) {
  const diffs = [];
  if (!fs.existsSync(outputRoot) || !fs.statSync(outputRoot).isDirectory()) {
    diffs.push(`- ${outputRoot} (missing output directory)`);
  } else {
    diffs.push(...diffDirectories(stagePluginsDir, outputRoot));
  }

  const noticeLabel = path.basename(noticesPath);
  if (!fs.existsSync(noticesPath) || !fs.statSync(noticesPath).isFile()) {
    diffs.push(`- ${noticeLabel} (missing in destination)`);
  } else {
    const expectedNotice = fs.readFileSync(stageNoticesPath);
    const actualNotice = fs.readFileSync(noticesPath);
    if (Buffer.compare(expectedNotice, actualNotice) !== 0) {
      diffs.push(`M ${noticeLabel}`);
    }
  }

  if (diffs.length > 0) {
    throw new Error(`Generated plugins are out of sync with sources:\n${diffs.join("\n")}`);
  }
}

/**
 * Builds all Antigravity plugin bundles, notices, and EXECUTABLES.txt from pinned upstream commits.
 */
export async function buildAll({
  repoRoot = DEFAULT_REPO_ROOT,
  sourcesPath,
  rewritesPath,
  overridesRoot,
  outputRoot,
  noticesPath,
  check = false,
  cacheDir,
} = {}) {
  const root = path.resolve(repoRoot);
  const resolvedSources = sourcesPath
    ? path.resolve(sourcesPath)
    : path.join(root, "antigravity", "sources.json");
  const resolvedRewrites = rewritesPath
    ? path.resolve(rewritesPath)
    : path.join(root, "antigravity", "rewrites.json");
  const resolvedOverrides = overridesRoot
    ? path.resolve(overridesRoot)
    : path.join(root, "antigravity", "overrides");
  const resolvedOutput = outputRoot
    ? path.resolve(outputRoot)
    : path.join(root, "antigravity", "plugins");
  const resolvedNotices = noticesPath
    ? path.resolve(noticesPath)
    : path.join(root, "THIRD_PARTY_NOTICES.md");
  const resolvedCache = cacheDir
    ? path.resolve(cacheDir)
    : process.env.SWIFT_AGENT_SKILLS_CACHE_DIR
      ? path.resolve(process.env.SWIFT_AGENT_SKILLS_CACHE_DIR)
      : path.join(root, ".cache", "upstreams");

  const sources = readJsonFile(resolvedSources, "sources.json");
  if (!sources || typeof sources !== "object" || !sources.upstreams || !sources.plugins) {
    throw new Error(`Invalid sources.json (${resolvedSources}): expected 'upstreams' and 'plugins'`);
  }
  const upstreams = sources.upstreams;
  const plugins = sources.plugins;
  const rewritesData = readJsonFile(resolvedRewrites, "rewrites.json");
  const rewrites = Array.isArray(rewritesData.rewrites) ? rewritesData.rewrites : [];
  const allowlist = Array.isArray(rewritesData.allowlist) ? rewritesData.allowlist : [];

  const gitDirs = new Map();
  const licenseTexts = new Map();

  function getGitDir(upstreamKey) {
    if (gitDirs.has(upstreamKey)) {
      return gitDirs.get(upstreamKey);
    }
    const upstream = upstreams[upstreamKey];
    if (!upstream) {
      throw new Error(`Unknown upstream '${upstreamKey}'`);
    }
    const gitDir = ensureCommit({
      repoUrl: upstream.repo,
      sha: upstream.sha,
      cacheDir: resolvedCache,
    });
    gitDirs.set(upstreamKey, gitDir);
    licenseTexts.set(upstreamKey, readUpstreamLicense(upstreamKey, upstream, gitDir));
    return gitDir;
  }

  // Ensure every upstream in sources.json has its commit and license text available for THIRD_PARTY_NOTICES.md.
  for (const upstreamKey of Object.keys(upstreams).sort(comparePosix)) {
    getGitDir(upstreamKey);
  }

  const stageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ag-build-"));
  const stagePluginsDir = path.join(stageRoot, "plugins");
  const stageNoticesPath = path.join(stageRoot, "THIRD_PARTY_NOTICES.md");
  fs.mkdirSync(stagePluginsDir, { recursive: true });

  try {
    const pluginNames = Object.keys(plugins);
    const seenSkills = new Map();
    const executables = new Set();
    let skillCount = 0;

    for (const packName of pluginNames) {
      const packConfig = plugins[packName] ?? {};
      const skillEntries = Array.isArray(packConfig.skills) ? packConfig.skills : [];
      const packDir = path.join(stagePluginsDir, packName);
      const stageSkillsDir = path.join(packDir, "skills");
      fs.mkdirSync(stageSkillsDir, { recursive: true });

      const targets = resolveSkillTargets(packName, skillEntries, upstreams, getGitDir);
      const skillRecords = [];
      for (const target of targets) {
        const record = stageSkill({
          packName,
          target,
          stageSkillsDir,
          seenSkills,
          executables,
        });
        skillRecords.push(record);
        skillCount += 1;
      }

      copyOverrides(packName, resolvedOverrides, packDir);
      fs.writeFileSync(
        path.join(packDir, "NOTICE.md"),
        formatPackNotice(packName, skillRecords, licenseTexts),
        "utf8",
      );
      applyRewrites(packDir, packName, rewrites);
      verifyPackHostReferences(packDir, packName, allowlist);
    }

    const sortedExecutables = [...executables].sort(comparePosix);
    const executablesContent =
      sortedExecutables.length === 0 ? "" : `${sortedExecutables.join("\n")}\n`;
    fs.writeFileSync(path.join(stagePluginsDir, "EXECUTABLES.txt"), executablesContent, "utf8");
    fs.writeFileSync(path.join(stagePluginsDir, "GENERATED.md"), formatGeneratedBanner(), "utf8");
    fs.writeFileSync(stageNoticesPath, formatThirdPartyNotices(upstreams, licenseTexts), "utf8");

    if (check) {
      assertInSync({
        stagePluginsDir,
        stageNoticesPath,
        outputRoot: resolvedOutput,
        noticesPath: resolvedNotices,
      });
    } else {
      fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true });
      fs.rmSync(resolvedOutput, { recursive: true, force: true });
      fs.cpSync(stagePluginsDir, resolvedOutput, { recursive: true });
      fs.mkdirSync(path.dirname(resolvedNotices), { recursive: true });
      fs.copyFileSync(stageNoticesPath, resolvedNotices);
    }

    return { plugins: pluginNames, skillCount };
  } finally {
    fs.rmSync(stageRoot, { recursive: true, force: true });
  }
}

const CLI_VALUE_FLAGS = new Map([
  ["--cache-dir", "cacheDir"],
  ["--root", "repoRoot"],
]);

function parseCliArgs(argv) {
  const options = { check: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--check") {
      options.check = true;
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
      throw new Error(`${flag} requires a directory argument`);
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
    const result = await buildAll(options);
    const verb = options.check ? "Verified" : "Built";
    console.log(`${verb} ${result.plugins.length} plugins, ${result.skillCount} skills`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}
