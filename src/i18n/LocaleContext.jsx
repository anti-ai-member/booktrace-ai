import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { messagesEn } from "./messages.en.js";
import { messagesZh } from "./messages.zh.js";
import {
  clearLocaleOverride,
  localeFromNavigator,
  readLocaleOverride,
  resolveUiLocale,
  writeLocaleOverride,
} from "./locale.js";

const CATALOGS = { zh: messagesZh, en: messagesEn };

const LocaleContext = createContext({
  locale: "zh",
  source: "system",
  setLocale: () => {},
  followSystem: () => {},
  t: (key) => key,
});

function formatMessage(template, vars) {
  if (!vars) return template;
  return String(template).replace(/\{(\w+)\}/g, (_, name) => (
    vars[name] == null ? `{${name}}` : String(vars[name])
  ));
}

export function LocaleProvider({ children }) {
  const [locale, setLocaleState] = useState(() => resolveUiLocale());
  const [source, setSource] = useState(() => (readLocaleOverride() ? "override" : "system"));

  useEffect(() => {
    const syncFromSystem = () => {
      if (readLocaleOverride()) return;
      setLocaleState(localeFromNavigator());
      setSource("system");
    };
    window.addEventListener("languagechange", syncFromSystem);
    return () => window.removeEventListener("languagechange", syncFromSystem);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  }, [locale]);

  const value = useMemo(() => {
    const catalog = CATALOGS[locale] || messagesZh;
    const t = (key, vars) => {
      const template = catalog[key] ?? messagesZh[key] ?? key;
      return formatMessage(template, vars);
    };
    return {
      locale,
      source,
      setLocale: (next) => {
        if (next !== "zh" && next !== "en") return;
        writeLocaleOverride(next);
        setLocaleState(next);
        setSource("override");
      },
      followSystem: () => {
        clearLocaleOverride();
        setLocaleState(localeFromNavigator());
        setSource("system");
      },
      t,
    };
  }, [locale, source]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  return useContext(LocaleContext);
}

export function useT() {
  return useLocale().t;
}
