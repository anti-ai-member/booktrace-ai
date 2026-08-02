export const LOCALE_STORAGE_KEY = "shumai.uiLocale";
export const LOCALE_OVERRIDE_KEY = "shumai.uiLocaleOverride";

/** @returns {"zh" | "en"} */
export function localeFromNavigator(nav = typeof navigator !== "undefined" ? navigator : null) {
  const candidates = [];
  if (nav?.languages?.length) candidates.push(...nav.languages);
  if (nav?.language) candidates.push(nav.language);
  for (const raw of candidates) {
    const tag = String(raw || "").toLowerCase();
    if (!tag) continue;
    if (tag === "zh" || tag.startsWith("zh-") || tag.startsWith("zh_")) return "zh";
  }
  return "en";
}

/** @returns {"zh" | "en" | null} */
export function readLocaleOverride() {
  try {
    const value = localStorage.getItem(LOCALE_OVERRIDE_KEY) || localStorage.getItem(LOCALE_STORAGE_KEY);
    if (value === "zh" || value === "en") return value;
  } catch {
    /* ignore */
  }
  return null;
}

export function writeLocaleOverride(locale) {
  try {
    if (locale === "zh" || locale === "en") {
      localStorage.setItem(LOCALE_OVERRIDE_KEY, locale);
      localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    }
  } catch {
    /* ignore */
  }
}

export function clearLocaleOverride() {
  try {
    localStorage.removeItem(LOCALE_OVERRIDE_KEY);
    localStorage.removeItem(LOCALE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Effective locale: manual override if set, else system. */
export function resolveUiLocale() {
  return readLocaleOverride() || localeFromNavigator();
}
