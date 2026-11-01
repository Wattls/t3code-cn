import { useI18n as useStaticUiLocale } from "~/i18n/WebI18nContext";
import { translateWebSource as translateStaticUiCopy } from "~/i18n/messages";
import type { DevicePlatformAvailability } from "@t3tools/contracts";
import { Check, Minus } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";

export function DeviceHostAvailability({
  platforms,
}: {
  platforms: ReadonlyArray<DevicePlatformAvailability>;
}) {
  const { locale: staticUiLocale } = useStaticUiLocale();
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {platforms.map((platform) => (
        <Tooltip key={platform.platform}>
          <TooltipTrigger render={<span tabIndex={0} className="inline-flex items-center gap-1" />}>
            {platform.available ? <Check className="size-3" /> : <Minus className="size-3" />}
            {platform.platform === "ios" ? "iOS" : "Android"}{" "}
            {platform.available
              ? translateStaticUiCopy(staticUiLocale, "available")
              : translateStaticUiCopy(staticUiLocale, "unavailable")}
          </TooltipTrigger>
          <TooltipPopup>
            {platform.reason ??
              (platform.platform === "ios" ? "iOS available" : "Android available")}
          </TooltipPopup>
        </Tooltip>
      ))}
    </div>
  );
}
