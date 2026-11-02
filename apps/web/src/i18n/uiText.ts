import { translateWebSource } from "./messages";

/** Non-React UI actions use the language synchronized by WebI18nProvider. */
export function localizeUiText(source: string): string {
  const locale =
    typeof document !== "undefined" && document.documentElement.lang === "zh-CN" ? "zh-CN" : "en";
  return translateWebSource(locale, source);
}
