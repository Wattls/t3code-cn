import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";
import { translateWebSource } from "../../i18n/messages";

export function localizeConnectionDiagnosisText(
  locale: ResolvedAppLocale,
  source: string,
  hostLabel: string,
): string {
  const translated = translateWebSource(locale, source);
  if (translated !== source || !hostLabel) return translated;
  const template = source.replaceAll(hostLabel, "{host}");
  const translatedTemplate = translateWebSource(locale, template);
  return translatedTemplate === template
    ? source
    : translatedTemplate.replaceAll("{host}", () => hostLabel);
}
