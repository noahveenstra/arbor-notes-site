// ZIP_STORED files use the original UTF-8 bytes. Keeping the payloads as Blob
// parts avoids copying an entire folder into a second contiguous buffer.
const encoder = new TextEncoder();
const max32 = 0xffffffff;
const crcTable = Uint32Array.from({ length: 256 }, (_, byte) => {
  let crc = byte;
  for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  return crc >>> 0;
});

function directory(prefix) {
  return { prefix, used: new Set(), nextNumber: new Map() };
}

export function downloadName(stem, ending) {
  const byteLimit = 255 - ending.length;
  if (encoder.encode(stem).length <= byteLimit) return stem + ending;
  let base = "";
  let bytes = 0;
  for (const character of stem) {
    bytes += encoder.encode(character).length;
    if (bytes > byteLimit) break;
    base += character;
  }
  return base + ending;
}

function reserveName(parent, stem, extension) {
  const baseKey = (stem + extension).normalize("NFC").toLowerCase();
  let number = parent.nextNumber.get(baseKey) || 1;
  while (true) {
    const ending = (number === 1 ? "" : " -" + number) + extension;
    const name = downloadName(stem, ending);
    const key = name.normalize("NFC").toLowerCase();
    number++;
    if (parent.used.has(key)) continue;
    parent.used.add(key);
    parent.nextNumber.set(baseKey, number);
    return name;
  }
}

function archiveDirectories(entries, safeStem) {
  const root = directory("");
  const bySourcePath = new Map([["", root]]);
  // Directories retain their place even if a note also needs their filename.
  // Sort the original paths to keep sibling suffixes stable as note order changes.
  const paths = new Set(entries.map(entry => entry.folder));
  for (const path of [...paths].sort()) {
    let parent = root;
    let sourcePath = "";
    for (const component of path.split("/").filter(Boolean)) {
      sourcePath = sourcePath ? sourcePath + "/" + component : component;
      if (!bySourcePath.has(sourcePath)) {
        const name = reserveName(parent, safeStem(component), "");
        bySourcePath.set(sourcePath, directory(parent.prefix + name + "/"));
      }
      parent = bySourcePath.get(sourcePath);
    }
  }
  return bySourcePath;
}

export function markdownArchive(entries, safeStem) {
  if (entries.length >= 0xffff) throw new Error("This folder exceeds the ZIP file-count limit.");
  const folders = archiveDirectories(entries, safeStem);
  const files = [];
  const directory = [];
  let offset = 0;
  let directorySize = 0;
  for (const { folder, title, text } of entries) {
    const parent = folders.get(folder);
    const filename = reserveName(parent, safeStem(title), ".md");
    const path = encoder.encode(parent.prefix + filename);
    const data = encoder.encode(text);
    if (path.length > 0xffff || offset + 30 + path.length + data.length >= max32) {
      throw new Error("This folder exceeds the ZIP size limit.");
    }
    let crc = max32;
    for (const byte of data) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
    crc = (crc ^ max32) >>> 0;
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(12, 0x21, true); // Earliest representable DOS date (1980-01-01)
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, path.length, true);
    files.push(local.buffer, path, data);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    new Uint8Array(central.buffer, 6, 26).set(new Uint8Array(local.buffer, 4, 26));
    central.setUint32(42, offset, true);
    directory.push(central.buffer, path);
    offset += 30 + path.length + data.length;
    directorySize += 46 + path.length;
  }
  if (offset + directorySize + 22 >= max32) throw new Error("This folder exceeds the ZIP size limit.");
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, directorySize, true);
  end.setUint32(16, offset, true);
  return new Blob([...files, ...directory, end.buffer], { type: "application/zip" });
}

// Web records prefix the authored body with a title and a blank line. Slice
// only that prefix so line endings in an unedited imported file stay exact.
export function webFileBody(source) {
  const prefix = /^(?:[ \t]*(?:\r\n|\n))*[^\r\n]*(?:\r\n|\n|$)(?:\r\n|\n)?/.exec(source);
  return prefix ? source.slice(prefix[0].length) : source;
}

export function downloadFile(name, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
