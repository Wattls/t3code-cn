import { useI18n as useStaticUiLocale } from "~/i18n/WebI18nContext";
import { translateWebSource as translateStaticUiCopy } from "~/i18n/messages";
import type { ComponentProps } from "react";
import { ExternalLinkIcon } from "lucide-react";
import { CHATGPT_USAGE_URL } from "@t3tools/shared/usageLimits";
import { ensureLocalApi } from "../../localApi";
import { Button } from "../ui/button";

export function ChatGptUsageButton(props: Omit<ComponentProps<typeof Button>, "onClick">) {
  const { locale: staticUiLocale } = useStaticUiLocale();
  return (
    <Button
      variant="ghost-muted"
      size="sm"
      {...props}
      onClick={() => void ensureLocalApi().shell.openExternal(CHATGPT_USAGE_URL)}
    >
      {translateStaticUiCopy(staticUiLocale, "Manage usage")}
      <ExternalLinkIcon className="size-3.5" aria-hidden="true" />
    </Button>
  );
}
