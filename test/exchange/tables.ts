import fc from "fast-check";

/** Cells as relatives fill them: mostly right, often empty, sometimes anything. */
const anything = fc.string({ maxLength: 12 });
const someOf = (...cells: string[]) =>
  fc.oneof({ weight: 6, arbitrary: fc.constantFrom(...cells) }, { weight: 1, arbitrary: anything });

const rowCount = 14;
const rowNumber = fc.integer({ min: 0, max: rowCount + 2 }).map(String);

const row = fc.tuple(
  someOf("", "0", "1", "2", "3"),
  someOf("", "Лазовік", "Лазовік \\ Мароз", "Дубіцкая/Грыц", "А \\"),
  someOf("", "Ала", "Ян", "Анатоль"),
  someOf("", "Пятровіч", "Пятроўна", "Янавіч"),
  someOf("", "м", "ж"),
  someOf("", "1", "29", "31"),
  someOf("", "Январь", "Февраль", "Янврь", "2"),
  someOf("", "1900", "1901", "190"),
  someOf("", "Жив", "Жива", "?", "2/29/1900", "2/29/1904", "13/1/1950", "1943"),
  someOf("", "Получена", "о"),
  someOf("", "Прим. Л.А.П.", "Прим. Л.Я.", "Прим. Д.Я.П.", "Прим."),
  someOf("", "заметка, с запятой"),
  someOf("", "https://example.org/a", "https://example.org/b"),
  fc.oneof(fc.constant(""), rowNumber, anything),
  fc.oneof(fc.constant(""), rowNumber, anything),
);

/** A table as a spreadsheet writes it. */
export const csv = fc
  .array(row, { minLength: 1, maxLength: rowCount })
  .map((rows) =>
    rows
      .map((cells) =>
        cells
          .map((cell) => (/[",\r\n]/u.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell))
          .join(","),
      )
      .join("\r\n"),
  );
