import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readSkillFrontmatter } from "./frontmatter.mjs";
import {
  ALLOWED_MANIFEST_KEYS,
  MARKETPLACE_REQUIRED_KEYS,
  findHostReferences,
} from "./lib.mjs";

const DEFAULT_REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const KEBAB_CASE_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DISPLAY_NAME_FORBIDDEN_PREFIX_RE = /^(?:antigravity|gemini|claude|cursor)\b/i;
const DISPLAY_NAME_FORBIDDEN_SUFFIX_RE = /\b(?:plugin|mcp)$/i;
const ALLOWED_LOGO_EXTENSIONS = new Set([".svg", ".png", ".jpg", ".jpeg", ".webp"]);
const FORBIDDEN_SEGMENTS = new Set([".claude-plugin", ".git", ".DS_Store"]);
const DESCRIPTION_WARN_LENGTH = 1024;

function comparePosix(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function isRegularFile(filePath) {
  try {
    return fs.lstatSync(filePath).isFile();
  } catch {
    return false;
  }
}

function isRealDirectory(dirPath) {
  try {
    return fs.lstatSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

function isHttpsUrl(value) {
  if (typeof value !== "string") {
    return false;
  }
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function scanForbiddenAndSymlinks(pluginDir, errors) {
  function walk(currentDir, relPrefix) {
    const entries = fs
      .readdirSync(currentDir, { withFileTypes: true })
      .sort((a, b) => comparePosix(a.name, b.name));

    for (const entry of entries) {
      const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) {
        errors.push(`Symlink not allowed: ${rel}`);
        continue;
      }
      if (FORBIDDEN_SEGMENTS.has(entry.name)) {
        errors.push(`Forbidden path '${entry.name}': ${rel}`);
        continue;
      }
      if (entry.isDirectory()) {
        walk(path.join(currentDir, entry.name), rel);
      }
    }
  }

  walk(pluginDir, "");
}

function validateLogo(pluginDir, logo, errors) {
  if (typeof logo !== "string" || logo.trim().length === 0) {
    errors.push("plugin.json 'logo' must be a non-empty relative path");
    return;
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(logo)) {
    errors.push(`plugin.json 'logo' must be a relative path, not a URL or drive path: '${logo}'`);
    return;
  }
  if (path.isAbsolute(logo) || logo.startsWith("/") || logo.startsWith("\\")) {
    errors.push(`plugin.json 'logo' must be a relative path, not absolute: '${logo}'`);
    return;
  }
  if (logo.split(/[/\\]/).includes("..")) {
    errors.push(`plugin.json 'logo' must not contain '..' traversal: '${logo}'`);
    return;
  }

  const resolvedPlugin = path.resolve(pluginDir);
  const resolvedLogo = path.resolve(pluginDir, logo);
  const rel = path.relative(resolvedPlugin, resolvedLogo);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
    errors.push(`plugin.json 'logo' resolves outside plugin directory: '${logo}'`);
    return;
  }

  const ext = path.extname(resolvedLogo).toLowerCase();
  if (!ALLOWED_LOGO_EXTENSIONS.has(ext)) {
    errors.push(
      `plugin.json 'logo' must have a supported image extension (.svg, .png, .jpg, .jpeg, .webp): '${logo}'`,
    );
    return;
  }

  if (!isRegularFile(resolvedLogo)) {
    errors.push(`plugin.json 'logo' file does not exist: '${logo}'`);
  }
}

function validateManifestUrls(manifest, errors) {
  if (manifest.homepage !== undefined && !isHttpsUrl(manifest.homepage)) {
    errors.push("plugin.json 'homepage' must be an https:// URL");
  }

  if (manifest.repository !== undefined) {
    if (typeof manifest.repository === "string") {
      if (!isHttpsUrl(manifest.repository)) {
        errors.push("plugin.json 'repository' must be an https:// URL");
      }
    } else if (
      manifest.repository &&
      typeof manifest.repository === "object" &&
      !Array.isArray(manifest.repository)
    ) {
      if (!isHttpsUrl(manifest.repository.url)) {
        errors.push("plugin.json 'repository.url' must be an https:// URL");
      }
    } else {
      errors.push("plugin.json 'repository' must be an https:// URL or { url } object");
    }
  }

  if (manifest.author !== undefined) {
    if (typeof manifest.author === "string") {
      if (manifest.author.trim().length === 0) {
        errors.push("plugin.json 'author' must not be empty");
      }
    } else if (
      manifest.author &&
      typeof manifest.author === "object" &&
      !Array.isArray(manifest.author)
    ) {
      if (
        Object.hasOwn(manifest.author, "url") &&
        manifest.author.url !== undefined &&
        !isHttpsUrl(manifest.author.url)
      ) {
        errors.push("plugin.json 'author.url' must be an https:// URL");
      }
    } else {
      errors.push("plugin.json 'author' must be a string or object");
    }
  }
}

function validateManifest(pluginDir, pluginName, errors, warnings) {
  const manifestPath = path.join(pluginDir, "plugin.json");
  if (!isRegularFile(manifestPath)) {
    errors.push("Missing plugin.json");
    return;
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (err) {
    errors.push(`Invalid plugin.json: ${err.message}`);
    return;
  }

  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    errors.push("Invalid plugin.json: expected a JSON object");
    return;
  }

  for (const key of Object.keys(manifest)) {
    if (!ALLOWED_MANIFEST_KEYS.has(key)) {
      errors.push(`Unknown top-level plugin.json key '${key}'`);
    }
  }

  if (Object.hasOwn(manifest, "disabled")) {
    errors.push("plugin.json must not ship 'disabled'");
  }

  for (const key of MARKETPLACE_REQUIRED_KEYS) {
    const val = manifest[key];
    if (
      !Object.hasOwn(manifest, key) ||
      val === undefined ||
      val === null ||
      (typeof val === "string" && val.trim() === "")
    ) {
      errors.push(`Missing required Marketplace field '${key}'`);
    }
  }

  if (manifest.name !== undefined) {
    if (typeof manifest.name !== "string" || !KEBAB_CASE_RE.test(manifest.name)) {
      errors.push(`plugin.json 'name' must be lowercase kebab-case (got '${manifest.name}')`);
    } else if (manifest.name !== pluginName) {
      errors.push(
        `plugin.json 'name' ('${manifest.name}') does not match directory '${pluginName}'`,
      );
    }
  }

  if (manifest.displayName !== undefined) {
    if (
      typeof manifest.displayName !== "string" ||
      manifest.displayName.trim() === "" ||
      DISPLAY_NAME_FORBIDDEN_PREFIX_RE.test(manifest.displayName) ||
      DISPLAY_NAME_FORBIDDEN_SUFFIX_RE.test(manifest.displayName)
    ) {
      errors.push(
        `Invalid displayName '${manifest.displayName}': must not start with Antigravity/Gemini/Claude/Cursor or end with Plugin/MCP`,
      );
    }
  }

  if (typeof manifest.description === "string" && manifest.description.length > DESCRIPTION_WARN_LENGTH) {
    warnings.push(
      `plugin.json description is ${manifest.description.length} chars (> ${DESCRIPTION_WARN_LENGTH})`,
    );
  }

  if (manifest.logo !== undefined) {
    validateLogo(pluginDir, manifest.logo, errors);
  }

  if (manifest.suggestedPrompts !== undefined) {
    if (
      !Array.isArray(manifest.suggestedPrompts) ||
      manifest.suggestedPrompts.length !== 3 ||
      manifest.suggestedPrompts.some((p) => typeof p !== "string" || p.trim().length === 0)
    ) {
      errors.push("plugin.json must have exactly 3 suggestedPrompts (non-empty strings)");
    }
  }

  validateManifestUrls(manifest, errors);
}

function collectShScripts(scriptsDir) {
  const found = [];
  if (!isRealDirectory(scriptsDir)) {
    return found;
  }

  function walk(currentDir, relPrefix) {
    const entries = fs
      .readdirSync(currentDir, { withFileTypes: true })
      .sort((a, b) => comparePosix(a.name, b.name));

    for (const entry of entries) {
      const rel = `${relPrefix}/${entry.name}`;
      if (entry.isSymbolicLink()) {
        continue;
      }
      if (entry.isDirectory()) {
        walk(path.join(currentDir, entry.name), rel);
      } else if (entry.isFile() && entry.name.endsWith(".sh")) {
        found.push(rel);
      }
    }
  }

  walk(scriptsDir, "scripts");
  return found;
}

function validateSkills(pluginDir, pluginName, seenSkills, executablesSet, errors, warnings) {
  const skillsDir = path.join(pluginDir, "skills");
  if (!isRealDirectory(skillsDir)) {
    errors.push("Missing skills/ directory");
    return [];
  }

  const skillEntries = fs
    .readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => comparePosix(a.name, b.name));

  if (skillEntries.length === 0) {
    errors.push(`Plugin '${pluginName}' has zero skills`);
    return [];
  }

  const skills = [];
  for (const entry of skillEntries) {
    const skillDirName = entry.name;
    skills.push(skillDirName);
    const skillDir = path.join(skillsDir, skillDirName);
    const skillMdPath = path.join(skillDir, "SKILL.md");

    if (!isRegularFile(skillMdPath)) {
      errors.push(`Skill '${skillDirName}' is missing SKILL.md`);
    } else {
      try {
        const content = fs.readFileSync(skillMdPath, "utf8");
        const fm = readSkillFrontmatter(content);
        if (fm.name !== skillDirName) {
          errors.push(
            `Skill frontmatter name '${fm.name}' does not match skill directory '${skillDirName}'`,
          );
        }
        if (seenSkills.has(fm.name)) {
          errors.push(
            `Duplicate skill name '${fm.name}' (already defined in '${seenSkills.get(fm.name)}')`,
          );
        } else {
          seenSkills.set(fm.name, pluginName);
        }
        if (fm.description.length > DESCRIPTION_WARN_LENGTH) {
          warnings.push(
            `Skill '${skillDirName}' description is ${fm.description.length} chars (> ${DESCRIPTION_WARN_LENGTH})`,
          );
        }
      } catch (err) {
        errors.push(`Invalid SKILL.md frontmatter in '${skillDirName}': ${err.message}`);
      }
    }

    for (const relScript of collectShScripts(path.join(skillDir, "scripts"))) {
      const execPath = `${pluginName}/skills/${skillDirName}/${relScript}`;
      if (!executablesSet.has(execPath)) {
        warnings.push(`Script '${execPath}' is not listed in EXECUTABLES.txt`);
      }
    }
  }

  return skills;
}

function parseAndValidateExecutables(pluginsRoot, pluginNamesSet) {
  const executablesSet = new Set();
  const pluginExecErrors = new Map();
  const rootExecErrors = [];

  const execFilePath = path.join(pluginsRoot, "EXECUTABLES.txt");
  if (!fs.existsSync(execFilePath)) {
    return { executablesSet, pluginExecErrors, rootExecErrors };
  }
  if (!isRegularFile(execFilePath)) {
    rootExecErrors.push("EXECUTABLES.txt is not a regular file");
    return { executablesSet, pluginExecErrors, rootExecErrors };
  }

  const resolvedRoot = path.resolve(pluginsRoot);
  const lines = fs.readFileSync(execFilePath, "utf8").split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const firstSeg = line.split("/")[0];
    const pushTargetError = (msg) => {
      if (pluginNamesSet.has(firstSeg) && line.startsWith(`${firstSeg}/`)) {
        if (!pluginExecErrors.has(firstSeg)) {
          pluginExecErrors.set(firstSeg, []);
        }
        pluginExecErrors.get(firstSeg).push(msg);
      } else {
        rootExecErrors.push(msg);
      }
    };

    if (
      line.includes("\\") ||
      path.isAbsolute(line) ||
      line.startsWith("/") ||
      line.split("/").includes("..")
    ) {
      pushTargetError(`Invalid EXECUTABLES.txt path: '${line}'`);
      continue;
    }

    const target = path.resolve(resolvedRoot, line);
    const rel = path.relative(resolvedRoot, target);
    if (!rel || rel.startsWith("..") || path.isAbsolute(rel) || !isRegularFile(target)) {
      pushTargetError(`EXECUTABLES.txt points to missing file: '${line}'`);
      continue;
    }

    executablesSet.add(line);
  }

  return { executablesSet, pluginExecErrors, rootExecErrors };
}

/**
 * Validates generated Antigravity plugin directories under pluginsRoot.
 */
export function validatePlugins(pluginsRoot, { strict = false, allowlist = [] } = {}) {
  const resolvedRoot = path.resolve(pluginsRoot);
  if (!isRealDirectory(resolvedRoot)) {
    return {
      valid: false,
      skillCount: 0,
      results: [
        {
          plugin: "(root)",
          errors: [`Missing plugins directory: ${resolvedRoot}`],
          warnings: [],
          skills: [],
        },
      ],
    };
  }

  const pluginDirs = fs
    .readdirSync(resolvedRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => comparePosix(a.name, b.name));

  if (pluginDirs.length === 0) {
    return {
      valid: false,
      skillCount: 0,
      results: [
        {
          plugin: "(root)",
          errors: [`No plugin directories found in ${resolvedRoot}`],
          warnings: [],
          skills: [],
        },
      ],
    };
  }

  const pluginNamesSet = new Set(pluginDirs.map((entry) => entry.name));
  const { executablesSet, pluginExecErrors, rootExecErrors } = parseAndValidateExecutables(
    resolvedRoot,
    pluginNamesSet,
  );

  const seenSkills = new Map();
  const results = [];
  let skillCount = 0;

  for (const entry of pluginDirs) {
    const pluginName = entry.name;
    const pluginDir = path.join(resolvedRoot, pluginName);
    const errors = [...(pluginExecErrors.get(pluginName) ?? [])];
    const warnings = [];

    scanForbiddenAndSymlinks(pluginDir, errors);
    validateManifest(pluginDir, pluginName, errors, warnings);

    if (!isRegularFile(path.join(pluginDir, "README.md"))) {
      errors.push("Missing required README.md");
    }
    if (!isRegularFile(path.join(pluginDir, "NOTICE.md"))) {
      errors.push("Missing required NOTICE.md");
    }

    const skills = validateSkills(
      pluginDir,
      pluginName,
      seenSkills,
      executablesSet,
      errors,
      warnings,
    );
    skillCount += skills.length;

    const hostHits = findHostReferences(pluginDir, allowlist, pluginName);
    for (const hit of hostHits) {
      errors.push(`Host reference in ${hit.file}:${hit.line} [${hit.match}]: ${hit.text.trim()}`);
    }

    results.push({
      plugin: pluginName,
      errors,
      warnings,
      skills,
    });
  }

  if (rootExecErrors.length > 0) {
    results.push({
      plugin: "(root)",
      errors: rootExecErrors,
      warnings: [],
      skills: [],
    });
  }

  const valid = results.every(
    (res) => res.errors.length === 0 && (!strict || res.warnings.length === 0),
  );

  return {
    valid,
    skillCount,
    results,
  };
}

const CLI_VALUE_FLAGS = new Map([
  ["--root", "root"],
  ["--rewrites", "rewrites"],
]);

function parseCliArgs(argv) {
  const options = { strict: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--strict") {
      options.strict = true;
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
    const pluginsRoot = options.root
      ? path.resolve(options.root)
      : path.join(DEFAULT_REPO_ROOT, "antigravity", "plugins");
    const allowlist = loadAllowlist(options.rewrites);
    const report = validatePlugins(pluginsRoot, { strict: options.strict, allowlist });

    for (const res of report.results) {
      for (const err of res.errors) {
        console.error(`ERROR [${res.plugin}]: ${err}`);
      }
      for (const warn of res.warnings) {
        console.error(`WARN [${res.plugin}]: ${warn}`);
      }
    }

    if (!report.valid) {
      process.exitCode = 1;
    } else {
      const pluginCount = report.results.filter((r) => r.plugin !== "(root)").length;
      console.log(`OK: ${pluginCount} plugins, ${report.skillCount} skills`);
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}
