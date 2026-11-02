import { useI18n as useFullUiLocale } from "~/i18n/WebI18nContext";
import { translateWebSource as translateFullUiCopy } from "~/i18n/messages";
import { useI18n as useStaticUiLocale } from "~/i18n/WebI18nContext";
import { translateWebSource as translateStaticUiCopy } from "~/i18n/messages";
import {
  getClientSettings,
  updateClientSettings,
  useClientSettings,
} from "../../hooks/useSettings";
import { MenuCheckboxItem, MenuGroup, MenuGroupLabel, MenuItem, MenuSeparator } from "../ui/menu";
import {
  isDefaultThreadDetailsVisibility,
  resolveThreadDetailsVisibility,
  RESET_THREAD_DETAILS_ITEMS,
  setThreadDetailsItem,
  THREAD_DETAILS_ITEMS,
} from "./threadDetailsItems";

/** Menu body that shows and hides thread details items. The card's context menu and Settings share it. */
export function ThreadDetailsItemsMenuItems() {
  const { locale: fullUiLocale } = useFullUiLocale();
  const { locale: staticUiLocale } = useStaticUiLocale();
  const visibility = useClientSettings(resolveThreadDetailsVisibility);
  return (
    <>
      <MenuGroup>
        <MenuGroupLabel>
          {translateStaticUiCopy(staticUiLocale, "Show in thread details")}
        </MenuGroupLabel>
        {THREAD_DETAILS_ITEMS.map((item) => (
          <MenuCheckboxItem
            key={item.id}
            checked={visibility[item.id]}
            onCheckedChange={(checked) =>
              updateClientSettings({
                threadDetailsItems: setThreadDetailsItem(getClientSettings(), item, checked),
              })
            }
          >
            {translateFullUiCopy(fullUiLocale, item.label)}
          </MenuCheckboxItem>
        ))}
      </MenuGroup>
      <MenuSeparator />
      <MenuItem
        disabled={isDefaultThreadDetailsVisibility(visibility)}
        onClick={() => updateClientSettings(RESET_THREAD_DETAILS_ITEMS)}
      >
        {translateStaticUiCopy(staticUiLocale, "Reset to default")}
      </MenuItem>
    </>
  );
}
