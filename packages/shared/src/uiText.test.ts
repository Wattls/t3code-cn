import { describe, expect, it } from "vite-plus/test";
import { translateBuiltInUiSource } from "./uiText.ts";

describe("built-in UI source localization", () => {
  it("preserves interpolated project names, paths, and code while changing the UI language", () => {
    const source = "Downloaded feature/API-v2/$HOME.ts";
    expect(translateBuiltInUiSource("zh-CN", source)).toBe("已下载 feature/API-v2/$HOME.ts");
    expect(translateBuiltInUiSource("en", source)).toBe(source);
    expect(translateBuiltInUiSource("zh-CN", "Comparing feature/API-v2 against main")).toBe(
      "将 feature/API-v2 与 main 对比",
    );
    expect(translateBuiltInUiSource("zh-CN", "mytest / main")).toBe("mytest / main");
  });

  it("prefers a specific UI template over a shorter matching prefix", () => {
    expect(translateBuiltInUiSource("zh-CN", "Open parent thread: feature/API-v2")).toBe(
      "打开父会话：feature/API-v2",
    );
  });

  it("leaves long external diagnostics and unknown content intact", () => {
    const diagnostic = "External provider response: " + "error ".repeat(1000);
    expect(translateBuiltInUiSource("zh-CN", diagnostic)).toBe(diagnostic);
    expect(translateBuiltInUiSource("zh-CN", "console.log('hello')")).toBe("console.log('hello')");
  });
});
