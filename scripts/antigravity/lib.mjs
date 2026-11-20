import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const ANTIGRAVITY_SCHEMA_URL = "https://antigravity.google/schemas/v1/plugin.json";

export const ALLOWED_MANIFEST_KEYS = new Set([
  "$schema",
  "name",
  "displayName",
  "description",
  "version",
  "disabled",
  "logo",
  "suggestedPrompts",
  "skills",
  "author",
  "homepage",
  "repository",
  "license",
  "keywords",
  "extensions",
]);

export const MARKETPLACE_REQUIRED_KEYS = [
  "name",
  "displayName",
  "description",
  "version",
  "logo",
  "suggestedPrompts",
  "author",
];

export const TEXT_EXTENSIONS = new Set([
  ".md",
  ".txt",
  ".json",
  ".yaml",
  ".yml",
  ".sh",
  ".bash",
  ".zsh",
  ".py",
  ".rb",
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".swift",
  ".m",
  ".h",
  ".toml",
  ".xml",
  ".plist",
  ".html",
  ".css",
  ".svg",
  ".csv",
  ".gitignore",
]);

export const HOST_REF_PATTERN =
  /claude|codex|copilot|openai\.yaml|AskUserQuestion|TodoWrite|allowed-tools/gi;

const HOST_SCAN_EXTENSIONS = new Set([".md", ".json", ".yaml", ".yml"]);

/**
 * Returns true if the relative path should be treated as LF-normalized text.
 */
export function isTextPath(relPath) {
  const posixPath = relPath.replace(/\\/g, "/");
  const base = path.posix.basename(posixPath).toLowerCase();
  const ext = path.posix.extname(base);
  return TEXT_EXTENSIONS.has(ext) || base === ".gitignore";
}

/**
 * Normalizes CRLF and lone CR line endings to LF for text paths; leaves binary buffers untouched.
 */
export function normalizeText(data, relPath) {
  if (!isTextPath(relPath)) {
    return data;
  }
  const normalized = data.toString("utf8").replace(/\r\n?/g, "\n");
  return Buffer.from(normalized, "utf8");
}

/**
 * Recursively lists all files under rootDir as sorted POSIX relative paths, skipping .DS_Store.
 */
export function listFilesRelative(rootDir) {
  const results = [];

  function walk(currentDir, relPrefix) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === ".DS_Store") {
        continue;
      }
      const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
      const full = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(full, rel);
      } else if (entry.isFile()) {
        results.push(rel);
      }
    }
  }

  walk(rootDir, "");
  return results.sort();
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

/**
 * Compares two directory trees by file presence and SHA-256 content in sorted path order.
 */
export function diffDirectories(dirA, dirB) {
  const filesA = new Set(listFilesRelative(dirA));
  const filesB = new Set(listFilesRelative(dirB));
  const allPaths = [...new Set([...filesA, ...filesB])].sort();

  const diffs = [];
  for (const rel of allPaths) {
    const inA = filesA.has(rel);
    const inB = filesB.has(rel);
    if (inA && !inB) {
      diffs.push(`- ${rel} (missing in second directory)`);
    } else if (!inA && inB) {
      diffs.push(`+ ${rel} (only in second directory)`);
    } else {
      const hashA = sha256File(path.join(dirA, rel));
      const hashB = sha256File(path.join(dirB, rel));
      if (hashA !== hashB) {
        diffs.push(`M ${rel}`);
      }
    }
  }
  return diffs;
}

/**
 * Scans .md, .json, .yaml, and .yml files under rootDir (skipping NOTICE.md) for host-specific references.
 */
export function findHostReferences(rootDir, allowlist = [], pluginName = undefined) {
  const hits = [];
  const linePattern = new RegExp(HOST_REF_PATTERN.source, "i");

  for (const rel of listFilesRelative(rootDir)) {
    const base = path.posix.basename(rel);
    if (base === "NOTICE.md") {
      continue;
    }
    const ext = path.posix.extname(base).toLowerCase();
    if (!HOST_SCAN_EXTENSIONS.has(ext)) {
      continue;
    }

    const content = fs.readFileSync(path.join(rootDir, rel), "utf8");
    const lines = content.split(/\r?\n/);
    const fileAllowlist = allowlist.filter(
      (entry) => entry.file === rel && (!entry.plugin || entry.plugin === pluginName),
    );

    for (let idx = 0; idx < lines.length; idx++) {
      const lineText = lines[idx];
      const match = linePattern.exec(lineText);
      if (!match) {
        continue;
      }
      if (fileAllowlist.some((entry) => lineText.includes(entry.pattern))) {
        continue;
      }
      hits.push({
        file: rel,
        line: idx + 1,
        match: match[0],
        text: lineText,
      });
    }
  }

  return hits;
}
