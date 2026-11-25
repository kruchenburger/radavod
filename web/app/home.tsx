import { SegmentedControl, Text, Title, useMantineColorScheme } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useId } from "react";
import { locales } from "../i18n/t";
import { brace } from "./brace";
import { healthQuery } from "./health";
import classes from "./home.module.css";
import { useLanguage } from "./language";

const themes = ["light", "dark"] as const;

export function Home() {
  const { t, locale, setLocale } = useLanguage();
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  return (
    <main className={classes.page}>
      <div className={classes.left}>
        <Blank />
      </div>
      <div className={classes.right}>
        <Title className={classes.name}>{t("app.name")}</Title>
        <Text className={classes.about}>{t("app.about")}</Text>
        <div className={classes.settings}>
          <Choice
            label={t("settings.language")}
            value={locale}
            onChange={setLocale}
            data={locales.map((value) => ({
              value,
              label: <span lang={value}>{t(`language.${value}`)}</span>,
            }))}
          />
          <Choice
            label={t("settings.theme")}
            value={colorScheme === "dark" ? "dark" : "light"}
            onChange={setColorScheme}
            data={themes.map((value) => ({ value, label: t(`theme.${value}`) }))}
          />
        </div>
        <Server />
      </div>
    </main>
  );
}

function Server() {
  const { t } = useLanguage();
  const { data, isError } = useQuery(healthQuery);
  const isDown = data?.status === "error";
  const version = data && t("health.version", { version: data.version });

  const isBroken = data === null;

  let state = version ?? t("health.checking");
  if (isDown) state = t("health.degraded");
  if (isBroken) state = t("health.broken");
  if (isError) state = t("health.unreachable");
  return (
    <footer className={classes.server}>
      <Text role="status" mod={{ problem: isError || isBroken || isDown }}>
        {state}
      </Text>
      {isDown && !isError && <Text>{version}</Text>}
    </footer>
  );
}

type ChoiceProps<Value extends string> = {
  label: string;
  value: Value;
  onChange: (value: Value) => void;
  data: { value: Value; label: ReactNode }[];
};

function Choice<Value extends string>({ label, ...control }: ChoiceProps<Value>) {
  const id = useId();
  return (
    <div>
      <Text id={id} className={classes.label}>
        {label}
      </Text>
      <SegmentedControl
        {...control}
        aria-labelledby={id}
        size="md"
        withItemsBorders={false}
        transitionDuration={0}
        classNames={{
          root: classes.choice,
          label: classes.option,
          indicator: classes.chosen,
        }}
      />
    </div>
  );
}

/** A family nobody has written down yet: blank lines for the names, braces, the direct line. */
function Blank() {
  return (
    <svg className={classes.blank} viewBox="0 0 520 600" aria-hidden="true">
      {generations.map(({ x, width, first, step, count }) =>
        Array.from({ length: count }, (_, i) => (
          <path key={`${x} ${i}`} d={`M${x} ${first + i * step}h${width}`} />
        )),
      )}
      {generations.slice(0, -1).map(({ x, width, first, step, count }) =>
        Array.from({ length: count / 2 }, (_, i) => {
          const top = first + i * 2 * step;
          const end = x + width + 4;
          return (
            <path
              key={`${x} ${i}`}
              d={brace(
                { x: end, y: top },
                { x: end, y: top + step },
                { x: end + 36, y: top + step / 2 },
              )}
            />
          );
        }),
      )}
      <path
        className={classes.direct}
        d={brace({ x: 426, y: 158 }, { x: 426, y: 442 }, { x: 488, y: 300 })}
      />
    </svg>
  );
}

const generations = [
  { x: 0, width: 116, first: 51.5, step: 71, count: 8 },
  { x: 160, width: 108, first: 87, step: 142, count: 4 },
  { x: 312, width: 108, first: 158, step: 284, count: 2 },
];
