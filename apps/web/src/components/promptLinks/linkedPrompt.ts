import { localizeUiText as localizeBuiltInUi } from "~/i18n/uiText";
import type { LinkedPrompt } from "@t3tools/shared/promptLinks";

import { type ComposerThreadTarget, useComposerDraftStore } from "~/composerDraftStore";

import { toastManager } from "../ui/toast";

export function warnAboutHiddenCharacters(prompt: LinkedPrompt): void {
  if (prompt.hiddenCharacters === 0) return;
  toastManager.add({
    type: "warning",
    title: localizeBuiltInUi("This prompt had hidden characters, it may be malicious"),
    description: localizeBuiltInUi(
      `T3 Code removed ${prompt.hiddenCharacters} hidden character${prompt.hiddenCharacters === 1 ? "" : "s"}. Read the prompt before you send it.`,
    ),
    timeout: 0,
  });
}

export function placeLinkedPrompt(
  target: ComposerThreadTarget,
  prompt: LinkedPrompt,
  notes: ReadonlyArray<string> = [],
): void {
  warnAboutHiddenCharacters(prompt);
  const place = () => {
    useComposerDraftStore.getState().setPrompt(target, prompt.text);
    toastManager.add({
      type: "info",
      title: localizeBuiltInUi("Prompt added from a link"),
      description: ["Read it before you send.", ...notes].join(" "),
    });
  };
  const existing = useComposerDraftStore.getState().getComposerDraft(target)?.prompt ?? "";
  if (existing.trim().length === 0 || existing === prompt.text) {
    place();
    return;
  }
  const id = toastManager.add({
    type: "info",
    title: localizeBuiltInUi("Linked prompt ready"),
    description: localizeBuiltInUi(
      "This thread already has a draft. Replace it with the linked prompt?",
    ),
    timeout: 0,
    actionProps: {
      children: "Replace draft",
      onClick: () => {
        toastManager.close(id);
        place();
      },
    },
  });
}
