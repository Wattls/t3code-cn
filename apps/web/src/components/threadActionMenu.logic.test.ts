import { describe, expect, it } from "vite-plus/test";
import { translateWebMessage } from "../i18n/messages";

import {
  buildDraftActionMenuItems,
  buildThreadActionMenuItems,
  localizeSnoozePresetLabel,
  type ThreadActionMenuState,
} from "./threadActionMenu.logic";

const baseState: ThreadActionMenuState = {
  canOperate: true,
  branch: null,
  projectFilter: null,
  isPinned: false,
  isSettled: false,
  autoSettleEnabled: true,
  isSnoozed: false,
  canSnoozeNow: true,
  isRegeneratingTitle: false,
  isRunning: false,
  supports: {
    settlement: true,
    autoSettleOptOut: true,
    snooze: true,
    pinning: true,
    titleRegeneration: true,
  },
  snoozePresets: [
    { id: "hour", label: "In 1 hour", whenLabel: "3:00 PM", snoozedUntil: "2026-08-07T15:00:00Z" },
  ],
};

describe("buildThreadActionMenuItems", () => {
  it.each([
    ["after:60", "In 1 hour", "1 小时后"],
    ["after:90", "In 90 minutes", "90 分钟后"],
    ["after:2880", "In 2 days", "2 天后"],
    ["at:today:09:00", "This morning", "今天上午"],
    ["at:tomorrow:09:00", "Tomorrow", "明天"],
    ["at:friday:09:00", "Friday", "周五"],
    ["at:friday:09:00", "Next Friday", "下周五"],
  ])("localizes configurable snooze option %s", (id, label, expected) => {
    const preset = { id, label, whenLabel: "09:00", snoozedUntil: "2026-11-06T01:00:00Z" };
    expect(
      localizeSnoozePresetLabel(preset, (key, values) => translateWebMessage("zh-CN", key, values)),
    ).toBe(expected);
    expect(
      localizeSnoozePresetLabel(preset, (key, values) => translateWebMessage("en", key, values)),
    ).toBe(label);
  });

  it("localizes sidebar and draft menu branches without translating project or branch names", () => {
    const t = (
      key: Parameters<typeof translateWebMessage>[1],
      values?: Parameters<typeof translateWebMessage>[2],
    ) => translateWebMessage("zh-CN", key, values);
    const items = buildThreadActionMenuItems(
      {
        ...baseState,
        canFind: true,
        branch: "feature/API-v2",
        projectFilter: { label: "mytest", isActive: false },
        canTurnIntoProject: true,
      },
      t,
    );
    expect(items.find((item) => item.id === "new-thread-on-branch")?.label).toBe(
      "在 feature/API-v2 分支新建任务",
    );
    expect(items.find((item) => item.id === "filter-by-project")?.label).toBe("按 mytest 筛选");
    expect(items.find((item) => item.id === "find")?.label).toBe("在会话中查找");
    expect(items.find((item) => item.id === "turn-into-project")?.label).toBe("转为项目");
    expect(items.find((item) => item.id === "project-settings")?.label).toBe("项目设置");
    expect(items.find((item) => item.id === "snooze")?.children?.at(-1)?.label).toBe("自定义…");
    const draft = buildDraftActionMenuItems(
      { hasPath: true, hasBranch: true, hasProject: true },
      t,
    );
    expect(draft.map((item) => item.label)).toEqual(["复制", "项目设置", "丢弃草稿"]);
    expect(draft[0]?.children?.map((item) => [item.id, item.label])).toEqual([
      ["copy-path", "路径"],
      ["copy-branch", "分支"],
    ]);
  });

  it("localizes guest sharing without changing its capability gate", () => {
    const translate = (
      key: Parameters<typeof translateWebMessage>[1],
      values?: Parameters<typeof translateWebMessage>[2],
    ) => translateWebMessage("zh-CN", key, values);
    expect(
      buildThreadActionMenuItems(baseState, translate).some((item) => item.id === "share-guest"),
    ).toBe(false);
    const state = { ...baseState, canShareWithGuest: true };
    expect(
      buildThreadActionMenuItems(state, translate).find((item) => item.id === "share-guest")?.label,
    ).toBe("与访客共享");
    expect(buildThreadActionMenuItems(state).find((item) => item.id === "share-guest")?.label).toBe(
      "Share with guest",
    );
  });

  it("localizes snooze presets while preserving their formatted wake time", () => {
    const items = buildThreadActionMenuItems(baseState, (key, values) =>
      translateWebMessage("zh-CN", key, values),
    );
    const preset = items
      .find((item) => item.id === "snooze")
      ?.children?.find((item) => item.id === "snooze:hour");
    expect(preset?.label).toBe(`${translateWebMessage("zh-CN", "sidebar.snooze.hour")} (3:00 PM)`);
    const englishItems = buildThreadActionMenuItems(baseState);
    expect(
      englishItems
        .find((item) => item.id === "snooze")
        ?.children?.find((item) => item.id === "snooze:hour")?.label,
    ).toBe("In 1 hour (3:00 PM)");
  });

  it.each([false, true])(
    "disables both lifecycle directions without permission (reversed: %s)",
    (reversed) => {
      const items = buildThreadActionMenuItems({
        ...baseState,
        canOperate: false,
        isPinned: reversed,
        isSettled: reversed,
        isSnoozed: reversed,
      });
      const expected = reversed
        ? [
            "unpin",
            "unsettle",
            "unsnooze",
            "rename",
            "regenerate-title",
            "auto-settle",
            "archive",
            "delete",
          ]
        : [
            "pin",
            "settle",
            "snooze",
            "rename",
            "regenerate-title",
            "auto-settle",
            "archive",
            "delete",
          ];
      expect(items.filter((item) => item.disabled).map((item) => item.id)).toEqual(expected);
      expect(
        items.find((item) => item.id === "snooze")?.children?.every((child) => child.disabled) ??
          true,
      ).toBe(true);
    },
  );

  it("disables archive and turning into a project while the thread is running", () => {
    const items = buildThreadActionMenuItems({
      ...baseState,
      isRunning: true,
      canTurnIntoProject: true,
    });
    expect(items.find((item) => item.id === "archive")?.disabled).toBe(true);
    expect(items.find((item) => item.id === "turn-into-project")?.disabled).toBe(true);
  });
});
