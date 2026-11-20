import zlib from "node:zlib";

const LOCAL_FILE_HEADER_SIG = 0x04034b50;
const CENTRAL_DIR_HEADER_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;
const VERSION_NEEDED = 20;
const VERSION_MADE_BY = (3 << 8) | 20;
const UTF8_FLAG = 0x0800;
const DOS_TIME_FIXED = 0x0000;
const DOS_DATE_FIXED = 0x0021;
const METHOD_STORE = 0;
const METHOD_DEFLATE = 8;

function buildLocalHeader({ method, crc, compressedSize, uncompressedSize, nameBuf }) {
  const header = Buffer.allocUnsafe(30 + nameBuf.length);
  header.writeUInt32LE(LOCAL_FILE_HEADER_SIG, 0);
  header.writeUInt16LE(VERSION_NEEDED, 4);
  header.writeUInt16LE(UTF8_FLAG, 6);
  header.writeUInt16LE(method, 8);
  header.writeUInt16LE(DOS_TIME_FIXED, 10);
  header.writeUInt16LE(DOS_DATE_FIXED, 12);
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(compressedSize, 18);
  header.writeUInt32LE(uncompressedSize, 22);
  header.writeUInt16LE(nameBuf.length, 26);
  header.writeUInt16LE(0, 28);
  nameBuf.copy(header, 30);
  return header;
}

function buildCentralHeader({
  method,
  crc,
  compressedSize,
  uncompressedSize,
  nameBuf,
  externalAttr,
  localOffset,
}) {
  const header = Buffer.allocUnsafe(46 + nameBuf.length);
  header.writeUInt32LE(CENTRAL_DIR_HEADER_SIG, 0);
  header.writeUInt16LE(VERSION_MADE_BY, 4);
  header.writeUInt16LE(VERSION_NEEDED, 6);
  header.writeUInt16LE(UTF8_FLAG, 8);
  header.writeUInt16LE(method, 10);
  header.writeUInt16LE(DOS_TIME_FIXED, 12);
  header.writeUInt16LE(DOS_DATE_FIXED, 14);
  header.writeUInt32LE(crc, 16);
  header.writeUInt32LE(compressedSize, 20);
  header.writeUInt32LE(uncompressedSize, 24);
  header.writeUInt16LE(nameBuf.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(externalAttr, 38);
  header.writeUInt32LE(localOffset, 42);
  nameBuf.copy(header, 46);
  return header;
}

function buildEocd(entryCount, centralDirSize, centralDirOffset) {
  const eocd = Buffer.allocUnsafe(22);
  eocd.writeUInt32LE(EOCD_SIG, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entryCount, 8);
  eocd.writeUInt16LE(entryCount, 10);
  eocd.writeUInt32LE(centralDirSize, 12);
  eocd.writeUInt32LE(centralDirOffset, 16);
  eocd.writeUInt16LE(0, 20);
  return eocd;
}

/**
 * Encodes file entries into a deterministic ZIP buffer preserving POSIX file modes.
 */
export function createZip(entries) {
  if (!Array.isArray(entries)) {
    throw new TypeError("createZip expects an array of entries");
  }
  if (entries.length > 0xffff) {
    throw new RangeError(`Too many ZIP entries (${entries.length}); ZIP64 is not supported`);
  }

  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    if (!entry || typeof entry.name !== "string" || entry.name.length === 0) {
      throw new Error("ZIP entry must have a non-empty string name");
    }
    if (entry.data === undefined || entry.data === null) {
      throw new TypeError(`ZIP entry '${entry.name}' is missing data`);
    }

    const posixName = entry.name.replace(/\\/g, "/");
    const nameBuf = Buffer.from(posixName, "utf8");
    if (nameBuf.length > 0xffff) {
      throw new RangeError(`ZIP entry name too long: ${posixName}`);
    }

    const rawData = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data);
    const crc = zlib.crc32(rawData) >>> 0;
    const deflated = zlib.deflateRawSync(rawData);
    const useDeflate = deflated.length < rawData.length;
    const method = useDeflate ? METHOD_DEFLATE : METHOD_STORE;
    const payload = useDeflate ? deflated : rawData;

    const mode = (entry.mode ?? 0o644) & 0o777;
    const externalAttr = ((0o100000 | mode) << 16) >>> 0;

    const localHeader = buildLocalHeader({
      method,
      crc,
      compressedSize: payload.length,
      uncompressedSize: rawData.length,
      nameBuf,
    });
    const centralHeader = buildCentralHeader({
      method,
      crc,
      compressedSize: payload.length,
      uncompressedSize: rawData.length,
      nameBuf,
      externalAttr,
      localOffset: offset,
    });

    localParts.push(localHeader, payload);
    centralParts.push(centralHeader);
    offset += localHeader.length + payload.length;
  }

  const centralDirSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const eocd = buildEocd(entries.length, centralDirSize, offset);

  return Buffer.concat([...localParts, ...centralParts, eocd]);
}

function findEocdOffset(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 22) {
    throw new Error("Invalid ZIP: buffer too small for EOCD");
  }
  const minOffset = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= minOffset; i -= 1) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      const commentLen = buf.readUInt16LE(i + 20);
      if (i + 22 + commentLen === buf.length) {
        return i;
      }
    }
  }
  throw new Error("Invalid ZIP: EOCD record not found");
}

/**
 * Reads and CRC-verifies all entries from a ZIP buffer using its central directory.
 */
export function readZipEntries(buf) {
  const eocdOffset = findEocdOffset(buf);
  const diskNumber = buf.readUInt16LE(eocdOffset + 4);
  const cdStartDisk = buf.readUInt16LE(eocdOffset + 6);
  const entriesOnDisk = buf.readUInt16LE(eocdOffset + 8);
  const totalEntries = buf.readUInt16LE(eocdOffset + 10);
  const cdSize = buf.readUInt32LE(eocdOffset + 12);
  const cdOffset = buf.readUInt32LE(eocdOffset + 16);

  if (diskNumber !== 0 || cdStartDisk !== 0 || entriesOnDisk !== totalEntries) {
    throw new Error("Unsupported multi-disk ZIP archive");
  }
  if (cdOffset + cdSize > eocdOffset) {
    throw new Error("Invalid ZIP: central directory extends past EOCD");
  }

  const entries = [];
  let cursor = cdOffset;
  const cdEnd = cdOffset + cdSize;

  for (let i = 0; i < totalEntries; i += 1) {
    if (cursor + 46 > cdEnd) {
      throw new Error("Invalid ZIP: truncated central directory entry");
    }
    if (buf.readUInt32LE(cursor) !== CENTRAL_DIR_HEADER_SIG) {
      throw new Error(`Invalid ZIP: bad central directory signature at offset ${cursor}`);
    }

    const method = buf.readUInt16LE(cursor + 10);
    const expectedCrc = buf.readUInt32LE(cursor + 16);
    const compressedSize = buf.readUInt32LE(cursor + 20);
    const uncompressedSize = buf.readUInt32LE(cursor + 24);
    const nameLen = buf.readUInt16LE(cursor + 28);
    const extraLen = buf.readUInt16LE(cursor + 30);
    const commentLen = buf.readUInt16LE(cursor + 32);
    const externalAttr = buf.readUInt32LE(cursor + 38);
    const localHeaderOffset = buf.readUInt32LE(cursor + 42);

    if (cursor + 46 + nameLen + extraLen + commentLen > cdEnd) {
      throw new Error("Invalid ZIP: central directory entry exceeds central directory bounds");
    }

    const name = buf.toString("utf8", cursor + 46, cursor + 46 + nameLen);
    const mode = (externalAttr >>> 16) & 0o777;
    cursor += 46 + nameLen + extraLen + commentLen;

    if (localHeaderOffset + 30 > cdOffset) {
      throw new Error(`Invalid ZIP: local header out of bounds for '${name}'`);
    }
    if (buf.readUInt32LE(localHeaderOffset) !== LOCAL_FILE_HEADER_SIG) {
      throw new Error(`Invalid ZIP: bad local file header signature for '${name}'`);
    }

    const localNameLen = buf.readUInt16LE(localHeaderOffset + 26);
    const localExtraLen = buf.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    if (dataStart + compressedSize > cdOffset) {
      throw new Error(`Invalid ZIP: file payload out of bounds for '${name}'`);
    }

    const compressedSlice = buf.subarray(dataStart, dataStart + compressedSize);
    let data;
    if (method === METHOD_STORE) {
      data = Buffer.from(compressedSlice);
    } else if (method === METHOD_DEFLATE) {
      data = zlib.inflateRawSync(compressedSlice);
    } else {
      throw new Error(`Unsupported ZIP compression method ${method} for '${name}'`);
    }

    if (data.length !== uncompressedSize) {
      throw new Error(
        `Invalid ZIP: uncompressed length mismatch for '${name}' (expected ${uncompressedSize}, got ${data.length})`,
      );
    }

    const actualCrc = zlib.crc32(data) >>> 0;
    if (actualCrc !== expectedCrc) {
      throw new Error(
        `CRC32 mismatch for '${name}' (expected 0x${expectedCrc.toString(16)}, got 0x${actualCrc.toString(16)})`,
      );
    }

    entries.push({ name, mode, data });
  }

  if (cursor !== cdEnd) {
    throw new Error("Invalid ZIP: central directory size mismatch");
  }

  return entries;
}
