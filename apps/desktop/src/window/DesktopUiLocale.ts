// @effect-diagnostics nodeBuiltinImport:off -- Auxiliary HTML windows are rendered before the main renderer and need its persisted language.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeOS from "node:os";
import * as Electron from "electron";
import { resolveAppLocale } from "@t3tools/shared/appLocale";
import { translateBuiltInUiSource } from "@t3tools/shared/uiText";

export function readDesktopUiLocale() {
  let preference: "en" | "zh-CN" | "system" = "zh-CN";
  try {
    const home = process.env.T3CODE_HOME ?? NodePath.join(NodeOS.homedir(), ".t3-zh-test");
    const document = JSON.parse(
      NodeFS.readFileSync(NodePath.join(home, "userdata/client-settings.json"), "utf8"),
    );
    const stored = document.settings?.appLocale ?? document.appLocale;
    if (stored === "en" || stored === "zh-CN" || stored === "system") preference = stored;
  } catch {}
  if (preference !== "system") return preference;
  return resolveAppLocale(preference, [Electron.app.getSystemLocale()]);
}

export function localizeDesktopUiText(source: string): string {
  return translateBuiltInUiSource(readDesktopUiLocale(), source);
}

/** Only T3-owned auxiliary HTML is passed here; visited browser pages stay untouched. */
export function localizeDesktopUiHtml(html: string): string {
  const locale = readDesktopUiLocale();
  if (locale !== "zh-CN") return html;
  // Preserve raw diagnostics, code and executable content in these generated documents.
  return html
    .split(/(<(?:pre|code|script|style)\b[^>]*>[\s\S]*?<\/(?:pre|code|script|style)>)/gi)
    .map((part, index) =>
      index % 2 === 1
        ? part
        : part
            .replace(
              />([^<>]+)</g,
              (_, text: string) => `>${translateBuiltInUiSource(locale, text)}<`,
            )
            .replace(
              /(aria-label|title|alt)="([^"]+)"/g,
              (_, name: string, value: string) =>
                `${name}="${translateBuiltInUiSource(locale, value)}"`,
            ),
    )
    .join("")
    .replace(/<html(?: lang="en")?>/, '<html lang="zh-CN">');
}
