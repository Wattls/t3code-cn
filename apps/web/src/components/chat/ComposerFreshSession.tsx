import { localizeUiText as localizeBuiltInUi } from "~/i18n/uiText";
import { EraserIcon } from "lucide-react";

import type { ComposerBannerStackItem } from "./ComposerBannerStack";

/** Shown while `/clear` is armed; dismissing it keeps the current conversation. */
export function freshSessionBannerItem(onUndo: () => void): ComposerBannerStackItem {
  return {
    id: "fresh-session",
    variant: "info",
    icon: <EraserIcon />,
    title: localizeBuiltInUi("Your next message starts a fresh session"),
    description: localizeBuiltInUi("The agent won't see earlier messages in this thread."),
    dismissLabel: "Keep the current session",
    onDismiss: onUndo,
  };
}
