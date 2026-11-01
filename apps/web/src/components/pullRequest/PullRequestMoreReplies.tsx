import { useI18n } from "~/i18n/WebI18nContext";

import type { PullRequestReplyAvailability } from "./pullRequestDetail.logic";

export function PullRequestMoreReplies({
  moreReplies,
  hasMoreReplies,
  url,
}: PullRequestReplyAvailability) {
  const { t } = useI18n();
  if (!hasMoreReplies) return null;
  return (
    <div className="flex flex-wrap items-baseline gap-2 py-1 text-xs text-muted-foreground">
      <span>
        {moreReplies > 0
          ? t(
              moreReplies === 1
                ? "pullRequests.comments.moreReplyOne"
                : "pullRequests.comments.moreReplyMany",
              { count: moreReplies.toLocaleString() },
            )
          : t("pullRequests.comments.moreReplies")}
      </span>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground hover:underline"
        >
          {t("pullRequests.comments.viewOnHost")}
        </a>
      ) : null}
    </div>
  );
}
