/**
 * Broken examples for the data guard, built here and written only into temporary repositories.
 *
 * The guard has no exception for its own folder. No file in this repository holds a forbidden
 * sequence: this one keeps GEDCOM as separate levels and tags, and magic numbers as hex.
 */

export type Files = Record<string, Uint8Array>;

const utf8 = (text: string): Buffer => Buffer.from(text, "utf8");
const utf16le = (text: string): Buffer => Buffer.from(text, "utf16le");
const utf16be = (text: string): Buffer => Buffer.from(text, "utf16le").swap16();
const hex = (digits: string): Buffer => Buffer.from(digits, "hex");
const padded = (head: Buffer): Buffer => Buffer.concat([head, Buffer.alloc(512, 0xff)]);

type Line = [level: number, ...rest: string[]];
const lines = (rows: Line[], end = "\n"): string => rows.map((row) => row.join(" ") + end).join("");

const header: Line[] = [
  [0, "HEAD"],
  [1, "SOUR", "Invented"],
  [1, "GEDC"],
  [2, "VERS", "5.5.1"],
];
const person: Line[] = [
  [0, "@I1@", "INDI"],
  [1, "NAME", "Адам /Ольхович/"],
];
const union: Line[] = [
  [0, "@F1@", "FAM"],
  [1, "HUSB", "@I1@"],
];
const gedcom = [...header, ...person];
const tree = lines(gedcom);
const bom = "﻿";

const marker = ["radavod", "backup"].join("-");
const backup = JSON.stringify({ format: marker, people: [] });

const sqlite = padded(Buffer.concat([utf8("SQLite format 3"), hex("00")]));
const emptyZip = hex("504b0506" + "00".repeat(18));
const zipWithComment = Buffer.concat([emptyZip.subarray(0, 20), hex("0300"), utf8("abc")]);
const tar = Buffer.alloc(1024);
tar.write("tree.txt", 0, "latin1");
tar.write("ustar", 257, "latin1");
tar.write("text", 512, "latin1");

export const bad: [name: string, rule: string, files: Files][] = [
  ["a .ged file", "gedcom-name", { "docs/tree.ged": utf8("nothing") }],
  ["a .GED file", "gedcom-name", { "docs/TREE.GED": utf8("nothing") }],
  ["a .gedcom file", "gedcom-name", { "docs/tree.gedcom": utf8("nothing") }],
  ["a .gdz file", "gedcom-name", { "docs/tree.gdz": utf8("nothing") }],

  ["GEDCOM in .txt", "gedcom-content", { "notes.txt": utf8(tree) }],
  ["GEDCOM without extension", "gedcom-content", { notes: utf8(tree) }],
  ["GEDCOM with a UTF-8 BOM", "gedcom-content", { "a.txt": utf8(bom + tree) }],
  ["GEDCOM in UTF-16 LE", "gedcom-content", { "a.txt": utf16le(tree) }],
  ["GEDCOM in UTF-16 BE", "gedcom-content", { "a.txt": utf16be(tree) }],
  ["GEDCOM in UTF-16 LE with a BOM", "gedcom-content", { "a.txt": utf16le(bom + tree) }],
  ["GEDCOM in UTF-16 BE with a BOM", "gedcom-content", { "a.txt": utf16be(bom + tree) }],
  ["GEDCOM with CRLF", "gedcom-content", { "a.txt": utf8(lines(gedcom, "\r\n")) }],
  ["GEDCOM with CR alone", "gedcom-content", { "a.txt": utf8(lines(gedcom, "\r")) }],
  ["GEDCOM in lower case", "gedcom-content", { "a.txt": utf8(tree.toLowerCase()) }],
  ["GEDCOM inside Markdown", "gedcom-content", { "a.md": utf8(`# A tree\n\n${tree}`) }],
  ["GEDCOM quoted in Markdown", "gedcom-content", { "a.md": utf8(`> ${lines(gedcom, "\n> ")}`) }],
  ["GEDCOM in a source string", "gedcom-content", { "a.ts": utf8(lines(gedcom, "\\n")) }],
  ["GEDCOM in a JSON string", "gedcom-content", { "a.json": utf8(lines(gedcom, "\\r\\n")) }],
  ["GEDCOM after code on its line", "gedcom-content", { "a.ts": utf8("const a = `" + tree) }],
  ["a GEDCOM header alone", "gedcom-content", { "a.txt": utf8(lines(header)) }],
  ["a GEDCOM person without a header", "gedcom-content", { "a.txt": utf8(lines(person)) }],
  ["a GEDCOM family without a header", "gedcom-content", { "a.txt": utf8(lines(union)) }],
  ["GEDCOM without a last line end", "gedcom-content", { "a.txt": utf8("0 @I1@ " + "INDI") }],

  ["a backup", "backup-marker", { "data.json": utf8(backup) }],
  ["a backup without extension", "backup-marker", { data: utf8(backup) }],
  ["a backup with a BOM", "backup-marker", { "data.json": utf8(bom + backup) }],
  ["a backup in UTF-16 LE", "backup-marker", { "data.json": utf16le(bom + backup) }],
  ["a backup in UTF-16 BE", "backup-marker", { "data.json": utf16be(bom + backup) }],
  ["a backup inside text", "backup-marker", { "notes.txt": utf8(`Copy: ${backup}`) }],
  ["a backup in a string", "backup-marker", { "log.json": utf8(JSON.stringify(backup)) }],
  ["a backup inside examples", "backup-marker", { "examples/family.json": utf8(backup) }],

  ["a SQLite database", "sqlite-content", { "family.dat": sqlite }],
  ["a SQLite database named .png", "sqlite-content", { "web/icon.png": sqlite }],
  ["a SQLite database after text", "sqlite-content", { a: Buffer.concat([utf8("text"), sqlite]) }],
  ["a SQLite write-ahead log", "sqlite-content", { "a-wal": padded(hex("377f0682")) }],
  ["a big-endian write-ahead log", "sqlite-content", { "a-wal": padded(hex("377f0683")) }],
  ["a SQLite rollback journal", "sqlite-content", { journal: padded(hex("d9d505f920a163d7")) }],

  ["a zip", "archive-content", { "tree.zip": padded(hex("504b0304")) }],
  ["a zip named .docx", "archive-content", { "tree.docx": padded(hex("504b0304")) }],
  ["an empty zip", "archive-content", { tree: emptyZip }],
  ["a spanned zip", "archive-content", { tree: padded(hex("504b0708")) }],
  ["a zip after text", "archive-content", { a: Buffer.concat([utf8("text"), emptyZip]) }],
  ["the same with a comment", "archive-content", { a: Buffer.concat([utf8("a"), zipWithComment]) }],
  ["a gzip", "archive-content", { tree: padded(hex("1f8b08")) }],
  ["a bzip2", "archive-content", { tree: padded(hex("425a68")) }],
  ["an xz", "archive-content", { tree: padded(hex("fd377a585a00")) }],
  ["a zstd", "archive-content", { tree: padded(hex("28b52ffd")) }],
  ["a 7z", "archive-content", { tree: padded(hex("377abcaf271c")) }],
  ["a rar", "archive-content", { tree: padded(hex("526172211a07")) }],
  ["a tar", "archive-content", { tree: tar }],

  ["an unlisted example", "unlisted-example", { "examples/more.json": utf8("{}") }],
  ["an unlisted example in a subfolder", "unlisted-example", { "examples/a/b.txt": utf8("text") }],
  ["an unlisted example in another case", "unlisted-example", { "Examples/b.txt": utf8("text") }],
];

export const good: [name: string, files: Files][] = [
  ["code", { "src/a.ts": utf8('export const tag = "HEAD";\n') }],
  ["a listed example", { "examples/family.json": utf8('{"people":[]}') }],
  ["an empty file", { ".gitkeep": utf8("") }],
  ["an image", { "web/icon.png": padded(hex("89504e470d0a1a0a")) }],
  ["prose about GEDCOM", { "a.md": utf8("A file starts with `0 HEAD` and has `1 GEDC`.\n") }],
  ["a header line alone", { "a.txt": utf8(lines([[0, "HEAD"]])) }],
  ["other numbers before the tags", { "a.txt": utf8("10 " + "HEAD\n11 " + "GEDC\n") }],
  ["prose about the marker", { "a.md": utf8(`The marker is ${marker}.\n`) }],
  ["prose about SQLite", { "a.md": utf8("It starts with SQLite format 3 and a zero byte.\n") }],
  ["a path with spaces and other letters", { "докі/мой файл.md": utf8("text\n") }],
];

export const contents = { gedcom: utf8(tree), clean: utf8("clean\n") };
