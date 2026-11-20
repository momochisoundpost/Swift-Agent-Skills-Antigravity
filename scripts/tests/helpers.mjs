import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ANTIGRAVITY_SCHEMA_URL } from "../antigravity/lib.mjs";
import { packageRelease } from "../antigravity/package-release.mjs";

export const EIGHT_PACK_NAMES = [
  "swift-core",
  "swift-ui-craft",
  "swift-apple-frameworks",
  "swift-quality",
  "swift-app-store",
  "swift-asc-cli",
  "swift-ios-simulator",
  "swift-extras",
];

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

/**
 * Builds a minimal valid plugins tree (all 8 packs by default, including an executable script in
 * swift-ios-simulator listed in EXECUTABLES.txt) and packages it into baseDir via packageRelease.
 */
export function makeEightPackFixtureZip(
  baseDir,
  { packs = EIGHT_PACK_NAMES, zipName = "swift-agent-skills-antigravity.zip" } = {},
) {
  const pluginsRoot = makeTempDir("ag-eight-pack-src-");
  const outPath = path.join(baseDir, zipName);
  const executables = [];

  try {
    for (const packName of packs) {
      const packDir = path.join(pluginsRoot, packName);
      fs.mkdirSync(path.join(packDir, "assets"), { recursive: true });
      fs.writeFileSync(
        path.join(packDir, "assets", "logo.svg"),
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"></svg>\n',
        "utf8",
      );
      fs.writeFileSync(path.join(packDir, "README.md"), `# ${packName}\n`, "utf8");
      fs.writeFileSync(
        path.join(packDir, "NOTICE.md"),
        `# Third-Party Notices (${packName})\n`,
        "utf8",
      );
      fs.writeFileSync(
        path.join(packDir, "plugin.json"),
        `${JSON.stringify(
          {
            $schema: ANTIGRAVITY_SCHEMA_URL,
            name: packName,
            displayName: `${packName} Tools`,
            description: `Minimal valid fixture for ${packName}.`,
            version: "1.0.0",
            logo: "assets/logo.svg",
            suggestedPrompts: ["Prompt one", "Prompt two", "Prompt three"],
            author: { name: "Test Author", url: "https://example.com" },
          },
          null,
          2,
        )}\n`,
        "utf8",
      );

      const skillName =
        packName === "swift-ios-simulator" ? "ios-simulator-skill" : `${packName}-skill`;
      const skillDir = path.join(packDir, "skills", skillName);
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, "SKILL.md"),
        `---\nname: ${skillName}\ndescription: Minimal valid skill for ${packName}.\n---\nBody for ${skillName}.\n`,
        "utf8",
      );

      if (packName === "swift-ios-simulator") {
        const scriptsDir = path.join(skillDir, "scripts");
        fs.mkdirSync(scriptsDir, { recursive: true });
        fs.writeFileSync(path.join(scriptsDir, "run.sh"), "#!/bin/sh\necho ok\n", "utf8");
        executables.push("swift-ios-simulator/skills/ios-simulator-skill/scripts/run.sh");
      }
    }

    if (executables.length > 0) {
      fs.writeFileSync(
        path.join(pluginsRoot, "EXECUTABLES.txt"),
        `${executables.join("\n")}\n`,
        "utf8",
      );
    }

    packageRelease({ pluginsRoot, outPath });
    return outPath;
  } finally {
    fs.rmSync(pluginsRoot, { recursive: true, force: true });
  }
}
