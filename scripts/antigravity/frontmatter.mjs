/**
 * Parses a YAML double-quoted scalar, returning the unescaped string.
 */
function parseDoubleQuoted(raw) {
  let out = "";
  let i = 1; // skip opening quote
  while (i < raw.length) {
    const ch = raw[i];
    if (ch === '"') {
      return out;
    }
    if (ch === "\\" && i + 1 < raw.length) {
      const next = raw[i + 1];
      switch (next) {
        case "n":
          out += "\n";
          break;
        case "r":
          out += "\r";
          break;
        case "t":
          out += "\t";
          break;
        case '"':
          out += '"';
          break;
        case "\\":
          out += "\\";
          break;
        default:
          out += next;
          break;
      }
      i += 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/**
 * Parses a YAML single-quoted scalar ('' escapes a literal ').
 */
function parseSingleQuoted(raw) {
  let out = "";
  let i = 1; // skip opening quote
  while (i < raw.length) {
    const ch = raw[i];
    if (ch === "'") {
      if (raw[i + 1] === "'") {
        out += "'";
        i += 2;
        continue;
      }
      return out;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/**
 * Parses a YAML block scalar (> / >- / | / |-) starting at lines[startIdx].
 */
function parseBlockScalar(lines, startIdx, style, chomp) {
  const collected = [];
  let idx = startIdx;

  while (idx < lines.length) {
    const line = lines[idx];
    if (/^\s*$/.test(line)) {
      collected.push("");
      idx += 1;
      continue;
    }
    if (/^\s+/.test(line)) {
      collected.push(line);
      idx += 1;
      continue;
    }
    break;
  }

  let trailingEmpty = 0;
  while (collected.length > 0 && collected[collected.length - 1] === "") {
    collected.pop();
    trailingEmpty += 1;
  }

  const firstContent = collected.find((l) => l.length > 0);
  if (!firstContent) {
    return { value: chomp === "+" ? "\n".repeat(trailingEmpty) : "", nextIdx: idx };
  }

  const indentMatch = firstContent.match(/^(\s+)/);
  const indentLen = indentMatch ? indentMatch[1].length : 0;
  const stripped = collected.map((l) => (l.length === 0 ? "" : l.slice(indentLen)));

  let body;
  if (style === ">") {
    const paragraphs = [];
    let current = [];
    for (const line of stripped) {
      if (line === "") {
        if (current.length > 0) {
          paragraphs.push(current.join(" "));
          current = [];
        }
        paragraphs.push("");
      } else {
        current.push(line);
      }
    }
    if (current.length > 0) {
      paragraphs.push(current.join(" "));
    }
    body = paragraphs.join("\n");
  } else {
    body = stripped.join("\n");
  }

  if (chomp === "-") {
    return { value: body, nextIdx: idx };
  }
  if (chomp === "+") {
    return { value: `${body}\n${"\n".repeat(trailingEmpty)}`, nextIdx: idx };
  }
  return { value: `${body}\n`, nextIdx: idx };
}

/**
 * Reads name and description from SKILL.md YAML frontmatter without external dependencies.
 */
export function readSkillFrontmatter(markdown) {
  const normalized = markdown.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const match = normalized.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (!match) {
    // Also handle empty frontmatter (`---\n---`) so it reports missing name rather than missing frontmatter.
    if (/^---\n---(?:\n|$)/.test(normalized)) {
      throw new Error("Missing name");
    }
    throw new Error("Missing YAML frontmatter");
  }

  const lines = match[1].split("\n");
  const fields = {};

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*$/.test(line) || /^\s*#/.test(line) || /^\s+/.test(line)) {
      i += 1;
      continue;
    }

    const kv = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!kv) {
      i += 1;
      continue;
    }

    const key = kv[1];
    const rawRest = kv[2].trim();

    const blockMatch = rawRest.match(/^([>|])([+-])?(?:\s+#.*)?$/);
    if (blockMatch) {
      const { value, nextIdx } = parseBlockScalar(lines, i + 1, blockMatch[1], blockMatch[2] || "");
      fields[key] = value;
      i = nextIdx;
      continue;
    }

    if (rawRest.startsWith('"')) {
      fields[key] = parseDoubleQuoted(rawRest);
    } else if (rawRest.startsWith("'")) {
      fields[key] = parseSingleQuoted(rawRest);
    } else {
      fields[key] = rawRest.replace(/\s+#.*$/, "").trim();
    }
    i += 1;
  }

  if (!fields.name) {
    throw new Error("Missing name");
  }
  if (!fields.description) {
    throw new Error("Missing description");
  }

  return { name: fields.name, description: fields.description };
}
