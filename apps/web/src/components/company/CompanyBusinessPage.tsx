import { useState } from "react";
import { ArrowDownIcon, ArrowRightIcon } from "lucide-react";
import type { CompanySnapshot, CompanyTask } from "@t3tools/contracts";
import { Button } from "../ui/button";

export function companyStageName(task: CompanyTask, stage = task.stage) {
  return (
    task.plan?.steps.find((step) => step.id === stage)?.name ??
    (
      { research: "研究", copy: "文案", design: "设计", review: "独立审核" } as Record<
        string,
        string
      >
    )[stage] ??
    stage
  );
}
export function CompanyTaskFlow({ task }: { task: CompanyTask }) {
  const [selected, setSelected] = useState(task.stage);
  const step = task.plan?.steps.find((item) => item.id === selected);
  if (!task.plan) return null;
  return (
    <section className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {task.plan.departmentName} / {task.plan.name} · 使用创建任务时的配置
      </p>
      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {task.plan.steps.map((item, index) => {
          const artifacts = task.artifacts.filter(
            (artifact) => artifact.stage === item.id && artifact.valid,
          );
          const current =
            task.stage === item.id && !["accepted", "awaiting_review"].includes(task.state);
          const complete = artifacts.length === item.outputFiles.length;
          const reused =
            complete &&
            artifacts.every((artifact) =>
              task.runs.some((run) => run.id === artifact.runId && run.revision < task.revision),
            );
          return (
            <li key={item.id}>
              <button
                type="button"
                aria-pressed={selected === item.id}
                onClick={() => setSelected(item.id)}
                className={`h-full w-full rounded-md border p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${selected === item.id ? "border-primary/60 bg-primary/5" : "border-border/60 hover:bg-muted/50"}`}
              >
                <span className="block text-xs text-muted-foreground">
                  {index + 1} ·{" "}
                  {current
                    ? task.takeover
                      ? "人工接管"
                      : task.state === "blocked"
                        ? "受阻"
                        : task.state === "stopped"
                          ? "已停止"
                          : task.state === "running"
                            ? "执行中"
                            : "排队中"
                    : reused
                      ? "复用成果"
                      : complete
                        ? "成果有效"
                        : "待执行"}
                </span>
                <span className="mt-1 block text-sm font-medium">{item.name}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {item.employeeName}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {step && (
        <details key={step.id} open className="rounded-md border border-border/60 p-3">
          <summary className="cursor-pointer text-sm">
            {step.name} · {step.employeeName}
          </summary>
          <div className="mt-3 space-y-2 text-xs leading-relaxed text-muted-foreground">
            <p>{step.instructions}</p>
            <p>验收：{step.acceptance}</p>
            <p>
              模型：{step.execution.model} · {step.execution.effort}
            </p>
            <p className="break-all">交付：{step.outputFiles.join("、")}</p>
          </div>
        </details>
      )}
      <p className="text-xs text-muted-foreground">
        全部阶段完成后由你最终验收；发布与付费需另行授权。
      </p>
    </section>
  );
}

export function CompanyBusinessPage({
  data,
  disabled,
  canConfigure,
  onCreate,
  onConfigure,
  onLegacy,
}: {
  data: CompanySnapshot;
  disabled: boolean;
  canConfigure: boolean;
  onCreate: (workflowId: string) => void;
  onConfigure: () => void;
  onLegacy: () => void;
}) {
  const [department, setDepartment] = useState("");
  const [selected, setSelected] = useState("");
  const flows = data.organization?.workflows ?? [];
  let channelDepartment = data.organization?.nodes.find((node) => node.workflow === "rednote");
  while (channelDepartment && channelDepartment.kind !== "department")
    channelDepartment = data.organization?.nodes.find(
      (node) => node.id === channelDepartment?.parentId,
    );
  const active = flows.find((flow) => flow.id === selected);
  return (
    <>
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">按部门安排业务</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            选择工作流程即可派工。每个阶段按配置交给负责人，工作完成后统一回到任务页验收。
          </p>
        </div>
        <Button variant="outline" disabled={!canConfigure} onClick={onConfigure}>
          配置团队与流程
        </Button>
      </section>
      <label className="flex items-center gap-3 text-sm">
        部门
        <select
          value={department}
          onChange={(event) => setDepartment(event.target.value)}
          className="rounded-md border border-input bg-background p-2 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <option value="">全部部门</option>
          {data.organization?.nodes
            .filter((node) => node.kind === "department")
            .map((node) => (
              <option key={node.id} value={node.id}>
                {node.name}
              </option>
            ))}
        </select>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        {(!department || department === channelDepartment?.id) && (
          <section className="space-y-3 rounded-lg border border-border/60 p-5">
            <p className="text-xs text-muted-foreground">自媒体获客与运营 · 内置模板</p>
            <h4 className="text-base font-medium">小红书内容制作</h4>
            <p className="text-xs leading-relaxed text-muted-foreground">
              研究 → 文案 → 设计 → 独立审核。保留图片数量、真实逐图检查及局部复用规则。
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={disabled || !data.workflow}
                onClick={() => onCreate("rednote")}
              >
                新建任务
              </Button>
              <Button size="sm" variant="ghost" onClick={onLegacy}>
                查看流程
                <ArrowRightIcon className="size-3" />
              </Button>
            </div>
          </section>
        )}
        {flows
          .filter((flow) => !department || flow.departmentId === department)
          .map((flow) => (
            <section key={flow.id} className="space-y-3 rounded-lg border border-border/60 p-5">
              <p className="text-xs text-muted-foreground">
                {data.organization?.nodes.find((node) => node.id === flow.departmentId)?.name} ·{" "}
                {flow.enabled ? "已启用" : "未启用"}
              </p>
              <h4 className="text-base font-medium">{flow.name}</h4>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {flow.steps.map((step) => step.name).join(" → ")}
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={disabled || !flow.enabled}
                  onClick={() => onCreate(flow.id)}
                >
                  新建任务
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelected(flow.id)}>
                  查看流程
                  <ArrowRightIcon className="size-3" />
                </Button>
              </div>
            </section>
          ))}
      </div>
      {!flows.length && (
        <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
          还没有自定义业务流程。先添加员工并配置模型，再将员工安排到流程的各个阶段。
        </p>
      )}
      {active && (
        <section className="space-y-4 rounded-lg border border-border/60 p-5">
          <h3 className="text-base font-medium">{active.name} · 流程预览</h3>
          <ol className="space-y-3">
            {active.steps.map((step, index) => (
              <li key={step.id}>
                {index > 0 && (
                  <ArrowDownIcon
                    aria-hidden
                    className="mx-auto mb-3 size-4 text-muted-foreground"
                  />
                )}
                <div className="rounded-md bg-muted/40 p-4">
                  <p className="text-sm font-medium">
                    {index + 1}. {step.name} ·{" "}
                    {data.organization?.nodes.find((node) => node.id === step.employeeId)?.name}
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    {step.instructions}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">验收：{step.acceptance}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="text-xs text-muted-foreground">
            最后交你验收。此处为流程配置，真实执行进度见任务页。
          </p>
        </section>
      )}
    </>
  );
}
