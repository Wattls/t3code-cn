import { InlineButton } from "../ui/button";
import { useId, useState } from "react";

import { cn } from "../../lib/utils";
import { useI18n } from "../../i18n/WebI18nContext";
import { translateWebSource } from "../../i18n/messages";

export function ExpandableText({
  text,
  collapsedText = text,
  className,
  collapsedClassName = "line-clamp-3",
  expandLabel = "Show full error",
}: {
  text: string;
  collapsedText?: string;
  className?: string;
  collapsedClassName?: string;
  expandLabel?: string;
}) {
  const { locale } = useI18n();
  const textId = useId();
  const [expanded, setExpanded] = useState(false);
  const canExpand = collapsedText !== text || text.length > 180 || text.includes("\n");

  return (
    <div className={cn("min-w-0", className)}>
      <div
        id={textId}
        className={cn(
          "whitespace-pre-wrap break-words",
          !expanded && canExpand ? collapsedClassName : null,
        )}
      >
        {expanded ? text : collapsedText}
      </div>
      {canExpand ? (
        <InlineButton
          aria-expanded={expanded}
          aria-controls={textId}
          tone="muted"
          className="mt-1"
          onClick={() => setExpanded((value) => !value)}
        >
          {translateWebSource(locale, expanded ? "Show less" : expandLabel)}
        </InlineButton>
      ) : null}
    </div>
  );
}
