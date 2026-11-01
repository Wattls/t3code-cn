import { expect, it, vi } from "vite-plus/test";

// Locale consumers must stay usable before the settings runtime is initialized.
vi.mock("../hooks/useSettings", () => {
  throw new Error("Locale consumers must not initialize the settings runtime");
});

import { render } from "../../test/render";
import { splitWebTranslation, useI18n, WebI18nContext } from "./WebI18nContext";
import { translateWebMessage } from "./messages";

function SpeedLabel() {
  const { t } = useI18n();
  return <>{t("composer.traits.ultrafastModeOn")}</>;
}

it("provides English copy without loading settings", async () => {
  await using screen = await render(<SpeedLabel />);
  expect(screen.container.textContent).toBe("Ultrafast mode on");
});

it("uses the supplied locale for consumer copy without loading settings", async () => {
  await using screen = await render(
    <WebI18nContext
      value={{
        locale: "zh-CN",
        appLocale: "zh-CN",
        setAppLocale: () => undefined,
        t: (key, values) => translateWebMessage("zh-CN", key, values),
      }}
    >
      <SpeedLabel />
    </WebI18nContext>,
  );
  expect(screen.container.textContent).toBe("已开启极速模式");
});

it("splits localized copy around a styled placeholder without loading settings", () => {
  expect(
    splitWebTranslation(
      (key, values) => translateWebMessage("en", key, values),
      "chat.branchSwitch.title",
      "branch",
      { branch: "ignored" },
    ),
  ).toEqual(["Switch to ", "?"]);
  expect(
    splitWebTranslation(
      (key, values) => translateWebMessage("zh-CN", key, values),
      "chat.branchSwitch.title",
      "branch",
    ),
  ).toEqual(["切换到 ", "？"]);
});
