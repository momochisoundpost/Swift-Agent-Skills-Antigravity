import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readSkillFrontmatter } from "../antigravity/frontmatter.mjs";

describe("readSkillFrontmatter", () => {
  test("reads plain name and description", () => {
    assert.deepEqual(
      readSkillFrontmatter("---\nname: swiftui-pro\ndescription: Reviews SwiftUI.\n---\nBody"),
      { name: "swiftui-pro", description: "Reviews SwiftUI." },
    );
  });

  test("skips nested metadata map", () => {
    const md =
      '---\nname: a\ndescription: d\nlicense: MIT\nmetadata:\n  author: Paul Hudson\n  version: "2.0.0"\n---\n';
    assert.equal(readSkillFrontmatter(md).name, "a");
    assert.equal(readSkillFrontmatter(md).description, "d");
  });

  test("folded block description and CRLF", () => {
    const md = "---\r\nname: x\r\ndescription: >-\r\n  line one\r\n  line two\r\n---\r\n";
    assert.equal(readSkillFrontmatter(md).description, "line one line two");
  });

  test("literal block scalar preserves newlines", () => {
    const md = "---\nname: x\ndescription: |\n  line one\n  line two\n---\n";
    assert.equal(readSkillFrontmatter(md).description, "line one\nline two\n");

    const mdStrip = "---\nname: x\ndescription: |-\n  line one\n  line two\n---\n";
    assert.equal(readSkillFrontmatter(mdStrip).description, "line one\nline two");
  });

  test("quoted values", () => {
    assert.equal(
      readSkillFrontmatter("---\nname: \"q\"\ndescription: 'it''s'\n---\n").description,
      "it's",
    );
    assert.equal(
      readSkillFrontmatter('---\nname: "hello \\"world\\""\ndescription: "desc"\n---\n').name,
      'hello "world"',
    );
  });

  test("throws without frontmatter / name / description", () => {
    assert.throws(() => readSkillFrontmatter("# no fm"), /Missing YAML frontmatter/);
    assert.throws(() => readSkillFrontmatter("---\ndescription: d\n---\n"), /Missing name/);
    assert.throws(() => readSkillFrontmatter("---\nname: n\n---\n"), /Missing description/);
  });
});
