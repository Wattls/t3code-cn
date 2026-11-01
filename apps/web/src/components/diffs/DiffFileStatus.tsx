import { useI18n as useStaticUiLocale } from "~/i18n/WebI18nContext";
import { translateWebSource as translateStaticUiCopy } from "~/i18n/messages";
import { InfoIcon, RotateCwIcon } from "lucide-react";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

export function DiffFileStatus({
  error,
  truncated,
  retry,
}: {
  error?: boolean | undefined;
  truncated?: boolean | undefined;
  retry: () => void;
}) {
  const { locale: staticUiLocale } = useStaticUiLocale();
  if (!error && !truncated) return null;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size="icon-micro"
            variant="ghost-muted"
            aria-label={
              error
                ? translateStaticUiCopy(staticUiLocale, "Retry loading diff")
                : translateStaticUiCopy(staticUiLocale, "Partial diff preview")
            }
            onClick={(event) => {
              event.stopPropagation();
              if (error) retry();
            }}
          />
        }
      >
        {error ? <RotateCwIcon className="size-3" /> : <InfoIcon className="size-3" />}
      </TooltipTrigger>
      <TooltipPopup>
        {error
          ? translateStaticUiCopy(staticUiLocale, "Retry loading diff")
          : translateStaticUiCopy(
              staticUiLocale,
              "This file is too large to show in full. Counts include all changes.",
            )}
      </TooltipPopup>
    </Tooltip>
  );
}
