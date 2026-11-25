export type Content = { file: string; bytes: Buffer; text: string };

/** Every rule of the guard: true means the file breaks it. */
export const rules: Record<string, (content: Content, listed: boolean) => boolean> = {
  "gedcom-name": ({ file }) => /\.(?:ged|gedcom|gdz)$/i.test(file),
  "gedcom-content": ({ text }) =>
    [record, name].some((part) => part.test(text)) || (head.test(text) && version.test(text)),
  // Inside another string the closing quote is escaped. Code spells the marker in backticks.
  "backup-marker": ({ text }) => /["']radavod(?:-|\\+u002d)backup\\*["']/i.test(text),
  "sqlite-content": ({ bytes }) =>
    bytes.includes("SQLite format 3\0") || sqliteLogs.some((magic) => startsWith(bytes, magic)),
  "archive-content": ({ bytes }) =>
    archives.some((magic) => startsWith(bytes, magic)) ||
    bytes.toString("latin1", 257, 262) === "ustar" ||
    endsWithZip(bytes),
  "unlisted-example": ({ file }, listed) => !listed && /^examples\//i.test(file),
};

/**
 * One text for every encoding. GEDCOM and JSON keep their structure in ASCII, and UTF-16 only pads
 * it with zeros.
 */
export function textOf(bytes: Buffer): string {
  return bytes.toString("latin1").replaceAll("\0", "");
}

/**
 * A GEDCOM line. Its level is not a part of a longer number. It ends for real, as an escape inside a
 * string, as a string of its own, as a cell or as HTML.
 */
function line(pattern: string): RegExp {
  return new RegExp(
    String.raw`(?<![\d.])${pattern}[ \t]*(?:$|[\r\n"'<,;]|\\+(?:[rn]|u000[ad]))`,
    "i",
  );
}

const head = line(String.raw`0[ \t]+HEAD`);
const version = line(String.raw`1[ \t]+GEDC`);
const record = line(String.raw`0[ \t]+@[^@\r\n]{1,40}@[ \t]+(?:INDI|FAM)`);
const name = /(?<![\d.])1[ \t]+NAME[ \t]+[^/\r\n]{0,80}\/[^/\r\n]{1,80}\//i;

/** A write-ahead log in both byte orders, then a rollback journal. Both hold pages of the database. */
const sqliteLogs = ["377f0682", "377f0683", "d9d505f920a163d7"];

/** zip (three kinds), gzip, compress, bzip2, xz, zstd, lz4, lzip, 7z, rar, cab. */
const archives = [
  "504b0304",
  "504b0506",
  "504b0708",
  "1f8b",
  "1f9d",
  "425a68",
  "fd377a585a00",
  "28b52ffd",
  "04224d18",
  "4c5a4950",
  "377abcaf271c",
  "526172211a07",
  "4d534346",
];

function startsWith(bytes: Buffer, magic: string): boolean {
  return bytes.toString("hex", 0, magic.length / 2) === magic;
}

/** A zip is read from its end, so anything may come before it. Its last record ends in a comment. */
function endsWithZip(bytes: Buffer): boolean {
  const signature = Buffer.from("504b0506", "hex");
  for (let at = bytes.indexOf(signature); at >= 0; at = bytes.indexOf(signature, at + 1)) {
    const end = at + 22;
    if (end <= bytes.length && end + bytes.readUInt16LE(at + 20) === bytes.length) return true;
  }
  return false;
}
