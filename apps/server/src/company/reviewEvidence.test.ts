import { expect, it } from "vite-plus/test";
import { inspectionRequest, inspectionResult } from "./reviewEvidence.ts";
it("recognizes the native Codex exec image observation and actual returned image", () => {
  expect(
    inspectionRequest({
      type: "custom_tool_call",
      name: "exec",
      call_id: "view1",
      input:
        'const imageResult = await tools.view_image({path: "/tmp/inputs/cover.png"}); image(imageResult.image_url);\n',
    }),
  ).toEqual({ callId: "view1", path: "/tmp/inputs/cover.png" });
  expect(
    inspectionResult({
      type: "custom_tool_call_output",
      call_id: "view1",
      output: [
        { type: "input_text", text: "Script completed" },
        { type: "input_image", image_url: "data:image/png;base64,aGVsbG8=" },
      ],
    }),
  ).toBe("view1");
});
it("rejects a failed tool, a self-reported inspection and arbitrary exec code", () => {
  expect(
    inspectionResult({
      type: "custom_tool_call_output",
      call_id: "view1",
      output: [{ type: "input_text", text: "Script error: unable to process image" }],
    }),
  ).toBe(null);
  expect(
    inspectionResult({
      type: "custom_tool_call_output",
      call_id: "view1",
      output: [{ type: "input_text", text: "I viewed every image" }],
    }),
  ).toBe(null);
  expect(
    inspectionRequest({
      type: "custom_tool_call",
      name: "exec",
      call_id: "view1",
      input: 'const fake = "tools.view_image"; image("data:image/png;base64,fake");',
    }),
  ).toBe(null);
});
