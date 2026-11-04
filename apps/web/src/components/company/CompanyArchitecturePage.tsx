import { useState } from "react";
import { ArrowDownIcon, ArrowRightIcon } from "lucide-react";
import { Button } from "../ui/button";

const layers = [
  {
    title: "自动化中台",
    subtitle: "接收、筛选与派工",
    existing: "已有 T3 任务入口、持久队列、命令去重、预算限制、停止与恢复。",
    gap: "已支持按部门与所选流程确定性派工；公司级智能统筹，以及经过授权的定时、消息或 Webhook 事件入口仍待接入。",
    approval: "业务判断：对照目标、范围与已有决定。确定性规则由程序处理，复杂取舍才交统筹或你。",
    memory: "公司目标、任务索引、来源事件、授权和已确认决定。",
  },
  {
    title: "Agent 执行",
    subtitle: "负责人协调，员工交付",
    existing: "已适配 Herdr 中的 Codex，以及小红书研究、文案、设计、独立审核四阶段任务。",
    gap: "部门和员工可自由配置，通用顺序流程由 Codex 执行。公司统筹的自动规划、其他 Provider 与真实业务质量仍需逐一验证。",
    approval: "执行边界：只做已授权任务。工具权限询问留给人工处理，不自动确认。",
    memory: "岗位规则、当前任务、有效成果、增量反馈；按需读取资料，不灌入整个知识库。",
  },
  {
    title: "验收与交付",
    subtitle: "原文中的 CI 中台",
    existing: "内容试点已实现实际成果检查、独立审核证据、版本指纹、限次返工与最终总审。",
    gap: "软件业务的检查、合并、部署、线上核实尚未接通；内容发布也没有执行接口。",
    approval:
      "质量验收：按版本核对真实成果和证据。Agent 报告完成不等于验收通过；交付变更使相关审批失效。",
    memory: "成果版本、来源、审核报告、验收结论与被替代记录。",
  },
  {
    title: "人的决策",
    subtitle: "方向、授权与例外",
    existing: "已有任务级最终总审、阻塞原因、人工接管及记忆候选确认。",
    gap: "跨部门待决策收件箱、通用授权复用和决策回流仍需建设。",
    approval: "动作授权：发布、外发、新增付费和权限变更依照有效授权。质量通过本身不授予动作权限。",
    memory: "原始决定、时间、适用对象、有效范围与撤回或替代关系。",
  },
];

export function CompanyArchitecturePage({
  onOrganization,
  onChannel,
}: {
  onOrganization: () => void;
  onChannel: () => void;
}) {
  const [selected, setSelected] = useState(0);
  const layer = layers[selected]!;
  return (
    <>
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h3 className="text-lg font-semibold">四个功能层，贯穿所有部门</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            这是任务如何运转的架构。部门和员工的汇报关系在公司全景中；每个业务都有自己的执行流程。
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onOrganization}>
          查看公司组织图
        </Button>
      </section>
      <section
        aria-label="四层运行架构"
        className="space-y-5 rounded-lg border border-border/60 p-5"
      >
        <p className="text-xs text-muted-foreground">
          需求或授权事件进入 → 按层推进 → 结果与决定回到原任务
        </p>
        <ol className="grid gap-3 md:grid-cols-4">
          {layers.map((item, index) => (
            <li key={item.title} className="relative min-w-0">
              <button
                type="button"
                aria-pressed={selected === index}
                onClick={() => setSelected(index)}
                className={`h-full w-full rounded-lg border p-4 text-left outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${selected === index ? "border-primary/60 bg-primary/5" : "border-border/60"}`}
              >
                <span className="text-xs tabular-nums text-muted-foreground">
                  0{index + 1} · 部分具备
                </span>
                <span className="mt-3 block text-sm font-medium">{item.title}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{item.subtitle}</span>
              </button>
              {index < 3 && (
                <ArrowRightIcon
                  aria-hidden
                  className="absolute top-1/2 -right-3 z-10 hidden size-3 bg-background text-muted-foreground md:block"
                />
              )}
            </li>
          ))}
        </ol>
        <p className="text-xs text-muted-foreground">
          已有授权的阶段连续接力。只有需要你判断的事项上报；决定落盘后续接原任务。
        </p>
      </section>
      <section aria-live="polite" className="space-y-5 rounded-lg border border-border/60 p-5">
        <h3 className="text-base font-medium">{layer.title}</h3>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium">当前已实现</p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{layer.existing}</p>
          </div>
          <div>
            <p className="text-xs font-medium">仍需建设</p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{layer.gap}</p>
          </div>
        </div>
        <div className="space-y-2 border-t border-border/60 pt-4 text-sm leading-relaxed text-muted-foreground">
          <p>{layer.approval}</p>
          <p>记忆：{layer.memory}</p>
        </div>
      </section>
      <section className="space-y-4">
        <h3 className="text-base font-medium">Agent 内部：统筹与执行分开</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          吸收第二篇的 Router / Worker 两层思路。部门多，不意味着每个部门都需要一个持续思考的会话。
        </p>
        <div className="rounded-lg border border-border/60 p-5">
          <div className="text-center">
            <p className="text-sm font-medium">公司统筹 · Router（路由层，待接入）</p>
            <p className="mt-1 text-xs text-muted-foreground">
              维护全局任务索引、接收需求、协调跨任务问题，统一向你汇报
            </p>
          </div>
          <ArrowDownIcon aria-hidden className="mx-auto my-4 size-4 text-muted-foreground" />
          <div className="grid gap-3 sm:grid-cols-3">
            {["主营业务任务 · 待配置", "小红书制作任务 · 已适配", "知识支持任务 · 待接入"].map(
              (label) => (
                <div key={label} className="rounded-md bg-muted/50 p-3 text-center text-xs">
                  {label}
                </div>
              ),
            )}
          </div>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Worker（执行层）按任务隔离上下文，复杂任务内部可以再组织团队
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-border/60 p-4">
            <p className="text-sm font-medium">不从零重来</p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              已具备原任务增量反馈、有效成果复用和条件匹配的 Codex
              会话恢复。跨入口订阅直达、按引用逐层回忆仍待接入。
            </p>
          </div>
          <div className="rounded-lg border border-border/60 p-4">
            <p className="text-sm font-medium">长期存在，按事件工作</p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              后台程序负责等待、检查与恢复。空闲不唤醒模型，不启用推测性制作；监控不能增加预算或取消人工停止。本机休眠期间不计算。
            </p>
          </div>
        </div>
      </section>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={onChannel}>
          查看已接通的小红书流程
          <ArrowRightIcon className="size-3.5" />
        </Button>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        架构参考：
        <a
          className="underline underline-offset-4"
          href="https://x.com/Khazix0918/status/2117054043868860521"
          target="_blank"
          rel="noreferrer"
        >
          卡兹克的 Agent 自动化系统
        </a>
        、
        <a
          className="underline underline-offset-4"
          href="https://x.com/DeepSeekHarness/status/2116857257245987236"
          target="_blank"
          rel="noreferrer"
        >
          DeepSeek Harness 的 Super-agent 设计
        </a>
        。两篇描述系统设计，并未规定你的公司部门。第二篇也明确属于架构探讨；多 Agent
        与长会话不保证更省 token。
      </p>
    </>
  );
}
