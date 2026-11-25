import type { FamilyEvent, PlaceName, SourceKind, Text } from "./family.ts";

/** Every invented word of the example family. Given names are common; surnames and places are made up. */

/** The community a family belonged to. It decides in which languages its names were written. */
export type Tradition = "orthodox" | "catholic" | "lithuanian" | "jewish";

type Pair = [male: string, female: string];

export type Given = {
  ru: string;
  be?: string;
  pl?: string;
  lt?: string;
  la?: string;
  yi?: string;
  en: string;
};

export type MaleGiven = Given & { patronymic: { ru: Pair; be?: Pair } };

export type Surname = {
  tradition: Tradition;
  ru: Pair;
  be?: Pair;
  pl?: Pair;
  lt?: { male: string; maiden: string; married: string };
  yi?: string;
  en: Pair;
};

const male = (
  [ru, be, pl, lt, la, en]: [string, string, string, string, string, string],
  ruPatronymic: Pair,
  bePatronymic: Pair,
): MaleGiven => ({ ru, be, pl, lt, la, en, patronymic: { ru: ruPatronymic, be: bePatronymic } });

const female = (ru: string, be: string, pl: string, lt: string, la: string, en: string): Given => ({
  ru,
  be,
  pl,
  lt,
  la,
  en,
});

const christianMen: MaleGiven[] = [
  male(
    ["Адам", "Адам", "Adam", "Adomas", "Adamus", "Adam"],
    ["Адамович", "Адамовна"],
    ["Адамавіч", "Адамаўна"],
  ),
  male(
    ["Василий", "Васіль", "Bazyli", "Bazilijus", "Basilius", "Basil"],
    ["Васильевич", "Васильевна"],
    ["Васілевіч", "Васілеўна"],
  ),
  male(
    ["Викентий", "Вінцэнт", "Wincenty", "Vincentas", "Vincentius", "Vincent"],
    ["Викентьевич", "Викентьевна"],
    ["Вінцэнтавіч", "Вінцэнтаўна"],
  ),
  male(
    ["Григорий", "Рыгор", "Grzegorz", "Grigalius", "Gregorius", "Gregory"],
    ["Григорьевич", "Григорьевна"],
    ["Рыгоравіч", "Рыгораўна"],
  ),
  male(
    ["Демьян", "Дзям’ян", "Damian", "Damijonas", "Damianus", "Damian"],
    ["Демьянович", "Демьяновна"],
    ["Дзям’янавіч", "Дзям’янаўна"],
  ),
  male(
    ["Захар", "Захар", "Zachariasz", "Zacharijas", "Zacharias", "Zachary"],
    ["Захарович", "Захаровна"],
    ["Захаравіч", "Захараўна"],
  ),
  male(
    ["Иосиф", "Юзаф", "Józef", "Juozapas", "Josephus", "Joseph"],
    ["Иосифович", "Иосифовна"],
    ["Юзафавіч", "Юзафаўна"],
  ),
  male(
    ["Казимир", "Казімір", "Kazimierz", "Kazimieras", "Casimirus", "Casimir"],
    ["Казимирович", "Казимировна"],
    ["Казіміравіч", "Казіміраўна"],
  ),
  male(
    ["Кирилл", "Кірыла", "Cyryl", "Kirilas", "Cyrillus", "Cyril"],
    ["Кириллович", "Кирилловна"],
    ["Кірылавіч", "Кірылаўна"],
  ),
  male(
    ["Лука", "Лукаш", "Łukasz", "Lukas", "Lucas", "Luke"],
    ["Лукич", "Лукинична"],
    ["Лукашавіч", "Лукашаўна"],
  ),
  male(
    ["Макар", "Макар", "Makary", "Makarijus", "Macarius", "Makar"],
    ["Макарович", "Макаровна"],
    ["Макаравіч", "Макараўна"],
  ),
  male(
    ["Матвей", "Мацвей", "Mateusz", "Matas", "Matthaeus", "Matthew"],
    ["Матвеевич", "Матвеевна"],
    ["Мацвеевіч", "Мацвееўна"],
  ),
  male(
    ["Никодим", "Нікадзім", "Nikodem", "Nikodemas", "Nicodemus", "Nicodemus"],
    ["Никодимович", "Никодимовна"],
    ["Нікадзімавіч", "Нікадзімаўна"],
  ),
  male(
    ["Павел", "Павел", "Paweł", "Paulius", "Paulus", "Paul"],
    ["Павлович", "Павловна"],
    ["Паўлавіч", "Паўлаўна"],
  ),
  male(
    ["Роман", "Раман", "Roman", "Romanas", "Romanus", "Roman"],
    ["Романович", "Романовна"],
    ["Раманавіч", "Раманаўна"],
  ),
  male(
    ["Степан", "Сцяпан", "Stefan", "Steponas", "Stephanus", "Stephen"],
    ["Степанович", "Степановна"],
    ["Сцяпанавіч", "Сцяпанаўна"],
  ),
  male(
    ["Тарас", "Тарас", "Tarazjusz", "Tarasas", "Tarasius", "Taras"],
    ["Тарасович", "Тарасовна"],
    ["Тарасавіч", "Тарасаўна"],
  ),
  male(
    ["Фёдор", "Фёдар", "Teodor", "Teodoras", "Theodorus", "Theodore"],
    ["Фёдорович", "Фёдоровна"],
    ["Фёдаравіч", "Фёдараўна"],
  ),
  male(
    ["Юрий", "Юрый", "Jerzy", "Jurgis", "Georgius", "George"],
    ["Юрьевич", "Юрьевна"],
    ["Юр’евіч", "Юр’еўна"],
  ),
  male(
    ["Иван", "Ян", "Jan", "Jonas", "Joannes", "John"],
    ["Иванович", "Ивановна"],
    ["Янавіч", "Янаўна"],
  ),
];

const christianWomen: Given[] = [
  female("Агафья", "Агата", "Agata", "Agota", "Agatha", "Agatha"),
  female("Варвара", "Варвара", "Barbara", "Barbora", "Barbara", "Barbara"),
  female("Анна", "Ганна", "Anna", "Ona", "Anna", "Anna"),
  female("Дарья", "Дар’я", "Daria", "Darija", "Daria", "Daria"),
  female("Ева", "Ева", "Ewa", "Ieva", "Eva", "Eve"),
  female("София", "Зофія", "Zofia", "Sofija", "Sophia", "Sophia"),
  female("Ирина", "Ірына", "Irena", "Irena", "Irene", "Irene"),
  female("Екатерина", "Кацярына", "Katarzyna", "Kotryna", "Catharina", "Catherine"),
  female("Лидия", "Лідзія", "Lidia", "Lidija", "Lydia", "Lydia"),
  female("Мария", "Марыя", "Maria", "Marija", "Maria", "Mary"),
  female("Анастасия", "Настасся", "Anastazja", "Anastazija", "Anastasia", "Anastasia"),
  female("Ольга", "Вольга", "Olga", "Olga", "Olga", "Olga"),
  female("Аполлония", "Апалонія", "Apolonia", "Apolonija", "Apollonia", "Apollonia"),
  female("Регина", "Рэгіна", "Regina", "Regina", "Regina", "Regina"),
  female("Тереза", "Тэрэза", "Teresa", "Teresė", "Theresia", "Theresa"),
  female("Ульяна", "Уляна", "Julianna", "Julijona", "Juliana", "Juliana"),
  female("Федосья", "Хвядосся", "Teodozja", "Teodosija", "Theodosia", "Theodosia"),
  female("Христина", "Хрысціна", "Krystyna", "Kristina", "Christina", "Christina"),
  female("Янина", "Яніна", "Janina", "Janina", "Joanna", "Janina"),
  female("Пелагея", "Палагея", "Pelagia", "Pelagija", "Pelagia", "Pelagia"),
];

const jewishMen: MaleGiven[] = [
  {
    ru: "Лейба",
    yi: "לייב",
    en: "Leib",
    patronymic: { ru: ["Лейбович", "Лейбовна"] },
  },
  {
    ru: "Мовша",
    yi: "משה",
    en: "Moyshe",
    patronymic: { ru: ["Мовшевич", "Мовшевна"] },
  },
  {
    ru: "Хаим",
    yi: "חיים",
    en: "Chaim",
    patronymic: { ru: ["Хаимович", "Хаимовна"] },
  },
  {
    ru: "Арон",
    yi: "אהרן",
    en: "Aron",
    patronymic: { ru: ["Аронович", "Ароновна"] },
  },
  {
    ru: "Зелик",
    yi: "זעליג",
    en: "Zelig",
    patronymic: { ru: ["Зеликович", "Зеликовна"] },
  },
  {
    ru: "Берка",
    yi: "בער",
    en: "Ber",
    patronymic: { ru: ["Беркович", "Берковна"] },
  },
  {
    ru: "Гирш",
    yi: "הירש",
    en: "Hirsh",
    patronymic: { ru: ["Гиршевич", "Гиршевна"] },
  },
  {
    ru: "Янкель",
    yi: "יאַנקל",
    en: "Yankl",
    patronymic: { ru: ["Янкелевич", "Янкелевна"] },
  },
];

const jewishWomen: Given[] = [
  { ru: "Фейга", yi: "פֿייגע", en: "Feige" },
  { ru: "Рива", yi: "ריווע", en: "Rive" },
  { ru: "Хася", yi: "כאַסיע", en: "Khasye" },
  { ru: "Двойра", yi: "דבֿורה", en: "Dvoyre" },
  { ru: "Гинда", yi: "הינדע", en: "Hinde" },
  { ru: "Малка", yi: "מלכּה", en: "Malke" },
  { ru: "Хая", yi: "חיה", en: "Chaye" },
  { ru: "Соня", yi: "סאָניע", en: "Sonye" },
];

export function givenNames(tradition: Tradition): { male: MaleGiven[]; female: Given[] } {
  return tradition === "jewish"
    ? { male: jewishMen, female: jewishWomen }
    : { male: christianMen, female: christianWomen };
}

/** A surname that is the same for men and women. Polish books wrote the Catholic ones. */
const surname = (
  tradition: Tradition,
  ru: string,
  be: string,
  en: string,
  pl?: string,
): Surname => ({
  tradition,
  ru: [ru, ru],
  be: [be, be],
  en: [en, en],
  ...(pl === undefined ? {} : { pl: [pl, pl] }),
});

/** The ten branches, in the order of the founders. */
export const branches: { name: Text; surname: Surname }[] = [
  {
    name: { ru: "Ольхуничи", en: "The Olkhunich family" },
    surname: surname("orthodox", "Ольхунич", "Альхуніч", "Olkhunich"),
  },
  {
    name: { ru: "Вересуничи", en: "The Veresunich family" },
    surname: surname("catholic", "Вересунич", "Верасуніч", "Veresunich", "Wieresunicz"),
  },
  {
    name: { ru: "Журавени", en: "The Zhuraven family" },
    surname: surname("orthodox", "Журавень", "Журавень", "Zhuraven"),
  },
  {
    name: { ru: "Калинени", en: "The Kalinen family" },
    surname: surname("orthodox", "Калинень", "Калінень", "Kalinen"),
  },
  {
    name: { ru: "Лозовени", en: "The Lozoven family" },
    surname: surname("catholic", "Лозовень", "Лазавень", "Lozoven", "Łozowień"),
  },
  {
    name: { ru: "Мятлики", en: "The Myatlik family" },
    surname: surname("orthodox", "Мятлик", "Мятлік", "Myatlik"),
  },
  {
    name: { ru: "Лаздутисы", en: "The Lazdutis family" },
    surname: {
      ...surname("lithuanian", "Лаздутис", "Лаздуціс", "Lazdutis", "Łazdutis"),
      lt: { male: "Lazdutis", maiden: "Lazdutytė", married: "Lazdutienė" },
    },
  },
  {
    name: { ru: "Сосенники", en: "The Sosennik family" },
    surname: surname("orthodox", "Сосенник", "Сасеннік", "Sosennik"),
  },
  {
    name: { ru: "Осочники", en: "The Osochnik family" },
    surname: surname("catholic", "Осочник", "Асочнік", "Osochnik", "Osocznik"),
  },
  {
    name: { ru: "Вайсройзы", en: "The Vaysroyz family" },
    surname: {
      tradition: "jewish",
      ru: ["Вайсройз", "Вайсройз"],
      yi: "ווײַסרויז",
      en: ["Vaysroyz", "Vaysroyz"],
    },
  },
];

/** Families that married into the branches. */
export const otherSurnames: Surname[] = [
  surname("orthodox", "Пеструн", "Пяструн", "Pestrun"),
  surname("orthodox", "Крынунь", "Крынунь", "Krynun"),
  surname("orthodox", "Чаборень", "Чабарэнь", "Chaboren"),
  surname("orthodox", "Туманень", "Туманень", "Tumanen"),
  surname("orthodox", "Бережник", "Беражнік", "Berezhnik"),
  surname("orthodox", "Рябинник", "Рабіннік", "Ryabinnik"),
  {
    tradition: "orthodox",
    ru: ["Быльников", "Быльникова"],
    be: ["Быльнікаў", "Быльнікава"],
    en: ["Bylnikov", "Bylnikova"],
  },
  surname("catholic", "Лугавень", "Лугавень", "Lugaven", "Łuhawień"),
  surname("catholic", "Полынич", "Палыніч", "Polynich", "Połynicz"),
  surname("catholic", "Снежень", "Снежань", "Snezhen", "Śnieżeń"),
  surname("catholic", "Яворень", "Яварэнь", "Yavoren", "Jaworień"),
  {
    tradition: "catholic",
    ru: ["Мховский", "Мховская"],
    be: ["Імхоўскі", "Імхоўская"],
    pl: ["Mchowski", "Mchowska"],
    en: ["Mkhovsky", "Mkhovskaya"],
  },
  {
    ...surname("lithuanian", "Клевутис", "Клявуціс", "Klevutis", "Klewutis"),
    lt: { male: "Klevutis", maiden: "Klevutytė", married: "Klevutienė" },
  },
  {
    tradition: "jewish",
    ru: ["Шнееблат", "Шнееблат"],
    yi: "שנייבלאַט",
    en: ["Shneyblat", "Shneyblat"],
  },
];

export const nicknames = {
  male: ["Бортник", "Дударь", "Молчун", "Рыжий", "Сапожок"],
  female: ["Верба", "Певунья", "Тихоня", "Пчёлка"],
};

const beforeReform = new Map([
  ["Фёдор", "Ѳедоръ"],
  ["Матвей", "Матвѣй"],
  ["Снежень", "Снѣжень"],
]);

/** The spelling of a name before the reform of 1918. */
export function oldSpelling(name: string): string {
  return (
    beforeReform.get(name) ??
    name
      .replaceAll(/и(?=[аеёийоуыэюя])/g, "і")
      .replaceAll(/И(?=[аеёийоуыэюя])/g, "І")
      .replace(/(?<=[бвгджзклмнпрстфхцчшщ])$/, "ъ")
  );
}

const empire = (governorate: string, en: string): Text => ({
  ru: `Российская империя, ${governorate} губерния`,
  en: `Russian Empire, ${en} Governorate`,
});
const poland: Text = { ru: "Польская Республика", en: "Republic of Poland" };
const rsfsr: Text = { ru: "РСФСР", en: "Russian SFSR" };
const bssr: Text = { ru: "БССР", en: "Byelorussian SSR" };
const belarus: Text = { ru: "Республика Беларусь", en: "Republic of Belarus" };

type Affiliation = { name: Text; from: number; to: number | null };

const east = (governorate: string, en: string): Affiliation[] => [
  { name: empire(governorate, en), from: 1793, to: 1917 },
  // Vitebsk and most of Mogilev joined the Byelorussian SSR later than Minsk.
  ...(en === "Minsk"
    ? [{ name: bssr, from: 1919, to: 1991 }]
    : [
        { name: rsfsr, from: 1917, to: 1924 },
        { name: bssr, from: 1924, to: 1991 },
      ]),
  { name: belarus, from: 1991, to: null },
];
const west = (governorate: string, en: string): Affiliation[] => [
  { name: empire(governorate, en), from: 1795, to: 1917 },
  { name: poland, from: 1921, to: 1939 },
  { name: bssr, from: 1939, to: 1991 },
  { name: belarus, from: 1991, to: null },
];

type NewPlace = { names: PlaceName[]; affiliations: Affiliation[] };

const named = (
  language: PlaceName["language"],
  text: string,
  from: number | null = null,
  to: number | null = null,
): PlaceName => ({
  text,
  language,
  script: language === "yi" ? "Hebr" : language === "ru" || language === "be" ? "Cyrl" : "Latn",
  from,
  to,
});

/** The place at the index of a branch is its home. The rest are shared. */
export const places: NewPlace[] = [
  {
    names: [named("be", "Заальховічы"), named("ru", "Заольховичи")],
    affiliations: east("Минская", "Minsk"),
  },
  {
    names: [
      named("be", "Верасянёвая Града"),
      named("ru", "Вересенёва Гряда"),
      named("pl", "Wieresieniowa Grzęda", 1921, 1939),
    ],
    affiliations: west("Виленская", "Vilna"),
  },
  {
    names: [named("be", "Жураўлінец-Стары"), named("ru", "Журавлинец-Старый")],
    affiliations: east("Могилёвская", "Mogilev"),
  },
  {
    names: [
      named("ru", "Панская Калинница", null, 1924),
      named("ru", "Краснокалинница", 1924, 1993),
      named("be", "Каліннічна", 1993),
    ],
    affiliations: east("Минская", "Minsk"),
  },
  {
    names: [
      named("be", "Лазавеншчына"),
      named("ru", "Лозовенщина"),
      named("pl", "Łozowieńszczyzna", 1921, 1939),
    ],
    affiliations: west("Гродненская", "Grodno"),
  },
  {
    names: [named("be", "Мятлікаў Брод"), named("ru", "Мятликов Брод")],
    affiliations: east("Витебская", "Vitebsk"),
  },
  {
    names: [
      named("lt", "Lazdutupė"),
      named("be", "Лаздутупа"),
      named("ru", "Лаздутупа"),
      named("pl", "Łazdutupa", 1921, 1939),
    ],
    affiliations: west("Виленская", "Vilna"),
  },
  {
    names: [named("be", "Сасенная Выселка"), named("ru", "Сосенная Выселка")],
    affiliations: east("Могилёвская", "Mogilev"),
  },
  {
    names: [
      named("be", "Асочча-Касцельнае"),
      named("ru", "Осочье-Костёльное", null, 1948),
      named("ru", "Осочье", 1948),
      named("pl", "Osocze Kościelne", 1921, 1939),
    ],
    affiliations: west("Гродненская", "Grodno"),
  },
  {
    names: [
      named("ru", "местечко Крынычин", null, 1938),
      named("ru", "Крынычин", 1938),
      named("be", "Крынычын"),
      named("yi", "קריניטשין", null, 1941),
    ],
    affiliations: east("Минская", "Minsk"),
  },
  {
    names: [
      named("be", "Туманаўск"),
      named("ru", "Тумановск"),
      named("la", "Tumanovia", null, 1840),
    ],
    affiliations: east("Минская", "Minsk"),
  },
  {
    names: [named("en", "Port Alderwyck")],
    affiliations: [{ name: { ru: "Канада", en: "Canada" }, from: 1867, to: null }],
  },
];

/** Where the town and the port of emigrants stand in `places`. */
export const town = 10;
export const port = 11;

/** A source covers the years of the events it may be cited for. No archive, fund or file exists. */
export const sources: {
  kind: SourceKind;
  title: string;
  /** What its parts are called. */
  unit: string;
  from: number;
  to: number;
  /** The only event it tells about. */
  about?: FamilyEvent["kind"];
  /** Kept in the country, so it knows nothing of those who left. */
  local?: true;
  /** The only communities it tells about. */
  of?: Tradition[];
}[] = [
  {
    kind: "register",
    from: 1835,
    to: 1917,
    of: ["orthodox"],
    title: "Метрическая книга Заольховичской церкви",
    local: true,
    unit: "запись",
  },
  {
    kind: "register",
    from: 1810,
    to: 1939,
    of: ["catholic", "lithuanian"],
    title: "Księga metrykalna parafii Osocze Kościelne",
    local: true,
    unit: "akt",
  },
  {
    kind: "register",
    from: 1800,
    to: 1840,
    of: ["catholic", "lithuanian"],
    title: "Liber metricalis ecclesiae Tumanoviensis",
    local: true,
    unit: "folium",
  },
  {
    kind: "register",
    from: 1853,
    to: 1915,
    of: ["jewish"],
    title: "Метрическая книга Крынычинского раввината",
    local: true,
    unit: "запись",
  },
  {
    kind: "census",
    from: 1800,
    to: 1858,
    title: "Ревизская сказка деревни Панская Калинница",
    local: true,
    unit: "двор",
  },
  {
    kind: "census",
    from: 1870,
    to: 1912,
    title: "Посемейный список Тумановской волости",
    local: true,
    unit: "двор",
  },
  {
    kind: "register",
    title: "Книга записей актов, Тумановск",
    local: true,
    unit: "запись",
    from: 1919,
    to: 1995,
  },
  {
    kind: "document",
    title: "Похозяйственная книга, Мятликов Брод",
    local: true,
    unit: "страница",
    from: 1935,
    to: 1980,
  },
  {
    kind: "document",
    from: 1885,
    to: 1938,
    about: "emigration",
    title: "Passenger list of the steamship Alder Queen",
    unit: "line",
  },
  {
    kind: "photo",
    title: "Подпись на обороте свадебной фотографии",
    unit: "снимок",
    from: 1890,
    to: 1975,
  },
  {
    kind: "document",
    title: "Надгробия на кладбище в Сосенной Выселке",
    local: true,
    unit: "ряд",
    from: 1860,
    to: 2015,
  },
  { kind: "story", title: "Рассказ тёти, записан на кухне", unit: "минута", from: 1880, to: 2020 },
  { kind: "story", title: "Тетрадь дедушки с родословной", unit: "лист", from: 1800, to: 1960 },
  {
    kind: "document",
    title: "Семейные паспорта и свидетельства",
    unit: "документ",
    from: 1925,
    to: 2025,
  },
];

/** Dates as sources put them that name no year. */
export const unparsedDates = [
  "в год большой воды, перед жатвой",
  "той зимой, когда сгорела мельница",
  "як бусел прыляцеў",
];
