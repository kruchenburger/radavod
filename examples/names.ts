import type { FamilyEvent, PlaceName, SourceKind, Text } from "./family.ts";

/** Every invented word of the example family. Given names are common, surnames and places are made up. */

/** The community a family belonged to. It decides in which languages its names were written. */
export type Tradition = "orthodox" | "catholic" | "lithuanian" | "jewish";

type Pair = [male: string, female: string];

export type Given = {
  ru: string;
  be: string;
  pl?: string;
  lt?: string;
  la?: string;
  yi?: string;
  en: string;
};

export type MaleGiven = Given & { patronymic: { ru: Pair; be: Pair } };

export type Surname = {
  tradition: Tradition;
  ru: Pair;
  be: Pair;
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
    be: "Лейба",
    yi: "לייב",
    en: "Leib",
    patronymic: { ru: ["Лейбович", "Лейбовна"], be: ["Лейбавіч", "Лейбаўна"] },
  },
  {
    ru: "Мовша",
    be: "Моўша",
    yi: "משה",
    en: "Moyshe",
    patronymic: { ru: ["Мовшевич", "Мовшевна"], be: ["Моўшавіч", "Моўшаўна"] },
  },
  {
    ru: "Хаим",
    be: "Хаім",
    yi: "חיים",
    en: "Chaim",
    patronymic: { ru: ["Хаимович", "Хаимовна"], be: ["Хаімавіч", "Хаімаўна"] },
  },
  {
    ru: "Арон",
    be: "Арон",
    yi: "אהרן",
    en: "Aron",
    patronymic: { ru: ["Аронович", "Ароновна"], be: ["Аронавіч", "Аронаўна"] },
  },
  {
    ru: "Зелик",
    be: "Зелік",
    yi: "זעליג",
    en: "Zelig",
    patronymic: { ru: ["Зеликович", "Зеликовна"], be: ["Зелікавіч", "Зелікаўна"] },
  },
  {
    ru: "Берка",
    be: "Берка",
    yi: "בער",
    en: "Ber",
    patronymic: { ru: ["Беркович", "Берковна"], be: ["Беркавіч", "Беркаўна"] },
  },
  {
    ru: "Гирш",
    be: "Гірш",
    yi: "הירש",
    en: "Hirsh",
    patronymic: { ru: ["Гиршевич", "Гиршевна"], be: ["Гіршавіч", "Гіршаўна"] },
  },
  {
    ru: "Янкель",
    be: "Янкель",
    yi: "יאַנקל",
    en: "Yankl",
    patronymic: { ru: ["Янкелевич", "Янкелевна"], be: ["Янкелевіч", "Янкелеўна"] },
  },
];

const jewishWomen: Given[] = [
  { ru: "Фейга", be: "Фейга", yi: "פֿייגע", en: "Feige" },
  { ru: "Рива", be: "Рыва", yi: "ריווע", en: "Rive" },
  { ru: "Хася", be: "Хася", yi: "כאַסיע", en: "Khasye" },
  { ru: "Двойра", be: "Двойра", yi: "דבֿורה", en: "Dvoyre" },
  { ru: "Гинда", be: "Гінда", yi: "הינדע", en: "Hinde" },
  { ru: "Малка", be: "Малка", yi: "מלכּה", en: "Malke" },
  { ru: "Хая", be: "Хая", yi: "חיה", en: "Chaye" },
  { ru: "Соня", be: "Соня", yi: "סאָניע", en: "Sonye" },
];

export function givenNames(tradition: Tradition): { male: MaleGiven[]; female: Given[] } {
  return tradition === "jewish"
    ? { male: jewishMen, female: jewishWomen }
    : { male: christianMen, female: christianWomen };
}

/** A surname that is the same for men and women. */
const surname = (
  tradition: Tradition,
  ru: string,
  be: string,
  pl: string,
  en: string,
): Surname => ({
  tradition,
  ru: [ru, ru],
  be: [be, be],
  pl: [pl, pl],
  en: [en, en],
});

/** The ten branches, in the order of the founders. */
export const branches: { name: Text; surname: Surname }[] = [
  {
    name: { ru: "Ольховичи", en: "The Olkhovich family" },
    surname: surname("orthodox", "Ольхович", "Альховіч", "Olchowicz", "Olkhovich"),
  },
  {
    name: { ru: "Вересени", en: "The Veresen family" },
    surname: surname("catholic", "Вересень", "Верасень", "Wieresień", "Veresen"),
  },
  {
    name: { ru: "Журавики", en: "The Zhuravik family" },
    surname: surname("orthodox", "Журавик", "Журавік", "Żurawik", "Zhuravik"),
  },
  {
    name: { ru: "Калинники", en: "The Kalinnik family" },
    surname: surname("orthodox", "Калинник", "Каліннік", "Kalinnik", "Kalinnik"),
  },
  {
    name: { ru: "Лозовени", en: "The Lozoven family" },
    surname: surname("catholic", "Лозовень", "Лазавень", "Łozowień", "Lozoven"),
  },
  {
    name: { ru: "Мятлики", en: "The Myatlik family" },
    surname: surname("orthodox", "Мятлик", "Мятлік", "Miatlik", "Myatlik"),
  },
  {
    name: { ru: "Лаздутисы", en: "The Lazdutis family" },
    surname: {
      ...surname("lithuanian", "Лаздутис", "Лаздуціс", "Łazdutis", "Lazdutis"),
      lt: { male: "Lazdutis", maiden: "Lazdutytė", married: "Lazdutienė" },
    },
  },
  {
    name: { ru: "Сосенники", en: "The Sosennik family" },
    surname: surname("orthodox", "Сосенник", "Сасеннік", "Sosiennik", "Sosennik"),
  },
  {
    name: { ru: "Осочники", en: "The Osochnik family" },
    surname: surname("catholic", "Осочник", "Асочнік", "Osocznik", "Osochnik"),
  },
  {
    name: { ru: "Вайсройзы", en: "The Vaysroyz family" },
    surname: {
      tradition: "jewish",
      ru: ["Вайсройз", "Вайсройз"],
      be: ["Вайсройз", "Вайсройз"],
      yi: "ווײַסרויז",
      en: ["Vaysroyz", "Vaysroyz"],
    },
  },
];

/** Families that married into the branches. */
export const otherSurnames: Surname[] = [
  surname("orthodox", "Пеструн", "Пяструн", "Piestrun", "Pestrun"),
  surname("orthodox", "Крынич", "Крыніч", "Krynicz", "Krynich"),
  surname("orthodox", "Чаборень", "Чабарэнь", "Czaboreń", "Chaboren"),
  surname("orthodox", "Туманик", "Туманік", "Tumanik", "Tumanik"),
  surname("orthodox", "Бережник", "Беражнік", "Bereżnik", "Berezhnik"),
  surname("orthodox", "Рябинник", "Рабіннік", "Rabinnik", "Ryabinnik"),
  {
    tradition: "orthodox",
    ru: ["Быльников", "Быльникова"],
    be: ["Быльнікаў", "Быльнікава"],
    pl: ["Bylnikow", "Bylnikowa"],
    en: ["Bylnikov", "Bylnikova"],
  },
  surname("catholic", "Лугвень", "Лугвень", "Łuhwień", "Lugven"),
  surname("catholic", "Полынич", "Палыніч", "Połynicz", "Polynich"),
  surname("catholic", "Снежень", "Снежань", "Śnieżeń", "Snezhen"),
  surname("catholic", "Яворик", "Яворык", "Jaworik", "Yavorik"),
  {
    tradition: "catholic",
    ru: ["Мховский", "Мховская"],
    be: ["Імхоўскі", "Імхоўская"],
    pl: ["Mchowski", "Mchowska"],
    en: ["Mkhovsky", "Mkhovskaya"],
  },
  {
    ...surname("lithuanian", "Клевутис", "Клявуціс", "Klewutis", "Klevutis"),
    lt: { male: "Klevutis", maiden: "Klevutytė", married: "Klevutienė" },
  },
  {
    tradition: "jewish",
    ru: ["Шнееблат", "Шнееблат"],
    be: ["Шнэеблат", "Шнэеблат"],
    yi: "שנייבלאַט",
    en: ["Shneyblat", "Shneyblat"],
  },
];

export const nicknames = ["Бортник", "Дударь", "Молчун", "Рыжий", "Сапожок", "Верба"];

const empire = (governorate: string, en: string): Text => ({
  ru: `Российская империя, ${governorate} губерния`,
  en: `Russian Empire, ${en} Governorate`,
});
const poland: Text = { ru: "Польская Республика", en: "Republic of Poland" };
const bssr: Text = { ru: "БССР", en: "Byelorussian SSR" };
const belarus: Text = { ru: "Республика Беларусь", en: "Republic of Belarus" };

type Affiliation = { name: Text; from: number; to: number | null };

const east = (governorate: string, en: string): Affiliation[] => [
  { name: empire(governorate, en), from: 1793, to: 1917 },
  { name: bssr, from: 1919, to: 1991 },
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
  from: number;
  to: number;
  /** The only event it tells about. */
  about?: FamilyEvent["kind"];
  /** The only communities it tells about. */
  of?: Tradition[];
}[] = [
  {
    kind: "register",
    from: 1835,
    to: 1917,
    of: ["orthodox"],
    title: "Метрическая книга Заольховичской церкви",
  },
  {
    kind: "register",
    from: 1810,
    to: 1939,
    of: ["catholic", "lithuanian"],
    title: "Księga metrykalna parafii Osocze Kościelne",
  },
  {
    kind: "register",
    from: 1800,
    to: 1840,
    of: ["catholic", "lithuanian"],
    title: "Liber metricalis ecclesiae Tumanoviensis",
  },
  {
    kind: "register",
    from: 1853,
    to: 1915,
    of: ["jewish"],
    title: "Метрическая книга Крынычинского раввината",
  },
  {
    kind: "census",
    from: 1800,
    to: 1858,
    title: "Ревизская сказка деревни Панская Калинница",
  },
  {
    kind: "census",
    from: 1870,
    to: 1912,
    title: "Посемейный список Тумановской волости",
  },
  { kind: "register", title: "Книга записей актов, Тумановск", from: 1919, to: 1995 },
  { kind: "document", title: "Похозяйственная книга, Мятликов Брод", from: 1935, to: 1980 },
  {
    kind: "document",
    from: 1885,
    to: 1938,
    about: "emigration",
    title: "Passenger list of the steamship Alder Queen",
  },
  { kind: "photo", title: "Подпись на обороте свадебной фотографии", from: 1890, to: 1975 },
  { kind: "document", title: "Надгробия на кладбище в Сосенной Выселке", from: 1860, to: 2015 },
  { kind: "story", title: "Рассказ тёти, записан на кухне", from: 1880, to: 2020 },
  { kind: "story", title: "Тетрадь дедушки с родословной", from: 1800, to: 1960 },
  { kind: "document", title: "Семейные паспорта и свидетельства", from: 1925, to: 2025 },
];

/** Dates as sources put them that name no year. */
export const unparsedDates = [
  "в год большой воды, перед жатвой",
  "той зимой, когда сгорела мельница",
  "як бусел прыляцеў",
];
