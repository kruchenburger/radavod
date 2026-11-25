import { SegmentedControl, Text, Title, useMantineColorScheme } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useId } from "react";
import { locales } from "../i18n/t";
import { healthQuery } from "./health";
import classes from "./home.module.css";
import { useLanguage } from "./language";

const themes = ["light", "dark"] as const;

export function Home() {
  const { t, locale, setLocale } = useLanguage();
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  return (
    <main className={classes.page}>
      <Lineage />
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
    </main>
  );
}

function Server() {
  const { t } = useLanguage();
  const { data, isError } = useQuery(healthQuery);
  const isDown = data?.status === "error";
  const version = data && t("health.version", { version: data.version });

  let state = version ?? t("health.checking");
  if (isDown) state = t("health.degraded");
  if (isError) state = t("health.unreachable");
  return (
    <footer className={classes.server}>
      <Text role="status" mod={{ problem: isError || isDown }}>
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

/** Three generations: the direct line is thick and ends at the name, the others branch off. */
function Lineage() {
  return (
    <svg className={classes.lineage} viewBox="0 0 320 136" aria-hidden="true">
      <path d="M6 112H172V92M112 92H232M112 92V68M232 92V68M88 68H136M208 68H256" />
      <path d="M6 64H56V44M36 44H76M36 44V24M76 44V24" />
      <path d="M6 20H30V0" />
      <path className={classes.direct} d="M6 0V136" />
    </svg>
  );
}
