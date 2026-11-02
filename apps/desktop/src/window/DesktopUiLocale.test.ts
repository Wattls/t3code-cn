import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("node:fs", () => ({
  readFileSync: () => JSON.stringify({ appLocale: "zh-CN" }),
}));

import { localizeDesktopUiHtml } from "./DesktopUiLocale.ts";

describe("auxiliary window localization", () => {
  it("preserves raw diagnostics and executable content while translating surrounding UI", () => {
    const protectedContent =
      '<pre>Downloaded API-v2</pre><code>Retry</code><script>const x = ">Retry<";</script><style>.Retry{color:red}</style>';
    const html = `<html><body><button title="Retry">Retry</button>${protectedContent}<p>Cancel</p></body></html>`;
    const localized = localizeDesktopUiHtml(html);
    expect(localized).toContain(protectedContent);
    expect(localized).toContain('<button title="重试">重试</button>');
    expect(localized).toContain("<p>取消</p>");
    expect(localized).toContain('<html lang="zh-CN">');
  });
});
