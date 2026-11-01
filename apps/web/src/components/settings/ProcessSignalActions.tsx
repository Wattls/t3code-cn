import { useI18n as useStaticUiLocale } from "~/i18n/WebI18nContext";
import { translateWebSource as translateStaticUiCopy } from "~/i18n/messages";
import type { ServerProcessSignal } from "@t3tools/contracts";

import { InlineButton } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

export function ProcessSignalActions({
  disabled,
  onSignal,
}: {
  disabled: boolean;
  onSignal: (signal: ServerProcessSignal) => void;
}) {
  const { locale: staticUiLocale } = useStaticUiLocale();
  return (
    <div className="flex items-center justify-end gap-1.5">
      <Tooltip>
        <TooltipTrigger
          render={
            <InlineButton
              disabled={disabled}
              aria-label={translateStaticUiCopy(staticUiLocale, "Send SIGINT")}
              tone="muted"
              onClick={() => onSignal("SIGINT")}
            >
              INT
            </InlineButton>
          }
        />
        <TooltipPopup side="top">
          {translateStaticUiCopy(staticUiLocale, "Send SIGINT")}
        </TooltipPopup>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <InlineButton
              disabled={disabled}
              aria-label={translateStaticUiCopy(staticUiLocale, "Send SIGKILL")}
              tone="destructive"
              onClick={() => onSignal("SIGKILL")}
            >
              KILL
            </InlineButton>
          }
        />
        <TooltipPopup side="top">
          {translateStaticUiCopy(staticUiLocale, "Send SIGKILL")}
        </TooltipPopup>
      </Tooltip>
    </div>
  );
}
