import { describe, expect, it } from "vite-plus/test";
import remarkParse from "remark-parse";
import { unified } from "unified";

import {
  remarkCodexDirectives,
  renderCodexDirectivesForCopy,
  renderCodexInlineDirectivesAsMarkdown,
  splitCodexArtifactTemplateMarkdown,
} from "./codexMarkdownDirectives.ts";
import { parseMarkdownFileLink } from "./markdownLinks.ts";

interface TestNode {
  readonly type: string;
  readonly value?: string;
  readonly url?: string;
  readonly position?: {
    readonly start: { readonly offset?: number };
    readonly end: { readonly offset?: number };
  };
  readonly data?: {
    readonly hName?: string;
    readonly hProperties?: Readonly<Record<string, unknown>>;
  };
  readonly children?: readonly TestNode[];
}

const FILE_CITATION = ':codex-file-citation{path="outputs/report.xlsx" purpose="output"}';
const FOLLOW_UP =
  ':codex-followup[Prepare print version]{prompt="Prepare the document for printing."}';
const ARTIFACT_TEMPLATE =
  '::artifact-template{skill_name="artifact-template-hello-world" skill_directory="/Users/test/.codex/skills/artifact-template-hello-world" display_name="Hello World" artifact_kind="document"}';

function parse(markdown: string): TestNode {
  const processor = unified().use(remarkParse).use(remarkCodexDirectives);
  return processor.runSync(processor.parse(markdown), { value: markdown }) as TestNode;
}

function parseOrdinaryMarkdown(markdown: string): TestNode {
  return unified().use(remarkParse).parse(markdown) as TestNode;
}

describe("remarkCodexDirectives", () => {
  it("renders web citation markers as readable source placeholders and normalizes copied text", () => {
    const marker = "\uE200cite\uE202turn673781view0\uE202turn673781view1\uE201";
    const markdown = `**说明**：正文。${marker} [官方说明](https://example.com)`;
    const paragraph = parse(markdown).children?.[0];
    expect(paragraph?.children).toContainEqual(
      expect.objectContaining({
        type: "text",
        value: "[Source]",
        data: expect.objectContaining({
          hName: "sup",
          hProperties: { dataCodexWebCitation: "true" },
        }),
      }),
    );
    expect(renderCodexDirectivesForCopy(markdown)).toBe(
      "**说明**：正文。[Source] [官方说明](https://example.com)",
    );
    expect(renderCodexDirectivesForCopy(`\\*前缀 &amp; ${marker}${marker}`)).toBe(
      "\\*前缀 &amp; [Source][Source]",
    );
  });

  it("keeps web citation examples in code and unrelated private-use syntax unchanged", () => {
    const marker = "\uE200cite\uE202turn0search0\uE201";
    for (const markdown of [
      `\`${marker}\``,
      `\`\`\`text\n${marker}\n\`\`\``,
      "\uE200other\uE202value\uE201",
    ]) {
      expect(parse(markdown)).toEqual(parseOrdinaryMarkdown(markdown));
      expect(renderCodexDirectivesForCopy(markdown)).toBe(markdown);
    }
  });

  it("hides unfinished web citation markers at every streaming boundary", () => {
    const marker = "\uE200cite\uE202turn673781view0\uE201";
    for (let end = 1; end < marker.length; end++) {
      expect(renderCodexDirectivesForCopy(`正文。${marker.slice(0, end)}`)).toBe("正文。");
    }
  });

  it("renders a file citation as a link without changing its source position", () => {
    const markdown = `Created ${FILE_CITATION}.`;
    const link = parse(markdown).children?.[0]?.children?.[1];

    expect(link).toMatchObject({
      type: "link",
      url: "outputs/report.xlsx",
      children: [{ type: "text", value: "report.xlsx" }],
      position: {
        start: { offset: markdown.indexOf(FILE_CITATION) },
        end: { offset: markdown.indexOf(FILE_CITATION) + FILE_CITATION.length },
      },
    });
  });

  it("renders an artifact template as semantic block metadata", () => {
    expect(parse(ARTIFACT_TEMPLATE).children?.[0]).toMatchObject({
      type: "paragraph",
      children: [],
      data: {
        hName: "div",
        hProperties: {
          dataCodexArtifactTemplate: "true",
          dataArtifactKind: "document",
          dataDisplayName: "Hello World",
          dataSkillName: "artifact-template-hello-world",
        },
      },
    });
  });

  it.each([
    "Meeting at 10:30",
    ":::note\ncontent\n:::",
    ':codex-file-citation-extra{path="outputs/report.xlsx"}',
    ':codex-followup-extra[Label]{prompt="Prompt"}',
  ])("does not change unrelated colon syntax: %s", (markdown) => {
    expect(parse(markdown)).toEqual(parseOrdinaryMarkdown(markdown));
  });

  it.each([
    ':codex-file-citation{purpose="output"}',
    ":codex-followup[Prepare print version]",
    ':codex-followup[ ]{prompt="Prepare the document for printing."}',
  ])("keeps malformed supported directives literal: %s", (markdown) => {
    expect(parse(markdown)).toEqual(parseOrdinaryMarkdown(markdown));
  });
});

describe.each([
  { name: "renderCodexDirectivesForCopy", render: renderCodexDirectivesForCopy },
  { name: "renderCodexInlineDirectivesAsMarkdown", render: renderCodexInlineDirectivesAsMarkdown },
])("$name file citation round trips", ({ render }) => {
  // regression: #12243 copied Codex citations keep their backslashes
  it.each([
    "C:\\Users\\test\\[draft]\\report.md",
    "\\\\server\\share\\report.md",
    "/tmp/report%5C.md",
  ])("preserves the literal path and line: %s", (path) => {
    const markdown = render(`:codex-file-citation{path="${path}" line_range_start="7"}`);
    const link = parseOrdinaryMarkdown(markdown).children?.[0]?.children?.[0];

    expect(link?.type).toBe("link");
    expect(parseMarkdownFileLink(link?.url ?? "")).toEqual({ path, line: 7 });
  });
});

describe("native Markdown adapters", () => {
  it("renders follow-up suggestions as their label Markdown", () => {
    expect(
      renderCodexInlineDirectivesAsMarkdown(
        `- ${FOLLOW_UP}\n- :codex-followup[Review **document**]{prompt="Review it."}`,
      ),
    ).toBe("- Prepare print version\n- Review **document**");
  });

  it.each([
    `\\${FILE_CITATION}`,
    `\`${FILE_CITATION}\``,
    `[See ${FILE_CITATION}](https://example.com)`,
  ])("does not render excluded citation syntax: %s", (markdown) => {
    expect(renderCodexInlineDirectivesAsMarkdown(markdown)).toBe(markdown);
  });

  it("splits artifact cards from surrounding native Markdown", () => {
    expect(splitCodexArtifactTemplateMarkdown(`Before\n\n${ARTIFACT_TEMPLATE}\n\nAfter`)).toEqual([
      { kind: "markdown", markdown: "Before\n\n", sourceOffset: 0 },
      {
        kind: "artifact-template",
        sourceOffset: 8,
        template: {
          artifactKind: "document",
          displayName: "Hello World",
          skillDirectory: "/Users/test/.codex/skills/artifact-template-hello-world",
          skillName: "artifact-template-hello-world",
        },
      },
      {
        kind: "markdown",
        markdown: "\n\nAfter",
        sourceOffset: 8 + ARTIFACT_TEMPLATE.length,
      },
    ]);
  });

  it("leaves malformed and code artifact-template examples in Markdown", () => {
    const malformed = '::artifact-template{display_name="Hello World"}';
    const code = `\`${ARTIFACT_TEMPLATE}\``;
    expect(splitCodexArtifactTemplateMarkdown(malformed)).toEqual([
      { kind: "markdown", markdown: malformed, sourceOffset: 0 },
    ]);
    expect(splitCodexArtifactTemplateMarkdown(code)).toEqual([
      { kind: "markdown", markdown: code, sourceOffset: 0 },
    ]);
  });
});

describe("directive copy adapter", () => {
  it("copies the Markdown representations shown by citation chips and template cards", () => {
    expect(
      renderCodexDirectivesForCopy(
        `Created ${FILE_CITATION}.\n\n${ARTIFACT_TEMPLATE}\n\n- ${FOLLOW_UP}`,
      ),
    ).toBe(
      "Created [report.xlsx](<outputs/report.xlsx>).\n\nHello World (Document template)\n\n- Prepare print version",
    );
  });
});
