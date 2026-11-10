const CHINESE_MESSAGES = {
  Select: "选择",
  "Start voice input": "开始语音输入",
  "Cancel voice input": "取消语音输入",
  "Finish voice input": "完成语音输入",
  "Skip transcript cleanup": "跳过转录整理",
  Skip: "跳过",
  Region: "区域",
  Draw: "绘制",
  Erase: "擦除",
  "Select elements (V)": "选择元素（V）",
  "Draw a region or marquee-select elements (R)": "绘制区域或框选元素（R）",
  "Draw freehand (D)": "自由绘制（D）",
  "Remove an annotation target (E)": "移除批注目标（E）",
  "Expand annotation editor": "展开批注编辑器",
  "Collapse annotation editor": "收起批注编辑器",
  "Drag annotation editor": "拖动批注编辑器",
  "Describe the change…": "描述需要修改的内容…",
  Attach: "附加",
  "Attach annotation and screenshot (Enter)": "附加批注和截图（Enter）",
  "Attach annotation and screenshot (Enter). Send with Cmd/Ctrl+Enter.":
    "附加批注和截图（Enter），按 Cmd/Ctrl+Enter 发送。",
  "Capturing…": "正在截图…",
  Font: "字体",
  "Font size": "字号",
  "Font weight": "字重",
  "Line height": "行高",
  "Text color": "文字颜色",
  Background: "背景",
  Opacity: "不透明度",
  Radius: "圆角",
  "Border color": "边框颜色",
  "Border width": "边框宽度",
  Width: "宽度",
  Height: "高度",
  "Lock aspect ratio": "锁定宽高比",
  "Unlock aspect ratio": "解锁宽高比",
  Padding: "内边距",
  Margin: "外边距",
  Gap: "间距",
  "Style value": "样式值",
  inherit: "继承字体",
  "system-ui": "系统字体",
  "sans-serif": "无衬线字体",
  serif: "衬线字体",
  monospace: "等宽字体",
} as const;

export type AnnotationLocale = "en" | "zh-CN";
export type AnnotationMessage = keyof typeof CHINESE_MESSAGES;
export type AnnotationMessageSource = AnnotationMessage | (() => AnnotationMessage);

interface AnnotationTextTarget {
  textContent: string | null;
}

interface AnnotationAttributeTarget {
  setAttribute(name: string, value: string): void;
}

export function createAnnotationLocalization(initialLocale: AnnotationLocale = "en") {
  let locale = initialLocale;
  const bindings: Array<() => void> = [];
  const translate = (source: AnnotationMessageSource): string => {
    const message = typeof source === "function" ? source() : source;
    return locale === "zh-CN" ? CHINESE_MESSAGES[message] : message;
  };
  const bind = (update: () => void): void => {
    bindings.push(update);
    update();
  };
  const refresh = (): void => {
    for (const update of bindings) update();
  };
  return {
    text: (target: AnnotationTextTarget, source: AnnotationMessageSource) =>
      bind(() => {
        target.textContent = translate(source);
      }),
    attribute: (target: AnnotationAttributeTarget, name: string, source: AnnotationMessageSource) =>
      bind(() => target.setAttribute(name, translate(source))),
    refresh,
    setLocale: (next: AnnotationLocale) => {
      if (next === locale) return;
      locale = next;
      refresh();
    },
  };
}

export type AnnotationLocalization = ReturnType<typeof createAnnotationLocalization>;
