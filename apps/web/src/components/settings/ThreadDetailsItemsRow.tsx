import { useI18n as useFullUiLocale } from "~/i18n/WebI18nContext";
import { translateWebSource as translateFullUiCopy } from "~/i18n/messages";
import { useI18n as useStaticUiLocale } from "~/i18n/WebI18nContext";
import { translateWebSource as translateStaticUiCopy } from "~/i18n/messages";
import { ChevronDownIcon } from "lucide-react";

import { updateClientSettings, useClientSettings } from "../../hooks/useSettings";
import { ThreadDetailsItemsMenuItems } from "../chat/ThreadDetailsItemsMenu";
import {
  isDefaultThreadDetailsVisibility,
  resolveThreadDetailsVisibility,
  RESET_THREAD_DETAILS_ITEMS,
  THREAD_DETAILS_ITEMS,
} from "../chat/threadDetailsItems";
import { Button } from "../ui/button";
import { Menu, MenuPopup, MenuTrigger } from "../ui/menu";
import { SettingResetButton, SettingsRow } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";

export function ThreadDetailsItemsRow() {
  const { locale: fullUiLocale } = useFullUiLocale();
  const { locale: staticUiLocale } = useStaticUiLocale();
  const visibility = useClientSettings(resolveThreadDetailsVisibility);
  const enabled = THREAD_DETAILS_ITEMS.filter((item) => visibility[item.id]).length;
  return (
    <SettingsRow
      {...searchableSetting("thread-details-items")}
      description={translateStaticUiCopy(
        staticUiLocale,
        "Choose what the thread details card shows. You can also right-click the card.",
      )}
      resetAction={
        isDefaultThreadDetailsVisibility(visibility) ? null : (
          <SettingResetButton
            label={translateStaticUiCopy(staticUiLocale, "thread details")}
            onClick={() => updateClientSettings(RESET_THREAD_DETAILS_ITEMS)}
          />
        )
      }
      control={
        <Menu>
          <MenuTrigger
            render={
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-between sm:w-40"
                aria-label={translateFullUiCopy(
                  fullUiLocale,
                  `Thread details: ${enabled} of ${THREAD_DETAILS_ITEMS.length} on`,
                )}
              />
            }
          >
            {enabled}
            {" " + translateStaticUiCopy(staticUiLocale, "of") + " "}
            {THREAD_DETAILS_ITEMS.length}
            {" " + translateStaticUiCopy(staticUiLocale, "on")}
            <ChevronDownIcon aria-hidden />
          </MenuTrigger>
          <MenuPopup align="end">
            <ThreadDetailsItemsMenuItems />
          </MenuPopup>
        </Menu>
      }
    />
  );
}
