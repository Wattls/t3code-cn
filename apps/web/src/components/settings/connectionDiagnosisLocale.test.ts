import { describe, expect, it } from "vite-plus/test";
import { localizeConnectionDiagnosisText } from "./connectionDiagnosisLocale";

describe("connection diagnosis localization", () => {
  it("preserves host names and technical commands", () => {
    expect(localizeConnectionDiagnosisText("zh-CN", "Lab Mac's tunnel is offline", "Lab Mac")).toBe(
      "Lab Mac 的隧道已离线",
    );
    const source = "On Lab Mac, check Settings > Connections or run `t3 connect status`.";
    const translated = localizeConnectionDiagnosisText("zh-CN", source, "Lab Mac");
    expect(translated).toContain("Lab Mac");
    expect(translated).toContain("`t3 connect status`");
    expect(translated).not.toBe(source);
  });

  it("keeps unrecognized diagnostics and English copy unchanged", () => {
    const source = "Lab Mac sent custom failure 0xAB.";
    expect(localizeConnectionDiagnosisText("zh-CN", source, "Lab Mac")).toBe(source);
    expect(localizeConnectionDiagnosisText("en", "Lab Mac's tunnel is offline", "Lab Mac")).toBe(
      "Lab Mac's tunnel is offline",
    );
  });
});
