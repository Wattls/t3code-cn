import { useState } from "react";
import { ArrowDownIcon, ArrowRightIcon, NetworkIcon } from "lucide-react";
import type { CompanyOrganization, CompanySnapshot } from "@t3tools/contracts";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogPanel,
  DialogFooter,
} from "../ui/dialog";

type OrganizationNode = CompanyOrganization["nodes"][number];
const kindNames = {
  owner: "最终决策",
  coordinator: "公司统筹",
  department: "部门",
  lead: "负责人",
  channel: "渠道",
  role: "Agent 岗位",
};
function nodeStatus(node: OrganizationNode, data: CompanySnapshot) {
  if (node.employee) return `已配置 · ${node.employee.model}`;
  if (node.workflow || node.stage) return data.workflow ? "已适配 · Codex" : "执行规则未加载";
  if (node.kind === "owner") return "由你决定";
  return { confirmed: "职责已确认", reference: "规则参考 · 待接入", planned: "待配置" }[node.state];
}

function OrganizationBranch({
  node,
  data,
  depth,
  onSelect,
}: {
  node: OrganizationNode;
  data: CompanySnapshot;
  depth: number;
  onSelect: (node: OrganizationNode) => void;
}) {
  const children = data.organization?.nodes.filter((item) => item.parentId === node.id) ?? [];
  return (
    <li className="flex min-w-0 flex-1 flex-col items-center">
      <button
        type="button"
        aria-label={`${node.name}，${nodeStatus(node, data)}，查看详情`}
        onClick={() => onSelect(node)}
        className={`w-full max-w-sm rounded-lg border bg-background p-4 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${node.state === "planned" ? "border-dashed border-border" : "border-border/70"}`}
      >
        <span className="block text-2xs text-muted-foreground">{kindNames[node.kind]}</span>
        <span className="mt-1.5 block text-sm font-medium">{node.name}</span>
        <span className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
          {nodeStatus(node, data)}
          <ArrowRightIcon aria-hidden className="size-3 shrink-0" />
        </span>
      </button>
      {children.length > 0 && (
        <>
          <ArrowDownIcon aria-hidden className="my-2 size-4 shrink-0 text-muted-foreground/60" />
          <ul
            aria-label={`${node.name}的下级`}
            className={
              depth < 2
                ? `flex w-full flex-col items-stretch gap-4 ${children.length > 1 ? "border-t border-border/60 pt-4 md:flex-row" : ""}`
                : "flex w-full flex-col gap-3 border-l border-border/60 pl-3"
            }
          >
            {children.map((child) => (
              <OrganizationBranch
                key={child.id}
                node={child}
                data={data}
                depth={depth + 1}
                onSelect={onSelect}
              />
            ))}
          </ul>
        </>
      )}
    </li>
  );
}

export function CompanyOrganizationPage({
  data,
  onChannel,
  onArchitecture,
  onConfigure,
  canConfigure,
}: {
  data: CompanySnapshot;
  onChannel: () => void;
  onArchitecture: () => void;
  onConfigure: () => void;
  canConfigure: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const organization = data.organization;
  const selected = organization?.nodes.find((node) => node.id === selectedId);
  const role = selected?.stage
    ? data.workflow?.stages[selected.stage as keyof NonNullable<typeof data.workflow>["stages"]]
    : null;
  const root = organization?.nodes.find((node) => node.parentId === null);
  const attention = data.tasks.filter(
    (task) => !task.plan && (task.state === "blocked" || task.state === "awaiting_review"),
  ).length;
  return (
    <>
      <section className="flex flex-wrap items-start justify-between gap-4 border-b border-border/60 pb-5">
        <div className="max-w-xl">
          <h3 className="text-lg font-semibold">从公司方向，到每个岗位</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            沿连线从上到下查看汇报关系。点击部门或岗位，查看职责、授权、记忆范围与接入情况。
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            小红书属于自媒体获客与运营。主营业务与未接入岗位保留待配置标记。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={!canConfigure} onClick={onConfigure}>
            配置团队与流程
          </Button>
          <Button variant="ghost" size="sm" onClick={onArchitecture}>
            <NetworkIcon className="size-3.5" />
            系统怎样运转
          </Button>
        </div>
      </section>
      {root ? (
        <section
          aria-label="公司全局组织图"
          className="rounded-lg border border-border/60 bg-muted/10 p-4 sm:p-6"
        >
          <div className="mb-6 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>组织结构 · v{organization?.version}</span>
            <span>岗位按任务启动；此图不代表所有 Agent 正在运行</span>
          </div>
          <ul className="flex w-full">
            <OrganizationBranch
              node={root}
              data={data}
              depth={0}
              onSelect={(node) => setSelectedId(node.id)}
            />
          </ul>
        </section>
      ) : (
        <p
          role="alert"
          className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground"
        >
          组织配置未加载。请检查规则源中的
          organization.json，或连接支持公司组织图的新版后台。已有小红书任务仍可查看。
        </p>
      )}
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border/60 p-5">
        <div>
          <p className="text-xs text-muted-foreground">已接通的业务流程</p>
          <h3 className="mt-1.5 text-sm font-medium">自媒体获客与运营 / 小红书 / 内容制作</h3>
          <p className="mt-2 text-xs text-muted-foreground">
            {data.tasks.filter((task) => !task.plan).length} 项任务 · {attention} 项需要处理 ·{" "}
            {data.settings.enabled ? "派工已启用" : "派工未启用"}
          </p>
        </div>
        <Button variant="outline" onClick={onChannel}>
          进入小红书工作台
          <ArrowRightIcon className="size-3.5" />
        </Button>
      </section>
      <details className="rounded-lg border border-border/60 p-4">
        <summary className="cursor-pointer text-sm font-medium">怎样配置团队？</summary>
        <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            先确定业务部门，再定义负责人和执行岗位，最后为岗位接入模型、工具、验收标准与授权。组织图中的节点只是职责定义；只有完成执行适配的岗位才能接任务。
          </p>
          <p>
            点击“配置团队与流程”添加部门和员工，选择 Codex 模型及
            skills，再为部门建立顺序流程。任务按部门和流程路由，配置改变后已有任务沿用原快照。其他
            Provider 尚未接入。
          </p>
          <p className="break-all text-xs">
            组织规则源：{data.settings.rulesRoot}/rules/ai-company/organization.json
          </p>
        </div>
      </details>
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      >
        <DialogPopup className="max-w-xl">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.name}</DialogTitle>
                <DialogDescription>
                  {kindNames[selected.kind]} · {nodeStatus(selected, data)}
                </DialogDescription>
              </DialogHeader>
              <DialogPanel>
                <dl className="space-y-5 text-sm leading-relaxed">
                  <div>
                    <dt className="mb-1 font-medium">职责</dt>
                    <dd className="text-muted-foreground">{selected.responsibility}</dd>
                  </div>
                  {role && (
                    <div>
                      <dt className="mb-1 font-medium">验收依据</dt>
                      <dd className="text-muted-foreground">{role.acceptance}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="mb-1 font-medium">动作授权</dt>
                    <dd className="text-muted-foreground">{selected.authority}</dd>
                  </div>
                  <div>
                    <dt className="mb-1 font-medium">记忆范围</dt>
                    <dd className="text-muted-foreground">{selected.memory}</dd>
                  </div>
                  {(selected.stage || selected.workflow || selected.employee) && (
                    <div>
                      <dt className="mb-1 font-medium">执行情况</dt>
                      <dd className="text-muted-foreground">
                        Codex 经 Herdr 按任务运行。当前
                        {data.settings.enabled ? "已启用派工" : "派工暂停"}；执行器
                        {data.connection === "online" ? "已连接" : "未就绪"}
                        。图像工具和额度不足会阻塞，接通不代表业务质量已验收。
                      </dd>
                    </div>
                  )}
                </dl>
                <details className="mt-5 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                  <summary className="cursor-pointer">规则来源与技能</summary>
                  <ul className="mt-3 space-y-2 break-all">
                    {[
                      ...new Set([
                        ...selected.sources,
                        ...(selected.employee?.skills ?? role?.skills ?? []),
                      ]),
                    ].map((source) => (
                      <li key={source}>{source}</li>
                    ))}
                    {!selected.sources.length && (
                      <li>依据当前用户确认范围；待定职责不会自动成为已授权工作。</li>
                    )}
                  </ul>
                </details>
              </DialogPanel>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setSelectedId(null)}>
                  关闭
                </Button>
                {(selected.stage || selected.workflow) && (
                  <Button
                    onClick={() => {
                      setSelectedId(null);
                      onChannel();
                    }}
                  >
                    查看渠道流程
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogPopup>
      </Dialog>
    </>
  );
}
