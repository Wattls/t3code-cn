import { useId, useState } from "react";
import {
  ArrowDownIcon,
  ArrowRightIcon,
  CheckIcon,
  FileTextIcon,
  ImageIcon,
  SearchIcon,
  ShieldCheckIcon,
  UserRoundIcon,
  CornerUpLeftIcon,
  NetworkIcon,
} from "lucide-react";
import type { CompanyChangeScope, CompanySnapshot, CompanyTask } from "@t3tools/contracts";
import { Button } from "../ui/button";
import { Select, SelectTrigger, SelectValue, SelectPopup, SelectItem } from "../ui/select";
import {
  companyFlowImpact,
  getCompanyFlowNodeState,
  type CompanyFlowNode,
  type CompanyFlowState,
} from "./companyFlow";
import { stageNames, stateNames } from "./CompanyOverview";

const nodes = [
  {
    id: "brief",
    title: "提出需求",
    owner: "你",
    output: "主题、受众与交付要求",
    icon: UserRoundIcon,
    position: "md:col-start-1 md:row-start-1",
  },
  {
    id: "research",
    title: "研究",
    owner: "Codex · 研究岗",
    output: "信息来源与研究结论",
    icon: SearchIcon,
    position: "md:col-start-2 md:row-start-1",
  },
  {
    id: "copy",
    title: "文案",
    owner: "Codex · 文案岗",
    output: "标题、正文与页面脚本",
    icon: FileTextIcon,
    position: "md:col-start-3 md:row-start-1",
  },
  {
    id: "design",
    title: "设计",
    owner: "Codex · 设计岗",
    output: "封面与内页图片",
    icon: ImageIcon,
    position: "md:col-start-3 md:row-start-2",
  },
  {
    id: "review",
    title: "独立审核",
    owner: "Codex · 审核岗",
    output: "逐图检查与审核报告",
    icon: ShieldCheckIcon,
    position: "md:col-start-2 md:row-start-2",
  },
  {
    id: "approval",
    title: "最终验收",
    owner: "你",
    output: "确认成品或提出修改",
    icon: CheckIcon,
    position: "md:col-start-1 md:row-start-2",
  },
] as const;
const stateLabels: Record<CompanyFlowState, string> = {
  template: "流程节点",
  pending: "尚未完成",
  done: "成果有效",
  reused: "复用已有成果",
  running: "正在执行",
  queued: "等待派工",
  blocked: "受阻",
  stopped: "已停止",
  takeover: "人工接管",
  awaiting_review: "待你验收",
};
const stateStyles: Record<CompanyFlowState, string> = {
  template: "border-border/60",
  pending: "border-border/60",
  done: "border-success/40",
  reused: "border-success/40",
  running: "border-primary/60 bg-primary/5",
  queued: "border-primary/40",
  blocked: "border-destructive/60 bg-destructive/5",
  stopped: "border-border border-dashed",
  takeover: "border-warning/60 bg-warning/5",
  awaiting_review: "border-primary/60 bg-primary/5",
};
const scopeLabels = { cover: "只改封面", copy: "修改文案", facts: "核心事实变化" };
const scopeDescriptions = {
  cover: "保留研究、正文和内页；只重做封面，再进行独立审核和最终验收。",
  copy: "保留研究，重做文案与设计，再进行独立审核和最终验收。",
  facts: "从研究重新开始，所有受影响的下游成果与旧审批失效。",
};

export function CompanyFlowPage({
  data,
  initialTaskId,
  onOpenTask,
  onCreate,
  onHome,
  creationDisabled,
}: {
  data: CompanySnapshot;
  initialTaskId: string | null;
  onOpenTask: (task: CompanyTask, view: "进度" | "成果与验收") => void;
  onCreate: () => void;
  onHome: () => void;
  creationDisabled: boolean;
}) {
  const [taskId, setTaskId] = useState(initialTaskId ?? "template");
  const task = data.tasks.find((item) => item.id === taskId && !item.plan) ?? null;
  const [selection, setSelection] = useState<CompanyFlowNode | null>(null);
  const [impact, setImpact] = useState<CompanyChangeScope | null>(null);
  const selectedNode: CompanyFlowNode =
    selection ??
    (task
      ? task.state === "accepted" || task.state === "awaiting_review"
        ? "approval"
        : (task.stage as CompanyFlowNode)
      : "brief");
  const node = nodes.find((item) => item.id === selectedNode)!;
  const role =
    selectedNode !== "brief" && selectedNode !== "approval"
      ? data.workflow?.stages[selectedNode]
      : null;
  const artifacts =
    task?.artifacts.filter(
      (artifact) =>
        artifact.valid && (selectedNode === "approval" || artifact.stage === selectedNode),
    ) ?? [];
  const detailId = useId();
  return (
    <>
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">从一个需求，到一份可验收的成果</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            沿箭头看接力顺序。点击节点，查看谁负责、交付什么、怎么验收。
          </p>
        </div>
        <Select
          value={taskId}
          onValueChange={(value) => {
            setTaskId(value ?? "template");
            setSelection(null);
            setImpact(null);
          }}
        >
          <SelectTrigger aria-label="查看流程说明或任务进度" size="sm" className="w-full sm:w-64">
            <SelectValue>{task?.title ?? "流程说明 · 未运行"}</SelectValue>
          </SelectTrigger>
          <SelectPopup>
            <SelectItem value="template">流程说明 · 未运行</SelectItem>
            {data.tasks
              .filter((item) => !item.plan)
              .map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.title}
                </SelectItem>
              ))}
          </SelectPopup>
        </Select>
      </section>
      <section
        className="overflow-hidden rounded-xl border border-border/60"
        aria-label="内容制作流程图"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-muted/25 px-5 py-3">
          <span className="text-xs text-muted-foreground">
            {task
              ? `任务进度 · ${stateNames[task.state]} · v${task.revision}`
              : "流程说明 · 以下节点仅作说明，尚未运行"}
          </span>
          {impact && (
            <span className="text-xs text-warning-foreground">
              预览：{scopeLabels[impact]} · 不执行
            </span>
          )}
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="size-1.5 rounded-full bg-success" />
              有效成果
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="size-1.5 rounded-full bg-primary" />
              当前阶段
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="size-1.5 rounded-full bg-destructive" />
              受阻
            </span>
          </div>
        </div>
        <div className="p-5 sm:p-6">
          <div className="relative">
            <ol className="relative grid grid-cols-1 gap-y-10 md:grid-cols-3 md:gap-x-8 md:gap-y-12">
              {nodes.map((item, index) => {
                const status = getCompanyFlowNodeState(task, item.id);
                const affected = impact !== null && companyFlowImpact[impact].includes(item.id);
                const Icon = item.icon;
                return (
                  <li key={item.id} className={`relative min-w-0 ${item.position}`}>
                    <button
                      type="button"
                      aria-pressed={selectedNode === item.id}
                      aria-controls={detailId}
                      onClick={() => setSelection(item.id)}
                      className={`flex h-34 w-full flex-col justify-between rounded-lg border bg-background p-4 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${stateStyles[status]} ${selectedNode === item.id ? "ring-2 ring-inset ring-primary/60" : ""}`}
                    >
                      <span className="flex w-full items-center gap-2">
                        <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                        <span className="text-sm font-medium">{item.title}</span>
                        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                          0{index + 1}
                        </span>
                      </span>
                      <span className="text-xs text-muted-foreground">{item.output}</span>
                      <span className="flex w-full items-center justify-between gap-1 text-xs">
                        <span
                          className={
                            status === "blocked" ? "text-destructive" : "text-muted-foreground"
                          }
                        >
                          {status === "done" && item.id === "brief"
                            ? "需求已提交"
                            : status === "done" && item.id === "approval"
                              ? "已验收"
                              : stateLabels[status]}
                        </span>
                        {impact && !affected && item.id !== "brief" && (
                          <span className="rounded bg-success/10 px-1.5 py-0.5 text-success-foreground">
                            可保留
                          </span>
                        )}
                        {affected && (
                          <span className="rounded bg-warning/15 px-1.5 py-0.5 text-warning-foreground">
                            {item.id === "approval"
                              ? "重新验收"
                              : impact === "cover" && item.id === "design"
                                ? "仅封面"
                                : "需重做"}
                          </span>
                        )}
                      </span>
                    </button>
                    {index < nodes.length - 1 && (
                      <span
                        aria-hidden
                        className={`pointer-events-none absolute hidden items-center justify-center text-muted-foreground/50 md:flex ${index < 2 ? "-right-8 top-1/2 w-8 -translate-y-1/2" : index === 2 ? "-bottom-12 left-1/2 h-12 -translate-x-1/2" : "-left-8 top-1/2 w-8 -translate-y-1/2"}`}
                      >
                        {index === 2 ? (
                          <ArrowDownIcon className="size-5" />
                        ) : (
                          <ArrowRightIcon className={`size-5 ${index > 2 ? "rotate-180" : ""}`} />
                        )}
                      </span>
                    )}
                    {index < nodes.length - 1 && (
                      <ArrowDownIcon
                        aria-hidden
                        className="absolute -bottom-7 left-1/2 size-4 -translate-x-1/2 text-muted-foreground/50 md:hidden"
                      />
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground">
            <CornerUpLeftIcon aria-hidden className="size-3.5" />
            <span>独立审核不通过</span>
            <ArrowRightIcon aria-hidden className="size-3" />
            <span>退回相关岗位</span>
            <ArrowRightIcon aria-hidden className="size-3" />
            <span>再次审核</span>
            <span className="ml-auto">
              {task ? `已自动返工 ${task.reworkCount} / 3 轮` : "自动返工最多 3 轮"}
            </span>
          </div>
        </div>
      </section>
      {task?.reason && (
        <p role="status" className="rounded-lg border border-destructive/40 p-3 text-sm">
          {stageNames[task.stage as keyof typeof stageNames]}阶段：{task.reason}
        </p>
      )}
      <section
        id={detailId}
        aria-label={`${node.title}节点详情`}
        className="grid gap-5 rounded-lg border border-border/60 p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
      >
        <div>
          <p className="text-xs text-muted-foreground">当前选中 · {node.owner}</p>
          <h3 className="mt-1 text-lg font-semibold">{node.title}</h3>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {selectedNode === "brief"
              ? (task?.brief ??
                "描述主题、受众、风格与交付要求。提交任务后，团队在授权范围内连续完成内部制作。")
              : selectedNode === "approval"
                ? "你查看文案、图片和审核报告，验收当前版本，或者提出局部修改。验收通过不会自动发布或对外发送。"
                : (role?.responsibility ?? "团队规则尚未加载，请在设置中检查规则源。")}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {task ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    onOpenTask(
                      task,
                      selectedNode === "approval" || artifacts.length ? "成果与验收" : "进度",
                    )
                  }
                >
                  {selectedNode === "approval"
                    ? "查看成果与验收"
                    : artifacts.length
                      ? "查看全部成果"
                      : "打开任务详情"}
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={data.settings.enabled ? onCreate : onHome}
                disabled={data.settings.enabled && creationDisabled}
              >
                {data.settings.enabled ? "使用这套流程" : "返回工作台启用"}
              </Button>
            )}
          </div>
        </div>
        <div className="space-y-4 md:border-l md:border-border/60 md:pl-5">
          <div>
            <h4 className="text-xs font-medium">交付与验收</h4>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {selectedNode === "brief"
                ? "需要清楚的任务名称、目标要求和图片数量；私人资料由你明确指定。"
                : selectedNode === "approval"
                  ? "总审绑定当前成果版本。相关内容变化后，旧审批失效，需要再次验收。"
                  : (role?.acceptance ?? "等待规则源加载后显示。")}
            </p>
          </div>
          {task && selectedNode !== "brief" && (
            <div>
              <h4 className="text-xs font-medium">仍有效的成果 · {artifacts.length}</h4>
              {artifacts.length ? (
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {artifacts.map((artifact) => (
                    <li className="break-all" key={artifact.id}>
                      {artifact.name}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                  此节点暂无有效成果。进程结束不代表成果已验收。
                </p>
              )}
            </div>
          )}
        </div>
      </section>
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-medium">如果要修改，会从哪里重做？</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            影响预览只用于理解流程，不会修改任务或调用模型。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={impact === null ? "secondary" : "outline"}
            aria-pressed={impact === null}
            onClick={() => setImpact(null)}
          >
            不预览
          </Button>
          {(["cover", "copy", "facts"] as const).map((scope) => (
            <Button
              key={scope}
              size="sm"
              variant={impact === scope ? "secondary" : "outline"}
              aria-pressed={impact === scope}
              onClick={() => setImpact(scope)}
            >
              {scopeLabels[scope]}
            </Button>
          ))}
        </div>
        {impact && (
          <p role="status" className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
            {scopeDescriptions[impact]}图中标记的是受影响的阶段；修改后相关旧审批失效。
          </p>
        )}
      </section>
      <details className="rounded-lg border border-border/60 p-5">
        <summary className="cursor-pointer text-sm font-medium">T3、Herdr 和记忆怎样配合？</summary>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {[
            { title: "01 · 你在 T3 安排工作", body: "提交需求、看进度、反馈修改和验收成果。" },
            { title: "02 · 常驻后台管理任务", body: "负责排队、授权、去重、检查点、预算与恢复。" },
            {
              title: "03 · Herdr 托管执行",
              body: "按岗位启动 Codex，保留执行现场，并支持人工接管。",
            },
            { title: "04 · 成果回到 T3", body: "真实成果经过独立审核，再回到你这里验收。" },
          ].map((layer) => (
            <div key={layer.title} className="rounded-lg bg-muted/30 p-4">
              <p className="text-sm font-medium">{layer.title}</p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{layer.body}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <NetworkIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          岗位规则来自 AI-Agent-System，指定资料来自
          LLM-Wiki；任务状态、有效成果和已确认记忆随任务保留。后续修改回到原任务，只重做受影响阶段。
        </p>
      </details>
    </>
  );
}
