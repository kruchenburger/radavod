export type Content = { file: string; bytes: Buffer; text: string };

/** Every rule of the guard: true means the file breaks it. */
export const rules: Record<string, (content: Content, listed: boolean) => boolean> = {
  "gedcom-name": ({ file }) => /\.(?:ged|gedcom|gdz)$/i.test(file),
  "gedcom-content": ({ text }) => record.test(text) || (head.test(text) && version.test(text)),
  // Inside another string the closing quote is escaped. Code spells the marker in backticks.
  "backup-marker": ({ text }) => /"radavod[-]backup\\*"/.test(text),
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

/** A GEDCOM line that is not a part of a longer number and ends for real or inside a string. */
function line(pattern: string): RegExp {
  return new RegExp(String.raw`(?<![\d.])${pattern}[ \t]*(?:[\r\n]|\\[rn]|$)`, "i");
}

const head = line(String.raw`0[ \t]+HEAD`);
const version = line(String.raw`1[ \t]+GEDC`);
const record = line(String.raw`0[ \t]+@[^@\s]+@[ \t]+(?:INDI|FAM)`);

/** A write-ahead log in both byte orders, then a rollback journal. Both hold pages of the database. */
const sqliteLogs = ["377f0682", "377f0683", "d9d505f920a163d7"];

/** zip (three kinds), gzip, bzip2, xz, zstd, 7z, rar. */
const archives = [
  "504b0304",
  "504b0506",
  "504b0708",
  "1f8b",
  "425a68",
  "fd377a585a00",
  "28b52ffd",
  "377abcaf271c",
  "526172211a07",
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
