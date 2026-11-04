import * as Schema from "effect/Schema";

const ToolItem = Schema.Struct({
  type: Schema.String,
  name: Schema.optional(Schema.String),
  call_id: Schema.optional(Schema.String),
  arguments: Schema.optional(Schema.String),
  input: Schema.optional(Schema.String),
  output: Schema.optional(Schema.Unknown),
});
const isToolItem = Schema.is(ToolItem);
const decodeArguments = Schema.decodeSync(
  Schema.fromJsonString(Schema.Struct({ path: Schema.String })),
);
const decodeString = Schema.decodeSync(Schema.fromJsonString(Schema.String));
const isOutput = Schema.is(
  Schema.Array(
    Schema.Struct({
      type: Schema.String,
      text: Schema.optional(Schema.String),
      image_url: Schema.optional(Schema.String),
    }),
  ),
);
// Accept only the documented, single-purpose exec snippet, not arbitrary code containing a tool name.
const imageExec =
  /^\s*const imageResult = await tools\.view_image\(\{path: ("(?:[^"\\]|\\.)*")\}\); image\(imageResult\.image_url\);\s*$/;
export function inspectionRequest(value: unknown): { callId: string; path: string } | null {
  if (!isToolItem(value) || !value.call_id) return null;
  try {
    if (value.type === "function_call" && value.name === "view_image" && value.arguments) {
      return { callId: value.call_id, path: decodeArguments(value.arguments).path };
    }
    if (value.type === "custom_tool_call" && value.name === "exec" && value.input) {
      const match = imageExec.exec(value.input);
      if (match?.[1]) return { callId: value.call_id, path: decodeString(match[1]) };
    }
  } catch {
    return null;
  }
  return null;
}
export function inspectionResult(value: unknown): string | null {
  if (
    !isToolItem(value) ||
    !value.call_id ||
    !["function_call_output", "custom_tool_call_output"].includes(value.type) ||
    !isOutput(value.output)
  )
    return null;
  const output = value.output;
  if (
    output.some(
      (part) =>
        part.type === "input_text" &&
        /script failed|script error|unable to process image/i.test(part.text ?? ""),
    )
  )
    return null;
  return output.some(
    (part) =>
      part.type === "input_image" &&
      /^data:image\/(?:png|jpeg|webp);base64,/.test(part.image_url ?? ""),
  )
    ? value.call_id
    : null;
}
