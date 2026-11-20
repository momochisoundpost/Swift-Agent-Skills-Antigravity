import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createZip, readZipEntries } from "../antigravity/zip.mjs";
import { makeTempDir } from "./helpers.mjs";

const tempDirs = [];

function trackTemp(dir) {
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("zip", () => {
  test("createZip/readZipEntries roundtrip with modes and unicode", () => {
    const entries = [
      { name: "a/x.sh", data: Buffer.from("#!/bin/sh\n", "utf8"), mode: 0o755 },
      { name: "a/é.md", data: Buffer.alloc(5000, "z"), mode: 0o644 },
      { name: "a/empty.txt", data: Buffer.alloc(0), mode: 0o644 },
      { name: "a/utf8.txt", data: Buffer.from("Swift café 🚀\n", "utf8"), mode: 0o644 },
    ];

    const zipBuf = createZip(entries);
    const out = readZipEntries(zipBuf);

    assert.deepEqual(
      out.map((e) => [e.name, e.mode & 0o777, e.data.length]),
      [
        ["a/x.sh", 0o755, 10],
        ["a/é.md", 0o644, 5000],
        ["a/empty.txt", 0o644, 0],
        ["a/utf8.txt", 0o644, Buffer.byteLength("Swift café 🚀\n", "utf8")],
      ],
    );
    assert.deepEqual(out[0].data, entries[0].data);
    assert.deepEqual(out[1].data, entries[1].data);
    assert.deepEqual(out[2].data, entries[2].data);
    assert.deepEqual(out[3].data, entries[3].data);
  });

  test("createZip is deterministic and sets expected ZIP header fields", () => {
    const entries = [
      { name: "dir\\sub\\script.sh", data: Buffer.from("#!/bin/sh\necho ok\n"), mode: 0o755 },
      { name: "dir/big.txt", data: Buffer.alloc(4096, "a"), mode: 0o644 },
    ];

    const buf1 = createZip(entries);
    const buf2 = createZip(entries);
    assert.deepEqual(buf1, buf2);

    // Local file header 0: signature, version 20, UTF-8 flag 0x0800, method 0 (small), DOS 1980-01-01
    assert.equal(buf1.readUInt32LE(0), 0x04034b50);
    assert.equal(buf1.readUInt16LE(4), 20);
    assert.equal(buf1.readUInt16LE(6), 0x0800);
    assert.equal(buf1.readUInt16LE(8), 0);
    assert.equal(buf1.readUInt16LE(10), 0x0000);
    assert.equal(buf1.readUInt16LE(12), 0x0021);

    // Find EOCD and verify central directory attributes (version made by, external attributes, method 8 for compressible entry)
    const eocdOffset = buf1.length - 22;
    assert.equal(buf1.readUInt32LE(eocdOffset), 0x06054b50);
    assert.equal(buf1.readUInt16LE(eocdOffset + 10), 2);
    const cdOffset = buf1.readUInt32LE(eocdOffset + 16);
    assert.equal(buf1.readUInt32LE(cdOffset), 0x02014b50);
    assert.equal(buf1.readUInt16LE(cdOffset + 4), (3 << 8) | 20);
    assert.equal(buf1.readUInt16LE(cdOffset + 6), 20);
    assert.equal(buf1.readUInt16LE(cdOffset + 8), 0x0800);
    assert.equal(buf1.readUInt16LE(cdOffset + 12), 0x0000);
    assert.equal(buf1.readUInt16LE(cdOffset + 14), 0x0021);
    assert.equal(buf1.readUInt32LE(cdOffset + 38), ((0o100000 | 0o755) << 16) >>> 0);

    // Second central directory entry uses method 8 (deflated) and 0644 mode
    const firstNameLen = buf1.readUInt16LE(cdOffset + 28);
    const cdSecond = cdOffset + 46 + firstNameLen;
    assert.equal(buf1.readUInt32LE(cdSecond), 0x02014b50);
    assert.equal(buf1.readUInt16LE(cdSecond + 10), 8);
    assert.equal(buf1.readUInt32LE(cdSecond + 38), ((0o100000 | 0o644) << 16) >>> 0);

    // Backslashes in name normalized to POSIX forward slashes
    const parsed = readZipEntries(buf1);
    assert.deepEqual(
      parsed.map((e) => e.name),
      ["dir/sub/script.sh", "dir/big.txt"],
    );
  });

  test("zip extracts with platform tool", (t) => {
    const dir = trackTemp(makeTempDir("zip-tool-"));
    const zipPath = path.join(dir, "archive.zip");
    const outDir = path.join(dir, "extracted");
    const entries = [
      { name: "a/x.sh", data: Buffer.from("#!/bin/sh\necho hi\n", "utf8"), mode: 0o755 },
      { name: "a/é.md", data: Buffer.alloc(5000, "z"), mode: 0o644 },
    ];
    fs.writeFileSync(zipPath, createZip(entries));

    if (process.platform === "win32") {
      const psCmd = `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${outDir.replace(/'/g, "''")}' -Force`;
      const res = spawnSync("powershell", ["-NoProfile", "-Command", psCmd], {
        encoding: "utf8",
      });
      assert.equal(res.status, 0, `Expand-Archive failed: ${res.stderr}`);
      assert.equal(fs.readFileSync(path.join(outDir, "a", "x.sh"), "utf8"), "#!/bin/sh\necho hi\n");
      assert.equal(fs.readFileSync(path.join(outDir, "a", "é.md"), "utf8"), "z".repeat(5000));
      return;
    }

    const probe = spawnSync("unzip", ["-v"], { encoding: "utf8" });
    if (probe.error || probe.status !== 0) {
      t.skip("unzip not installed");
      return;
    }

    const listRes = spawnSync("unzip", ["-Z", zipPath], { encoding: "utf8" });
    assert.equal(listRes.status, 0, listRes.stderr);
    assert.match(listRes.stdout, /-rwxr-xr-x.*a\/x\.sh/);
    assert.match(listRes.stdout, /-rw-r--r--.*a\/é\.md/);

    fs.mkdirSync(outDir, { recursive: true });
    const extRes = spawnSync("unzip", ["-q", zipPath, "-d", outDir], { encoding: "utf8" });
    assert.equal(extRes.status, 0, extRes.stderr);
    assert.equal(fs.statSync(path.join(outDir, "a", "x.sh")).mode & 0o777, 0o755);
    assert.equal(fs.readFileSync(path.join(outDir, "a", "é.md"), "utf8"), "z".repeat(5000));
  });

  test("readZipEntries handles empty archives and rejects invalid or CRC-corrupted zip buffers", () => {
    assert.deepEqual(readZipEntries(createZip([])), []);
    assert.throws(() => readZipEntries(Buffer.from("not a zip")), /EOCD|zip/i);
    assert.throws(() => createZip(null), TypeError);
    assert.throws(() => createZip([{ name: "", data: Buffer.from("a") }]), /non-empty string name/);

    const zipBuf = createZip([{ name: "a.txt", data: Buffer.from("hello world"), mode: 0o644 }]);
    assert.throws(() => readZipEntries(Buffer.concat([zipBuf, Buffer.from("tail")])), /EOCD/i);

    // Corrupt stored byte inside local file data (local header 30 + 5-byte name = offset 35)
    const corrupted = Buffer.from(zipBuf);
    corrupted[35] ^= 0xff;
    assert.throws(() => readZipEntries(corrupted), /CRC/i);
  });
});
