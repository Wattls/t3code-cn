import { useI18n as useStaticUiLocale } from "~/i18n/WebI18nContext";
import { translateWebSource as translateStaticUiCopy } from "~/i18n/messages";
import { useRef } from "react";

import { APP_VERSION } from "../../branding";
import { useCopyToClipboard } from "../../hooks/useCopyToClipboard";
import { showAnchoredCopySuccessToast } from "../ui/anchoredCopyToast";
import { InlineButton } from "../ui/button";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

export function AboutVersionTitle() {
  const { locale: staticUiLocale } = useStaticUiLocale();
  const copyButtonRef = useRef<HTMLButtonElement>(null);
  const { copyToClipboard } = useCopyToClipboard<void>({
    target: "version",
    onCopy: () => showAnchoredCopySuccessToast(copyButtonRef),
    onError: (error) => {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: translateStaticUiCopy(staticUiLocale, "Could not copy version"),
          description: error.message,
        }),
      );
    },
  });

  return (
    <span className="inline-flex items-baseline gap-2">
      <span>{translateStaticUiCopy(staticUiLocale, "Version")}</span>
      <code className="text-2xs font-medium">
        <Tooltip>
          <TooltipTrigger
            render={
              <InlineButton
                ref={copyButtonRef}
                tone="muted"
                aria-label={`${translateStaticUiCopy(staticUiLocale, "Copy version")} ${APP_VERSION}`}
                onClick={() => copyToClipboard(APP_VERSION, undefined)}
              >
                {APP_VERSION}
              </InlineButton>
            }
          />
          <TooltipPopup>{translateStaticUiCopy(staticUiLocale, "Copy version")}</TooltipPopup>
        </Tooltip>
      </code>
    </span>
  );
}
