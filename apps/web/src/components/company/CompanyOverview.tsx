import {
  ArrowRightIcon,
  CheckIcon,
  FileTextIcon,
  ImageIcon,
  SearchIcon,
  ShieldCheckIcon,
} from "lucide-react";
import type { CompanySnapshot, CompanyTask } from "@t3tools/contracts";
import { Button } from "../ui/button";
import { CompanyTaskFlow, companyStageName } from "./CompanyBusinessPage";
import { companyFlowStages as stages, getCompanyFlowNodeState } from "./companyFlow";

export const stageNames = { research: "研究", copy: "文案", design: "设计", review: "独立审核" };
export const stateNames = {
  queued: "排队中",
  running: "进行中",
  blocked: "需要处理",
  awaiting_review: "待你验收",
  accepted: "已验收",
  stopped: "已停止",
};

const rolePresentation = {
  research: { icon: SearchIcon, output: "来源与研究结论", handoff: "先核实信息，再交给文案" },
  copy: { icon: FileTextIcon, output: "标题、正文与页面脚本", handoff: "基于研究写作，交给设计" },
  design: { icon: ImageIcon, output: "封面与内页图片", handoff: "交付实际图片，送独立审核" },
  review: { icon: ShieldCheckIcon, output: "逐项审核报告", handoff: "检查文案和图片，再交你总审" },
};

export function CompanyOverview({
  data,
  onOpenTask,
  onTeam,
  onFlow,
  onCreate,
  onEnable,
  onRefresh,
  creationDisabled,
  enableDisabled,
}: {
  data: CompanySnapshot;
  onOpenTask: (task: CompanyTask) => void;
  onTeam: () => void;
  onFlow: () => void;
  onCreate: () => void;
  onEnable: () => unknown;
  onRefresh: () => unknown;
  creationDisabled: boolean;
  enableDisabled: boolean;
}) {
  const attention = data.tasks.filter(
    (t) => t.state === "blocked" || t.state === "awaiting_review",
  );
  const running = data.tasks.filter((t) => t.state === "running" || t.state === "queued");
  const accepted = data.tasks.filter((t) => t.state === "accepted");
  return (
    <>
      <section
        className="grid grid-cols-3 gap-4 border-b border-border/60 pb-6"
        aria-label="任务概况"
      >
        {[
          { label: "进行中与排队", count: running.length },
          { label: "需要你处理", count: attention.length },
          { label: "已验收", count: accepted.length },
        ].map((item) => (
          <div key={item.label} className="flex flex-col gap-2">
            <span className="text-xs text-muted-foreground">{item.label}</span>
            <span className="text-3xl font-medium tabular-nums">{item.count}</span>
          </div>
        ))}
      </section>
      {(!data.tasks.length || !data.settings.enabled) && (
        <section className="grid gap-6 rounded-lg border border-border/60 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
          <div className="space-y-4">
            <div>
              <p className="text-xs text-muted-foreground">从这里开始</p>
              <h3 className="mt-2 text-xl font-semibold">
                {!data.settings.enabled ? "启用小红书内容制作" : "把第一项内容任务交给团队"}
              </h3>
              <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">
                这是自媒体获客与运营下的小红书内容工作台。你提出需求，四个岗位依次完成研究、文案、设计和审核，最后由你验收。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {!data.settings.enabled ? (
                <Button disabled={enableDisabled} onClick={() => onEnable()}>
                  启用团队派工
                  <ArrowRightIcon className="size-3.5" />
                </Button>
              ) : (
                <Button disabled={creationDisabled} onClick={onCreate}>
                  创建第一个任务
                  <ArrowRightIcon className="size-3.5" />
                </Button>
              )}
              <Button variant="ghost" onClick={onFlow}>
                先看流程图
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {!data.settings.enabled
                ? "启用后才接受新任务；已有排队任务会继续。"
                : "提交任务才开始调用模型；空闲时不会持续调用模型。"}
            </p>
          </div>
          <ol className="space-y-4 border-t border-border/60 pt-5 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
            {[
              { title: "描述任务", body: "写明主题、受众和想要的成果" },
              { title: "团队接力", body: "在任务页查看进度和阻塞原因" },
              { title: "验收成果", body: "查看成品，确认或提出局部修改" },
            ].map((step, index) => (
              <li key={step.title} className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs tabular-nums">
                  {index + 1}
                </span>
                <div>
                  <p className="text-sm font-medium">{step.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
      {!data.workflow && (
        <p role="alert" className="rounded-lg border border-destructive/40 p-4 text-sm">
          团队规则未加载，暂时无法开始制作。请在“设置”中检查规则位置。
        </p>
      )}
      {data.settings.enabled && data.connection !== "online" && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 p-4"
        >
          <p className="text-sm">
            {data.connection === "offline"
              ? "暂时无法连接 Herdr 执行器，任务状态需要核对。"
              : "正在连接 Herdr 执行器，就绪后可以创建任务。"}
          </p>
          <Button variant="outline" size="sm" onClick={() => onRefresh()}>
            刷新状态
          </Button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span>研究 → 文案 → 设计 → 独立审核 → 你验收</span>
        <Button size="sm" variant="ghost" onClick={onFlow}>
          查看流程图
        </Button>
        <Button size="sm" variant="ghost" onClick={onTeam}>
          团队分工
        </Button>
      </div>
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">需要你处理</h3>
          <span className="text-xs text-muted-foreground">{attention.length} 项</span>
        </div>
        {attention.length ? (
          <div className="divide-y divide-border/60 rounded-lg border border-border/60">
            {attention.map((task) => (
              <div key={task.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{task.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {task.reason ?? "制作和独立审核已完成，等待你查看成果。"}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => onOpenTask(task)}>
                  {task.state === "awaiting_review" ? "查看并验收" : "处理阻塞"}
                  <ArrowRightIcon className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-border/60 px-4 py-5 text-sm text-muted-foreground">
            暂时没有需要你处理的事项。验收请求和执行问题会集中出现在这里。
          </p>
        )}
      </section>
      {data.tasks.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-medium">最近任务</h3>
          <div className="divide-y divide-border/60">
            {data.tasks.slice(0, 6).map((task) => (
              <button
                key={task.id}
                onClick={() => onOpenTask(task)}
                className="flex w-full items-center gap-4 rounded-md px-2 py-4 text-left outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{task.title}</span>
                <span className="hidden text-xs text-muted-foreground sm:block">
                  {companyStageName(task)}
                </span>
                <span className="text-xs text-muted-foreground">{stateNames[task.state]}</span>
                <ArrowRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

export function CompanyTeam({
  data,
  onCreate,
  creationDisabled,
}: {
  data: CompanySnapshot;
  onCreate: () => void;
  creationDisabled: boolean;
}) {
  return (
    <>
      <section className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">小红书内容团队</h3>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            首版已配好四个岗位，创建任务后自动接力，无需逐个启动 Agent。当前四个岗位均使用
            Codex，各阶段使用独立任务会话。
          </p>
        </div>
        <Button variant="outline" disabled={creationDisabled} onClick={onCreate}>
          使用这支团队
        </Button>
      </section>
      <div className="grid gap-4 sm:grid-cols-2">
        {stages.map((stage, index) => {
          const role = data.workflow?.stages[stage];
          const presentation = rolePresentation[stage];
          const Icon = presentation.icon;
          return (
            <section key={stage} className="space-y-4 rounded-lg border border-border/60 p-5">
              <div className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-lg bg-muted">
                  <Icon className="size-4 text-muted-foreground" />
                </span>
                <div className="flex-1">
                  <h4 className="text-sm font-medium">{stageNames[stage]}</h4>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Codex · 第 {index + 1} 阶段
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">0{index + 1}</span>
              </div>
              <p className="text-sm">{presentation.output}</p>
              <p className="text-xs text-muted-foreground">{presentation.handoff}</p>
              <details className="border-t border-border/60 pt-3">
                <summary className="cursor-pointer text-xs text-muted-foreground">
                  职责、验收与关联技能
                </summary>
                <div className="mt-3 space-y-3 text-xs leading-relaxed">
                  <p>{role?.responsibility ?? "规则尚未加载"}</p>
                  <p className="text-muted-foreground">验收：{role?.acceptance ?? "等待规则"}</p>
                  <ul className="space-y-1 break-all text-muted-foreground">
                    {role?.skills.map((skill) => (
                      <li key={skill}>{skill}</li>
                    ))}
                  </ul>
                </div>
              </details>
            </section>
          );
        })}
      </div>
      <section className="flex items-start gap-3 rounded-lg bg-muted/40 p-4">
        <ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div>
          <h3 className="text-sm font-medium">你负责最终验收</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            团队内部审核后，成果仍会回到你这里。局部修改沿用有效的研究和成品；内容变化后，相关旧审批失效。
          </p>
        </div>
      </section>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">能换模型或自己配队吗？</summary>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          当前只接通 Codex 执行和这套四阶段流程，暂不支持在面板中自由增删岗位或混用其他
          Provider。岗位职责与验收标准来自 AI-Agent-System；面板展示当前真实配置。
        </p>
      </details>
    </>
  );
}

export function StageProgress({ task }: { task: CompanySnapshot["tasks"][number] }) {
  if (task.plan) return <CompanyTaskFlow task={task} />;
  return (
    <ol aria-label="制作阶段" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {stages.map((stage, index) => {
        const status = getCompanyFlowNodeState(task, stage);
        const complete = status === "done" || status === "reused";
        const current = !complete && status !== "pending";
        return (
          <li
            key={stage}
            aria-current={current ? "step" : undefined}
            className={`flex items-center gap-2 rounded-md px-3 py-2.5 text-xs ${complete ? "bg-muted/50" : current ? "bg-accent font-medium" : "text-muted-foreground"}`}
          >
            {complete ? (
              <CheckIcon aria-hidden className="size-3.5" />
            ) : (
              <span className="tabular-nums">{index + 1}</span>
            )}
            {stageNames[stage]}
            {status === "reused" ? " · 复用" : ""}
          </li>
        );
      })}
    </ol>
  );
}
