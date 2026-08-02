import { useLocale } from "./LocaleContext.jsx";

/** Shared 中 / EN control for home and reader. Manual pick overrides system until cleared. */
export function LocaleToggle({ className = "" }) {
  const { locale, source, setLocale, followSystem, t } = useLocale();

  return (
    <div className={`locale-toggle ${className}`.trim()} role="group" aria-label={t("locale.followSystem")}>
      <button
        type="button"
        className={locale === "zh" ? "active" : ""}
        title={source === "override" && locale === "zh" ? t("locale.followSystem") : t("locale.switchToZh")}
        aria-label={t("locale.switchToZh")}
        aria-pressed={locale === "zh"}
        onClick={() => {
          if (locale === "zh" && source === "override") followSystem();
          else setLocale("zh");
        }}
      >
        {t("locale.zh")}
      </button>
      <button
        type="button"
        className={locale === "en" ? "active" : ""}
        title={source === "override" && locale === "en" ? t("locale.followSystem") : t("locale.switchToEn")}
        aria-label={t("locale.switchToEn")}
        aria-pressed={locale === "en"}
        onClick={() => {
          if (locale === "en" && source === "override") followSystem();
          else setLocale("en");
        }}
      >
        {t("locale.en")}
      </button>
    </div>
  );
}
