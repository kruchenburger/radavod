export const A = ({ t }: { t: (k: string, p: object) => string }) => (
  <p>{t("person.born", { name: "x" })}</p>
);
