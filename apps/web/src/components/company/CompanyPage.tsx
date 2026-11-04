import { randomUUID } from "../../lib/utils";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useAtomValue } from "@effect/atom-react";
import { PlusIcon } from "lucide-react";
import type {
  CompanyChangeScope,
  CompanyCommand,
  CompanyTask,
  EnvironmentId,
} from "@t3tools/contracts";
import { serverEnvironment } from "../../state/server";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { useEnvironments, usePrimaryEnvironmentId } from "../../state/environments";
import { SidebarInset } from "../ui/sidebar";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { Select, SelectTrigger, SelectValue, SelectPopup, SelectItem } from "../ui/select";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { WorkspacePageContainer } from "../WorkspacePageContainer";
import { isElectron } from "../../env";
import { CompanyOverview, CompanyTeam, StageProgress, stateNames } from "./CompanyOverview";
import { CompanyCreateTask } from "./CompanyCreateTask";
import { CompanyFlowPage } from "./CompanyFlowPage";
import { CompanyOrganizationPage } from "./CompanyOrganizationPage";
import { CompanyTeamEditor } from "./CompanyTeamEditor";
import { CompanyBusinessPage, companyStageName } from "./CompanyBusinessPage";
import { CompanyArchitecturePage } from "./CompanyArchitecturePage";

const pages = ["公司全景", "运行架构", "业务流程", "任务", "设置"] as const;
const channelPages = ["工作台", "流程图", "岗位"] as const;
const tabs = ["进度", "成果与验收", "记忆与用量"] as const;
const control =
  "mt-1 w-full rounded-lg border border-input bg-background p-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";
export function CompanyPage() {
  const { environments } = useEnvironments();
  const primary = usePrimaryEnvironmentId();
  const [selected, setSelected] = useState<EnvironmentId | null>(null);
  const environmentId = selected ?? primary ?? environments[0]?.environmentId ?? null;
  return (
    <SidebarInset className="h-dvh overflow-hidden">
      <WorkspacePageHeader electron={isElectron} className="border-b">
        <h1 className="shrink-0 text-sm font-medium">AI 公司</h1>
        <span aria-hidden className="text-muted-foreground">
          /
        </span>
        {environmentId ? (
          <Select
            value={environmentId}
            onValueChange={(value) =>
              setSelected(
                environments.find((e) => e.environmentId === value)?.environmentId ?? null,
              )
            }
          >
            <SelectTrigger
              aria-label="公司后台环境"
              variant="ghost"
              size="sm"
              className="min-w-0 max-w-64"
            >
              <SelectValue>
                {environments.find((e) => e.environmentId === environmentId)?.label}
              </SelectValue>
            </SelectTrigger>
            <SelectPopup>
              {environments.map((e) => (
                <SelectItem key={e.environmentId} value={e.environmentId}>
                  {e.label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        ) : (
          <span className="text-xs text-muted-foreground">尚未连接后台</span>
        )}
      </WorkspacePageHeader>
      {environmentId ? (
        <CompanyEnvironment key={environmentId} environmentId={environmentId} />
      ) : (
        <WorkspacePageContainer width="wide">
          <h2 className="text-xl font-semibold">先连接公司后台</h2>
          <p className="text-sm text-muted-foreground">
            连接公司后台，查看组织结构、各业务流程和实际任务。
          </p>
          <Button className="self-start" render={<Link to="/settings/connections" />}>
            连接后台
          </Button>
        </WorkspacePageContainer>
      )}
    </SidebarInset>
  );
}
function CompanyEnvironment({ environmentId }: { environmentId: EnvironmentId }) {
  const query = useEnvironmentQuery(serverEnvironment.companyLive({ environmentId, input: {} }));
  const canOperate = useAtomValue(serverEnvironment.companyCommand.permissionAtom(environmentId));
  const canConfigure = useAtomValue(
    serverEnvironment.configureCompany.permissionAtom(environmentId),
  );
  const command = useAtomCommand(serverEnvironment.companyCommand);
  const configure = useAtomCommand(serverEnvironment.configureCompany);
  const saveOrganization = useAtomCommand(serverEnvironment.saveCompanyOrganization);
  const [editingTeam, setEditingTeam] = useState(false);
  const [business, setBusiness] = useState<"all" | "rednote">("all");
  const [createWorkflow, setCreateWorkflow] = useState("rednote");
  const [fromStep, setFromStep] = useState("");
  const [page, setPage] = useState<(typeof pages)[number]>("公司全景");
  const [channelPage, setChannelPage] = useState<(typeof channelPages)[number]>("工作台");
  const openChannel = (view: (typeof channelPages)[number] = "工作台") => {
    setPage("业务流程");
    setBusiness("rednote");
    setChannelPage(view);
  };
  const [tab, setTab] = useState<(typeof tabs)[number]>("进度");
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [memoryReplacements, setMemoryReplacements] = useState<Record<string, string>>({});
  const [scope, setScope] = useState<CompanyChangeScope>("cover");
  const data = query.data;
  const task = data?.tasks.find((t) => t.id === selected) ?? data?.tasks[0];
  const run = task?.runs.at(-1);
  const send = async (input: CompanyCommand) => {
    if (busy || !canOperate || query.error) return;
    setBusy(true);
    return command({ environmentId, input }).finally(() => setBusy(false));
  };
  const taskCommand = (type: "stop" | "resume" | "reconcile") =>
    task && send({ type, commandId: randomUUID(), taskId: task.id, revision: task.revision });
  const openTask = (target: CompanyTask) => {
    setSelected(target.id);
    setFromStep(target.plan?.steps[0]?.id ?? "");
    setFeedback("");
    setScope("cover");
    setPage("任务");
    setTab(target.state === "awaiting_review" ? "成果与验收" : "进度");
  };
  if (!data)
    return (
      <WorkspacePageContainer width="wide">
        <h2 className="text-lg font-medium">
          {query.error ? "暂时无法读取公司后台" : "正在连接公司后台…"}
        </h2>
        <p role="status" className="text-sm text-muted-foreground">
          {query.error ?? "正在读取任务和团队配置。"}
        </p>
        {query.error && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={query.refresh}>
              重新连接
            </Button>
            <Button variant="ghost" render={<Link to="/settings/connections" />}>
              检查后台连接
            </Button>
          </div>
        )}
      </WorkspacePageContainer>
    );
  const toggleEnabled = async () => {
    if (busy || !canConfigure || query.error) return;
    setBusy(true);
    await configure({
      environmentId,
      input: { ...data.settings, enabled: !data.settings.enabled, commandId: randomUUID() },
    }).finally(() => setBusy(false));
  };
  const creationDisabled =
    busy || !canOperate || !data.settings.enabled || !!query.error || data.connection !== "online";
  return (
    <>
      <ScrollArea className="min-h-0 flex-1">
        <WorkspacePageContainer width="wide">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs text-muted-foreground">
                {data.organization?.name ?? "AI 公司"}
              </p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight">{page}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                查看公司全貌，进入业务流程，处理需要你决定的事项。
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  aria-hidden
                  className={`size-1.5 rounded-full ${query.error || data.connection === "offline" ? "bg-destructive" : data.connection === "online" ? "bg-success" : "bg-muted-foreground"}`}
                />
                {query.error
                  ? "连接已中断"
                  : {
                      online: "执行器已连接",
                      offline: "执行器未连接",
                      connecting: "正在连接执行器",
                      disabled: "派工未启用",
                    }[data.connection]}
              </span>
              {data.settings.enabled && (page === "业务流程" || page === "任务") && (
                <Button
                  size="sm"
                  disabled={creationDisabled}
                  onClick={() => {
                    setCreateWorkflow("rednote");
                    setCreating(true);
                  }}
                >
                  <PlusIcon className="size-3.5" />
                  新建任务
                </Button>
              )}
            </div>
          </div>
          <nav className="flex flex-wrap gap-1 border-b pb-3" aria-label="公司导航">
            {pages.map((name) => (
              <Button
                key={name}
                size="sm"
                variant={page === name ? "secondary" : "ghost"}
                aria-current={page === name ? "page" : undefined}
                onClick={() => {
                  setPage(name);
                  if (name === "业务流程") setBusiness("all");
                }}
              >
                {name}
              </Button>
            ))}
          </nav>
          {query.error && (
            <p role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm">
              {query.error} · 以下是最后收到的状态。
              <Button variant="ghost" size="sm" onClick={query.refresh}>
                重新连接
              </Button>
            </p>
          )}
          {!canOperate && (
            <p className="text-sm text-muted-foreground">
              当前连接只有查看权限。创建、修改与验收任务需要有操作权限的连接。
            </p>
          )}
          {data.serviceMode === "desktop" && (
            <p className="rounded-lg border border-border/60 p-3 text-xs text-muted-foreground">
              当前是桌面内置后台。需要关闭窗口后继续工作，请在后台连接中接入独立公司服务。
              <Link className="ml-2 underline underline-offset-4" to="/settings/connections">
                管理连接
              </Link>
            </p>
          )}
          {page === "公司全景" && (
            <CompanyOrganizationPage
              data={data}
              onConfigure={() => setEditingTeam(true)}
              canConfigure={canConfigure && !query.error && !!data.organizationRevision}
              onChannel={() => openChannel()}
              onArchitecture={() => setPage("运行架构")}
            />
          )}
          {page === "运行架构" && (
            <CompanyArchitecturePage
              onOrganization={() => setPage("公司全景")}
              onChannel={() => openChannel("流程图")}
            />
          )}
          {page === "业务流程" && business === "all" && (
            <CompanyBusinessPage
              data={data}
              disabled={creationDisabled}
              canConfigure={canConfigure && !query.error && !!data.organizationRevision}
              onCreate={(id) => {
                setCreateWorkflow(id);
                setCreating(true);
              }}
              onConfigure={() => setEditingTeam(true)}
              onLegacy={() => openChannel("流程图")}
            />
          )}
          {page === "业务流程" && business === "rednote" && (
            <Button
              size="sm"
              variant="ghost"
              className="self-start"
              onClick={() => setBusiness("all")}
            >
              返回全部业务流程
            </Button>
          )}
          {page === "业务流程" && business === "rednote" && (
            <section className="space-y-4">
              <div>
                <p className="text-xs text-muted-foreground">自媒体获客与运营 / 小红书</p>
                <h3 className="mt-1 text-lg font-semibold">内容制作</h3>
                <p className="mt-2 text-xs text-muted-foreground">
                  小红书内容制作使用内置验收规则。其他业务在“全部业务流程”中配置与派工。
                </p>
              </div>
              <nav className="flex gap-1" aria-label="小红书渠道导航">
                {channelPages.map((name) => (
                  <Button
                    key={name}
                    size="sm"
                    variant={channelPage === name ? "secondary" : "ghost"}
                    aria-current={channelPage === name ? "page" : undefined}
                    onClick={() => setChannelPage(name)}
                  >
                    {name}
                  </Button>
                ))}
              </nav>
            </section>
          )}
          {page === "业务流程" && business === "rednote" && channelPage === "工作台" && (
            <CompanyOverview
              data={{ ...data, tasks: data.tasks.filter((item) => !item.plan) }}
              onOpenTask={openTask}
              onTeam={() => setChannelPage("岗位")}
              onFlow={() => setChannelPage("流程图")}
              onCreate={() => {
                setCreateWorkflow("rednote");
                setCreating(true);
              }}
              onEnable={toggleEnabled}
              onRefresh={query.refresh}
              creationDisabled={creationDisabled}
              enableDisabled={!canConfigure || busy || !!query.error || !data.workflow}
            />
          )}
          {page === "业务流程" && business === "rednote" && channelPage === "流程图" && (
            <CompanyFlowPage
              data={data}
              initialTaskId={task?.id ?? null}
              onOpenTask={(target, view) => {
                openTask(target);
                setTab(view);
              }}
              onCreate={() => {
                setCreateWorkflow("rednote");
                setCreating(true);
              }}
              onHome={() => setChannelPage("工作台")}
              creationDisabled={creationDisabled}
            />
          )}
          {page === "业务流程" && business === "rednote" && channelPage === "岗位" && (
            <CompanyTeam
              data={data}
              onCreate={() => {
                setCreateWorkflow("rednote");
                setCreating(true);
              }}
              creationDisabled={creationDisabled}
            />
          )}
          {page === "设置" && (
            <section className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border/60 p-4">
                <div>
                  <h3 className="text-sm font-medium">公司任务派工</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    暂停后不再开始下一阶段；正在执行的任务需在任务内单独停止。
                  </p>
                </div>
                <Button
                  variant="outline"
                  disabled={!canConfigure || busy || !!query.error}
                  onClick={toggleEnabled}
                >
                  {data.settings.enabled ? "暂停新派工" : "启用派工"}
                </Button>
              </div>
              <div className="grid gap-6 sm:grid-cols-2">
                <section>
                  <h3 className="mb-3 text-sm font-medium">运行额度</h3>
                  <dl className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">同时执行</dt>
                      <dd>最多 2 项任务</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">自动返工</dt>
                      <dd>最多 3 轮</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">网络重试</dt>
                      <dd>最多 2 次</dd>
                    </div>
                  </dl>
                </section>
                <section>
                  <h3 className="mb-3 text-sm font-medium">授权范围</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    创建任务后，团队连续完成内部制作，最后交你验收。发布、对外发送和新增付费需要单独授权。
                  </p>
                </section>
              </div>
              <details className="rounded-lg border border-border/60 p-4">
                <summary className="cursor-pointer text-sm font-medium">后台连接与资料位置</summary>
                <div className="mt-4 space-y-3 break-all text-xs text-muted-foreground">
                  <p>组织：{data.settings.rulesRoot}/rules/ai-company/organization.json</p>
                  <p>小红书规则：{data.settings.rulesRoot}/rules/ai-company/rednote.json</p>
                  <p>资料：{data.settings.knowledgeRoot}</p>
                  <p>任务工作区：{data.workspaceRoot}</p>
                  <p>规则版本：{data.workflow?.version ?? "未加载"}</p>
                  <Button size="sm" variant="outline" render={<Link to="/settings/connections" />}>
                    管理后台连接
                  </Button>
                </div>
              </details>
            </section>
          )}
          {page === "任务" &&
            (data.tasks.length ? (
              <div className="grid min-w-0 gap-6 md:grid-cols-[200px_minmax(0,1fr)]">
                <aside className="max-h-56 overflow-auto md:max-h-[65vh]" aria-label="任务列表">
                  <p className="mb-3 text-xs text-muted-foreground">
                    全部业务任务 · {data.tasks.length}
                  </p>
                  {data.tasks.map((t) => (
                    <button
                      key={t.id}
                      aria-current={task?.id === t.id ? "true" : undefined}
                      className={`mb-1 w-full rounded-lg p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${task?.id === t.id ? "bg-accent" : "hover:bg-muted/50"}`}
                      onClick={() => openTask(t)}
                    >
                      <span className="block truncate text-sm font-medium">{t.title}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {stateNames[t.state]} · {companyStageName(t)}
                      </span>
                    </button>
                  ))}
                </aside>
                <div className="min-w-0 space-y-5">
                  <nav className="flex flex-wrap gap-1" aria-label="任务详情">
                    {tabs.map((name) => (
                      <Button
                        key={name}
                        size="sm"
                        variant={tab === name ? "secondary" : "ghost"}
                        aria-current={tab === name ? "page" : undefined}
                        onClick={() => setTab(name)}
                      >
                        {name}
                      </Button>
                    ))}
                  </nav>
                  {tab === "进度" && (
                    <>
                      {task && (
                        <>
                          <TaskHeading task={task} />
                          <StageProgress task={task} />
                          {!task.plan && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="self-start"
                              onClick={() => openChannel("流程图")}
                            >
                              在流程图中查看这项任务
                            </Button>
                          )}
                          <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                            {task.brief}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="outline"
                              disabled={busy || !canOperate || !!query.error}
                              onClick={() => taskCommand("reconcile")}
                            >
                              核对状态
                            </Button>
                            {["blocked", "stopped"].includes(task.state) && (
                              <Button
                                variant="outline"
                                disabled={
                                  busy || !canOperate || !!query.error || !data.settings.enabled
                                }
                                onClick={() => taskCommand("resume")}
                              >
                                继续这项任务
                              </Button>
                            )}
                            {!["stopped", "accepted"].includes(task.state) && (
                              <Button
                                variant="outline"
                                disabled={busy || !canOperate || !!query.error}
                                onClick={() => taskCommand("stop")}
                              >
                                停止执行
                              </Button>
                            )}
                          </div>
                          <details className="rounded-lg border border-border/60 p-4">
                            <summary className="cursor-pointer text-sm font-medium">
                              提出修改
                            </summary>
                            <form
                              className="mt-4 space-y-3"
                              onSubmit={async (e) => {
                                e.preventDefault();
                                const result = await send({
                                  type: "feedback",
                                  commandId: randomUUID(),
                                  taskId: task.id,
                                  revision: task.revision,
                                  scope: task.plan ? "facts" : scope,
                                  ...(task.plan
                                    ? { fromStep: fromStep || task.plan.steps[0]!.id }
                                    : {}),
                                  text: feedback,
                                });
                                if (result?._tag === "Success") setFeedback("");
                              }}
                            >
                              <h2 className="font-medium">修改这项任务</h2>
                              <label className="block text-sm">
                                影响范围
                                {task.plan ? (
                                  <select
                                    className={control}
                                    value={fromStep || task.plan.steps[0]?.id}
                                    onChange={(event) => setFromStep(event.target.value)}
                                  >
                                    {task.plan.steps.map((step) => (
                                      <option key={step.id} value={step.id}>
                                        从「{step.name}」开始重做
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <select
                                    value={scope}
                                    onChange={(e) => setScope(e.target.value as CompanyChangeScope)}
                                    className={control}
                                  >
                                    <option value="cover">仅封面 · 保留正文和内页</option>
                                    <option value="copy">文案 · 重做设计与审核</option>
                                    <option value="facts">核心事实 · 重新研究与制作</option>
                                  </select>
                                )}
                              </label>
                              <textarea
                                required
                                rows={3}
                                value={feedback}
                                onChange={(e) => setFeedback(e.target.value)}
                                className={control}
                                aria-label="修改要求"
                              />
                              <Button
                                type="submit"
                                disabled={
                                  busy ||
                                  !canOperate ||
                                  task.takeover ||
                                  task.runs.some((r) =>
                                    ["starting", "running", "blocked"].includes(r.state),
                                  )
                                }
                              >
                                提交增量修改
                              </Button>
                              <p className="text-xs text-muted-foreground">
                                执行中的任务请先停止；相关旧审批随修改失效。
                              </p>
                            </form>
                          </details>
                          {run?.terminalId && (
                            <details className="rounded-lg border border-border/60 p-4">
                              <summary className="cursor-pointer text-sm font-medium">
                                高级操作 · 执行终端与人工接管
                              </summary>
                              <div className="mt-4">
                                <TerminalView
                                  environmentId={environmentId}
                                  task={task}
                                  runId={run.id}
                                  onTakeover={() =>
                                    send({
                                      type: "takeover",
                                      commandId: randomUUID(),
                                      taskId: task.id,
                                      revision: task.revision,
                                      enabled: !task.takeover,
                                    })
                                  }
                                  canOperate={canOperate && !busy && !query.error}
                                />
                              </div>
                            </details>
                          )}
                        </>
                      )}
                    </>
                  )}
                  {tab === "成果与验收" && task && (
                    <>
                      <TaskHeading task={task} />
                      <div className="grid gap-3 lg:grid-cols-2">
                        {task.artifacts
                          .filter((a) => a.valid)
                          .map((a) => (
                            <ArtifactView
                              key={a.id}
                              environmentId={environmentId}
                              taskId={task.id}
                              artifact={a}
                            />
                          ))}
                      </div>
                      {task.state === "awaiting_review" && (
                        <section className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border/60 p-4">
                          <div>
                            <h3 className="text-sm font-medium">确认这份成果</h3>
                            <p className="mt-1 text-xs text-muted-foreground">
                              请先查看文案、图片和审核报告。验收仅针对当前版本，不包含发布。
                            </p>
                          </div>
                          <Button
                            disabled={!canOperate || busy || !!query.error}
                            onClick={() =>
                              send({
                                type: "approve",
                                commandId: randomUUID(),
                                taskId: task.id,
                                revision: task.revision,
                                digest: task.digest,
                              })
                            }
                          >
                            验收通过 · v{task.revision}
                          </Button>
                        </section>
                      )}
                      {!task.artifacts.some((a) => a.valid) && (
                        <p className="text-sm text-muted-foreground">
                          尚无已校验成果。Herdr 报告完成后仍需核对实际文件。
                        </p>
                      )}
                    </>
                  )}
                  {tab === "记忆与用量" && task && (
                    <>
                      <TaskHeading task={task} />
                      <section className="space-y-3">
                        <h2 className="font-medium">候选与有效记忆</h2>
                        {!task.memories.length && (
                          <p className="text-sm text-muted-foreground">
                            还没有候选记忆。执行中提炼的经验会在这里等待你确认。
                          </p>
                        )}
                        {task.memories.map((m) => (
                          <div key={m.id} className="rounded-lg border p-3">
                            <p className="text-sm">{m.text}</p>
                            <p className="break-all text-xs text-muted-foreground">
                              {m.confirmed ? "已确认" : "候选 · 不自动沿用"} ·{" "}
                              {m.scope === "company" ? "公司" : "当前任务"} · 来源 {m.source}
                              {m.supersedes ? ` · 替代 ${m.supersedes}` : ""}
                            </p>
                            {m.confirmed && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={!canOperate || busy}
                                onClick={() =>
                                  send({
                                    type: "memory",
                                    commandId: randomUUID(),
                                    taskId: task.id,
                                    revision: task.revision,
                                    memoryId: m.id,
                                    scope: m.scope,
                                    confirmed: false,
                                  })
                                }
                              >
                                撤回记忆
                              </Button>
                            )}
                            {!m.confirmed && (
                              <label className="mt-2 block text-xs">
                                替代已有记忆（可选）
                                <select
                                  className={control}
                                  value={memoryReplacements[m.id] ?? ""}
                                  onChange={(event) =>
                                    setMemoryReplacements({
                                      ...memoryReplacements,
                                      [m.id]: event.target.value,
                                    })
                                  }
                                >
                                  <option value="">作为独立记忆</option>
                                  {data.tasks.flatMap((t) =>
                                    t.memories
                                      .filter(
                                        (prior) =>
                                          prior.confirmed &&
                                          prior.id !== m.id &&
                                          (t.id === task.id || prior.scope === "company"),
                                      )
                                      .map((prior) => (
                                        <option key={prior.id} value={prior.id}>
                                          {prior.scope === "company" ? "公司" : "当前任务"}：
                                          {prior.text}
                                        </option>
                                      )),
                                  )}
                                </select>
                              </label>
                            )}
                            {!m.confirmed && (
                              <div className="mt-2 flex gap-2">
                                {["task", "company"].map((memoryScope) => (
                                  <Button
                                    key={memoryScope}
                                    size="sm"
                                    variant="outline"
                                    disabled={!canOperate || busy}
                                    onClick={() =>
                                      send({
                                        type: "memory",
                                        commandId: randomUUID(),
                                        taskId: task.id,
                                        revision: task.revision,
                                        memoryId: m.id,
                                        scope: memoryScope as "task" | "company",
                                        ...(memoryReplacements[m.id]
                                          ? { supersedes: memoryReplacements[m.id] }
                                          : {}),
                                      })
                                    }
                                  >
                                    {memoryScope === "task" ? "仅本任务沿用" : "确认为公司记忆"}
                                  </Button>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </section>
                      <Usage task={task} />
                      <details>
                        <summary>恢复与变更记录</summary>
                        <ul className="mt-3 space-y-2 text-xs">
                          {task.events.map((event) => (
                            <li key={`${event.at}-${event.kind}-${event.detail}`}>
                              {event.at} · {event.kind} · {event.detail}
                            </li>
                          ))}
                        </ul>
                      </details>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <section className="space-y-3 py-12 text-center">
                <h3 className="text-lg font-medium">还没有任务</h3>
                <p className="text-sm text-muted-foreground">
                  在设置中启用公司派工，再选择业务流程创建任务。
                </p>
                <Button
                  variant="outline"
                  onClick={() => {
                    setPage("业务流程");
                    setBusiness("all");
                  }}
                >
                  选择业务流程
                </Button>
              </section>
            ))}
        </WorkspacePageContainer>
      </ScrollArea>
      {editingTeam && data.organization && (
        <CompanyTeamEditor
          data={{ ...data, organization: data.organization }}
          environmentId={environmentId}
          onClose={() => setEditingTeam(false)}
          onSave={async (organization, expectedRevision) => {
            if (!canConfigure || query.error) return false;
            const result = await saveOrganization({
              environmentId,
              input: { commandId: randomUUID(), organization, expectedRevision },
            });
            if (result._tag === "Success") {
              query.refresh();
              return true;
            }
            return false;
          }}
        />
      )}
      {creating && (
        <CompanyCreateTask
          data={data}
          initialWorkflowId={createWorkflow}
          busy={busy}
          disabled={creationDisabled}
          onClose={() => setCreating(false)}
          onCreate={async (input) => {
            const result = await send(input);
            if (result?._tag !== "Success") return false;
            setSelected(null);
            setTab("进度");
            setPage("任务");
            query.refresh();
            return true;
          }}
        />
      )}
    </>
  );
}
function TaskHeading({ task }: { task: CompanyTask }) {
  return (
    <div>
      <h2 className="text-lg font-semibold">{task.title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {stateNames[task.state]} · {companyStageName(task)} · v{task.revision}
      </p>
      <p className="mt-3 text-sm text-muted-foreground">
        {task.takeover
          ? "你正在接管执行终端。结束接管后，团队才能继续接力。"
          : {
              queued: "已进入队列，等执行器空闲后开始。",
              running: "团队正在制作。需要调整需求时，请先停止执行，再提出修改。",
              blocked: "请查看下面的阻塞原因，处理后继续这项任务。",
              awaiting_review: "请到“成果与验收”查看交付文件与验证报告。",
              accepted: "当前版本已验收。后续修改仍在这项任务内进行。",
              stopped: "任务已停止，不会自动重启。可以提出修改，或继续这项任务。",
            }[task.state]}
      </p>
      {task.reason && (
        <p role="status" className="mt-3 rounded-lg border border-destructive/40 p-3 text-sm">
          {task.reason}
        </p>
      )}
    </div>
  );
}
function ArtifactView({
  environmentId,
  taskId,
  artifact,
}: {
  environmentId: EnvironmentId;
  taskId: string;
  artifact: CompanyTask["artifacts"][number];
}) {
  const [open, setOpen] = useState(false);
  const query = useEnvironmentQuery(
    open
      ? serverEnvironment.companyArtifact({
          environmentId,
          input: { taskId, artifactId: artifact.id },
        })
      : null,
  );
  const content = query.data;
  return (
    <section className="min-w-0 rounded-xl border p-4">
      <Button variant="ghost" className="max-w-full" onClick={() => setOpen(!open)}>
        {artifact.name} · {open ? "收起" : "打开"}
      </Button>
      <details className="mt-2 text-xs text-muted-foreground">
        <summary className="cursor-pointer">文件校验信息</summary>
        <p className="mt-2 break-all">SHA-256 {artifact.sha256}</p>
      </details>
      {open && query.error && <p role="alert">{query.error}</p>}
      {open &&
        content &&
        (content.mime.startsWith("image/") ? (
          <img
            className="mt-3 max-h-[600px] w-full object-contain"
            src={`data:${content.mime};base64,${content.base64}`}
            alt={content.name}
          />
        ) : (
          <pre className="mt-3 max-h-[480px] overflow-auto whitespace-pre-wrap text-sm">
            {new TextDecoder().decode(
              Uint8Array.from(atob(content.base64), (c) => c.charCodeAt(0)),
            )}
          </pre>
        ))}
    </section>
  );
}
function TerminalView({
  environmentId,
  task,
  runId,
  onTakeover,
  canOperate,
}: {
  environmentId: EnvironmentId;
  task: CompanyTask;
  runId: string;
  onTakeover: () => unknown;
  canOperate: boolean;
}) {
  const query = useEnvironmentQuery(
    serverEnvironment.companyTerminal({ environmentId, input: { taskId: task.id, runId } }),
  );
  const keys = useAtomCommand(serverEnvironment.companyKeys);
  const canType = useAtomValue(serverEnvironment.companyKeys.permissionAtom(environmentId));
  const [busy, setBusy] = useState(false);
  return (
    <section className="space-y-3 rounded-xl border p-4">
      <div className="flex flex-wrap gap-2">
        <h2 className="mr-auto font-medium">Herdr 执行终端</h2>
        <Button size="sm" variant="outline" onClick={query.refresh}>
          刷新现场
        </Button>
        <Button
          size="sm"
          disabled={!canOperate || task.state === "stopped"}
          onClick={() => onTakeover()}
        >
          {task.takeover ? "结束接管" : "人工接管"}
        </Button>
      </div>
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded bg-muted p-3 text-xs">
        {query.error ?? query.data?.text ?? "正在读取…"}
      </pre>
      {query.data?.complete === false && (
        <p className="text-xs text-muted-foreground">终端记录可能不完整。</p>
      )}
      {task.takeover && (
        <>
          <p className="text-xs">
            自动交付和接力已暂停。下面的按键会直接作用于当前终端；请先阅读工具权限提示。
          </p>
          <div className="flex flex-wrap gap-2">
            {["up", "down", "enter", "esc", "ctrl+c", "y", "n"].map((key) => (
              <Button
                size="sm"
                variant="outline"
                key={key}
                disabled={!canType || busy}
                onClick={async () => {
                  setBusy(true);
                  await keys({
                    environmentId,
                    input: { taskId: task.id, runId, keys: [key], commandId: randomUUID() },
                  });
                  query.refresh();
                  setBusy(false);
                }}
              >
                {key}
              </Button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
function Usage({ task }: { task: CompanyTask }) {
  return (
    <section>
      <h2 className="mb-3 font-medium">用量与返工</h2>
      <p className="mb-3 text-sm">
        自动返工 {task.reworkCount}/3 · 网络重试 {task.networkRetries}/2 · 执行轮次{" "}
        {task.runs.length}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              {["阶段", "输入", "缓存输入", "输出", "图像调用"].map((h) => (
                <th className="px-3 py-2 text-xs font-normal text-muted-foreground" key={h}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {task.runs.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-2.5 tabular-nums">
                  {companyStageName(task, r.stage)} · v{r.revision}
                </td>
                {(["input", "cachedInput", "output", "images"] as const).map((key) => (
                  <td key={key} className="p-2">
                    {r.usage[key] ?? "未知"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        缓存输入为输入量中的缓存部分；未知不代表免费。订阅额度不足时等待，不自动改用付费 API。
      </p>
    </section>
  );
}
