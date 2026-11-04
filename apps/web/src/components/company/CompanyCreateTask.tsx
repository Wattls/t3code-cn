import { useState } from "react";
import type { CompanyCommand, CompanySnapshot } from "@t3tools/contracts";
import { randomUUID } from "../../lib/utils";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogPopup,
  DialogPanel,
  DialogFooter,
} from "../ui/dialog";

export function CompanyCreateTask({
  data,
  initialWorkflowId,
  busy,
  disabled,
  onClose,
  onCreate,
}: {
  data: CompanySnapshot;
  initialWorkflowId: string;
  busy: boolean;
  disabled: boolean;
  onClose: () => void;
  onCreate: (input: Extract<CompanyCommand, { type: "create" }>) => Promise<boolean>;
}) {
  const [workflowId, setWorkflowId] = useState(initialWorkflowId);
  const workflows = data.organization?.workflows?.filter((flow) => flow.enabled) ?? [];
  const workflow = workflows.find((flow) => flow.id === workflowId);
  const legacy = workflowId === "rednote";
  const unavailable = disabled || busy || (legacy ? !data.workflow : !workflow);
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [images, setImages] = useState(3);
  const [references, setReferences] = useState("");
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogPopup className="max-w-xl">
        <DialogHeader>
          <DialogTitle>新建公司任务</DialogTitle>
          <DialogDescription>选择工作流程，交给对应团队，完成后回到这里验收。</DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <form
            id="company-create-task"
            className="space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              if (unavailable || !title.trim() || !brief.trim()) return;
              if (
                await onCreate({
                  type: "create",
                  commandId: randomUUID(),
                  title: title.trim(),
                  brief: brief.trim(),
                  expectedImages: legacy ? images : 0,
                  workflowId,
                  ...(!legacy && workflow ? { departmentId: workflow.departmentId } : {}),
                  references: references
                    .split("\n")
                    .map((item) => item.trim())
                    .filter(Boolean),
                })
              )
                onClose();
            }}
          >
            <fieldset disabled={busy} className="space-y-4">
              <label className="flex flex-col gap-2 text-sm">
                业务流程
                <select
                  value={workflowId}
                  onChange={(event) => setWorkflowId(event.target.value)}
                  className="w-full rounded-md border border-input bg-background p-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <option value="rednote">自媒体获客与运营 · 小红书内容制作</option>
                  {workflows.map((flow) => (
                    <option key={flow.id} value={flow.id}>
                      {data.organization?.nodes.find((node) => node.id === flow.departmentId)?.name}{" "}
                      · {flow.name}
                    </option>
                  ))}
                </select>
              </label>
              {workflow && (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {workflow.steps
                    .map(
                      (step) =>
                        `${step.name}（${data.organization?.nodes.find((node) => node.id === step.employeeId)?.name ?? "员工"}）`,
                    )
                    .join(" → ")}{" "}
                  → 你的最终验收
                </p>
              )}
              <label className="flex flex-col gap-2 text-sm">
                任务名称
                <Input
                  nativeInput
                  required
                  maxLength={200}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="例如：整理一份产品需求方案"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm">
                你希望交付什么？
                <Textarea
                  required
                  maxLength={16000}
                  rows={5}
                  value={brief}
                  onChange={(e) => setBrief(e.target.value)}
                  placeholder="告诉团队：服务谁、目标是什么、希望什么形式，以及必须满足的要求。"
                />
              </label>
              {legacy && (
                <fieldset className="space-y-2">
                  <legend className="text-sm">图片数量（包含封面）</legend>
                  <div className="flex flex-wrap items-center gap-2">
                    {[3, 5, 9].map((count) => (
                      <Button
                        type="button"
                        key={count}
                        size="sm"
                        variant={images === count ? "secondary" : "outline"}
                        aria-pressed={images === count}
                        onClick={() => setImages(count)}
                      >
                        {count} 张
                      </Button>
                    ))}
                    <Input
                      nativeInput
                      aria-label="自定义图片数量"
                      type="number"
                      min={1}
                      max={20}
                      required
                      value={images}
                      onChange={(e) => setImages(Number(e.target.value))}
                      className="w-20"
                    />
                  </div>
                </fieldset>
              )}
              <details className="rounded-lg border border-border/60 p-3">
                <summary className="cursor-pointer text-xs text-muted-foreground">
                  引用自己的资料（可选）
                </summary>
                <label className="mt-3 flex flex-col gap-2 text-xs text-muted-foreground">
                  填写相对于 LLM-Wiki 的文本文件路径，每行一个。只共享你列出的文件。
                  <Textarea
                    rows={2}
                    value={references}
                    onChange={(e) => setReferences(e.target.value)}
                    placeholder="留空即不读取私人知识库资料"
                  />
                </label>
              </details>
              <p className="text-xs leading-relaxed text-muted-foreground">
                任务按所选流程连续执行，固定当前员工、模型与技能配置。仅授权内部制作，不包含发布、外发或新增付费。
              </p>
              {unavailable && !busy && (
                <p role="status" className="text-xs text-muted-foreground">
                  后台或所选流程尚未就绪、派工已暂停或当前权限不足。填写的内容会保留，恢复后可以提交。
                </p>
              )}
            </fieldset>
          </form>
        </DialogPanel>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            取消
          </Button>
          <Button
            form="company-create-task"
            type="submit"
            disabled={unavailable || !title.trim() || !brief.trim()}
          >
            {busy ? "正在提交…" : "开始内部制作"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
