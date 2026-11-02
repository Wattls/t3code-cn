import { describe, expect, it } from "vite-plus/test";
import { readPreviewAnnotationTheme } from "./annotationTheme";

describe("annotation theme language", () => {
  it("passes the app language instead of the visited page language to annotation guests", () => {
    const previous = document.documentElement.lang;
    try {
      document.documentElement.lang = "zh-CN";
      expect(readPreviewAnnotationTheme().locale).toBe("zh-CN");
      document.documentElement.lang = "en";
      expect(readPreviewAnnotationTheme().locale).toBe("en");
    } finally {
      document.documentElement.lang = previous;
    }
  });
});
