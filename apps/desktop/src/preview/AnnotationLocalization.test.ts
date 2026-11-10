import { describe, expect, it } from "vite-plus/test";
import { createAnnotationLocalization } from "./AnnotationLocalization.ts";

describe("annotation UI language state", () => {
  it("updates live labels without changing the annotation comment or CSS option values", () => {
    const localization = createAnnotationLocalization("en");
    const comment = { value: "Keep API-v2 and --border-radius unchanged", textContent: "" };
    const font = { value: "monospace", textContent: "" };
    const button = { textContent: "" };
    const attributes = new Map<string, string>();
    const voiceAttributes = new Map<string, string>();
    const voiceButton = {
      setAttribute: (name: string, value: string) => {
        voiceAttributes.set(name, value);
      },
    };
    const editor = {
      setAttribute: (name: string, value: string) => {
        attributes.set(name, value);
      },
    };
    let capturing = false;
    localization.text(font, "monospace");
    localization.text(button, () => (capturing ? "Capturing…" : "Attach"));
    localization.attribute(editor, "placeholder", "Describe the change…");
    localization.attribute(voiceButton, "title", "Start voice input");
    localization.attribute(voiceButton, "aria-label", "Start voice input");
    localization.setLocale("zh-CN");
    expect(voiceAttributes.get("title")).toBe("开始语音输入");
    expect(voiceAttributes.get("aria-label")).toBe("开始语音输入");
    expect(font).toEqual({ value: "monospace", textContent: "等宽字体" });
    expect(button.textContent).toBe("附加");
    expect(attributes.get("placeholder")).toBe("描述需要修改的内容…");
    expect(comment.value).toBe("Keep API-v2 and --border-radius unchanged");
    capturing = true;
    localization.refresh();
    expect(button.textContent).toBe("正在截图…");
    localization.setLocale("en");
    expect(button.textContent).toBe("Capturing…");
    expect(voiceAttributes.get("title")).toBe("Start voice input");
    expect(voiceAttributes.get("aria-label")).toBe("Start voice input");
    expect(font.value).toBe("monospace");
  });
});
