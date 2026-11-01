import { useI18n as useStaticUiLocale } from "~/i18n/WebI18nContext";
import { translateWebSource as translateStaticUiCopy } from "~/i18n/messages";
import { MenuGroupLabel } from "../ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

export function PullRequestStackHeader({
  number,
  notice,
  stale = false,
}: {
  number: number;
  notice?: string | null | undefined;
  stale?: boolean;
}) {
  const { locale: staticUiLocale } = useStaticUiLocale();
  return (
    <MenuGroupLabel>
      <div className="flex items-center justify-between gap-2">
        <span>
          {translateStaticUiCopy(staticUiLocale, "Stack #")}
          {number}
        </span>
        {notice ? (
          <Tooltip>
            <TooltipTrigger render={<span role="status" className="text-xs font-normal" />}>
              {stale
                ? translateStaticUiCopy(staticUiLocale, "May be stale")
                : translateStaticUiCopy(staticUiLocale, "Refreshing…")}
            </TooltipTrigger>
            <TooltipPopup>{notice}</TooltipPopup>
          </Tooltip>
        ) : null}
      </div>
    </MenuGroupLabel>
  );
}
