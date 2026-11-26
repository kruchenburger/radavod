import {
  Button,
  SegmentedControl,
  Text,
  Title,
  useComputedColorScheme,
  useMantineColorScheme,
} from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useId } from "react";
import { locales } from "../i18n/t";
import { useArrival } from "./arrival";
import { sessionQuery } from "../access/session";
import { configQuery } from "./config";
import { Halves } from "./halves";
import { healthQuery } from "./health";
import classes from "./home.module.css";
import { useLanguage } from "./language";
import { Link } from "./router";

const themes = ["light", "dark"] as const;

export function Home() {
  const { t, locale, setLocale } = useLanguage();
  const { setColorScheme } = useMantineColorScheme();
  const colorScheme = useComputedColorScheme("light");
  const heading = useArrival<HTMLHeadingElement>();
  return (
    <Halves>
      <Title ref={heading} tabIndex={-1} className={classes.name}>
        {t("app.name")}
      </Title>
      <Text className={classes.about}>{t("app.about")}</Text>
      <Enter />
      <Example />
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
          value={colorScheme}
          onChange={setColorScheme}
          data={themes.map((value) => ({ value, label: t(`theme.${value}`) }))}
        />
      </div>
      <Server />
    </Halves>
  );
}

/** The way in, or back to the family for whoever is signed in. */
function Enter() {
  const { t } = useLanguage();
  const { data } = useQuery(sessionQuery);
  const isIn = data !== null && data !== undefined;
  return (
    <div className={classes.example}>
      <Button component={Link} href={isIn ? "/family" : "/sign-in"} size="md">
        {t(isIn ? "home.members" : "home.signIn")}
      </Button>
    </div>
  );
}

/** Only where the installation allows it. Who cannot be asked allows nothing. */
function Example() {
  const { t } = useLanguage();
  const { data } = useQuery(configQuery);
  if (data?.sample !== true) return null;
  return (
    <div className={classes.example}>
      <Button component={Link} href="/sample" size="md" variant="outline">
        {t("sample.open")}
      </Button>
      <Text>{t("sample.invite")}</Text>
    </div>
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
