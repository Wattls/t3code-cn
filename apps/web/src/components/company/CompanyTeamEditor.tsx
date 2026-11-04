import { useState } from "react";
import * as Schema from "effect/Schema";
import {
  CompanyOrganization,
  type CompanyBusinessWorkflow,
  type CompanyEmployee,
  type CompanySnapshot,
  type EnvironmentId,
} from "@t3tools/contracts";
import { serverEnvironment } from "../../state/server";
import { useEnvironmentQuery } from "../../state/query";
import { randomUUID } from "../../lib/utils";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogPanel,
  DialogFooter,
} from "../ui/dialog";

type Node = CompanyOrganization["nodes"][number];
const validate = Schema.decodeUnknownSync(CompanyOrganization);
const control =
  "w-full rounded-md border border-input bg-background p-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";
const kinds = {
  owner: "本人",
  coordinator: "公司统筹",
  department: "部门",
  lead: "负责人",
  channel: "渠道",
  role: "员工",
};
const efforts: Record<CompanyEmployee["effort"], string> = {
  low: "低",
  medium: "中",
  high: "高",
  xhigh: "很高",
  max: "最大",
  ultra: "最高",
};

export function CompanyTeamEditor({
  data,
  environmentId,
  onSave,
  onClose,
}: {
  data: CompanySnapshot & { organization: CompanyOrganization };
  environmentId: EnvironmentId;
  onSave: (organization: CompanyOrganization, expectedRevision: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const catalog = useEnvironmentQuery(
    serverEnvironment.companyCatalog({ environmentId, input: {} }),
  );
  const [draft, setDraft] = useState(data.organization);
  const [revision] = useState(data.organizationRevision ?? "");
  const [section, setSection] = useState<"people" | "flows">("people");
  const [selection, setSelection] = useState(data.organization.nodes[0]!.id);
  const [flowSelection, setFlowSelection] = useState(data.organization.workflows?.[0]?.id ?? "");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [discard, setDiscard] = useState(false);
  const node = draft.nodes.find((item) => item.id === selection);
  const flows = draft.workflows ?? [];
  const flow = flows.find((item) => item.id === flowSelection);
  const departments = draft.nodes.filter((item) => item.kind === "department");
  const employees = draft.nodes.filter((item) => item.employee);
  const updateNode = (patch: Partial<Node>) =>
    setDraft({
      ...draft,
      nodes: draft.nodes.map((item) => (item.id === selection ? { ...item, ...patch } : item)),
    });
  const updateFlow = (patch: Partial<CompanyBusinessWorkflow>) =>
    setDraft({
      ...draft,
      workflows: flows.map((item) => (item.id === flowSelection ? { ...item, ...patch } : item)),
    });
  const addNode = (kind: "department" | "role") => {
    const parentId =
      kind === "department"
        ? (draft.nodes.find((item) => item.kind === "coordinator")?.id ?? draft.nodes[0]!.id)
        : (departments.find((item) => item.id === selection)?.id ?? departments[0]?.id);
    if (!parentId) {
      setError("先添加一个部门，再添加员工。");
      return;
    }
    const id = `${kind}-${randomUUID()}`;
    const employee =
      kind === "role" && catalog.data?.models[0]
        ? {
            provider: "codex" as const,
            model: catalog.data.models[0].id,
            effort: "medium" as const,
            skills: [],
          }
        : undefined;
    setDraft({
      ...draft,
      nodes: [
        ...draft.nodes,
        {
          id,
          parentId,
          name: kind === "department" ? "新部门" : "新员工",
          kind,
          state: "planned",
          responsibility: "请填写职责",
          authority: "仅执行已授权内部任务；发布、外发、付费和权限变更需单独授权。",
          memory: "仅访问当前任务明确授权的资料与记忆。",
          sources: [],
          workflow: null,
          stage: null,
          ...(employee ? { employee } : {}),
        },
      ],
    });
    setSelection(id);
    setSection("people");
    setError("");
  };
  const configureModel = (modelId: string) => {
    if (!node) return;
    const model = catalog.data?.models.find((item) => item.id === modelId);
    const effort = model?.efforts.includes(node.employee?.effort ?? "medium")
      ? (node.employee?.effort ?? "medium")
      : (model?.efforts[0] as CompanyEmployee["effort"] | undefined);
    updateNode({
      employee: {
        provider: "codex",
        model: modelId,
        effort: effort ?? "medium",
        skills: node.employee?.skills ?? [],
      },
    });
  };
  const canRemove =
    node &&
    !["owner", "coordinator"].includes(node.kind) &&
    !node.workflow &&
    !node.stage &&
    !draft.nodes.some((item) => item.parentId === node.id) &&
    !flows.some(
      (item) =>
        item.departmentId === node.id || item.steps.some((step) => step.employeeId === node.id),
    );
  const updateStep = (index: number, patch: Partial<CompanyBusinessWorkflow["steps"][number]>) =>
    flow &&
    updateFlow({
      steps: flow.steps.map((step, i) => (i === index ? { ...step, ...patch } : step)),
    });
  const addStep = (kind: "produce" | "review") => {
    if (!flow) return;
    const employee = employees.find(
      (item) => kind === "produce" || !flow.steps.some((step) => step.employeeId === item.id),
    );
    if (!employee) {
      setError(
        kind === "review" ? "独立审核需要另一位已配置模型的员工。" : "先为至少一位员工配置模型。",
      );
      return;
    }
    const id = `step-${randomUUID()}`;
    updateFlow({
      steps: [
        ...flow.steps,
        {
          id,
          name: kind === "review" ? "独立审核" : "新阶段",
          employeeId: employee.id,
          kind,
          instructions: "请填写本阶段的具体工作",
          acceptance: "请填写可验证的验收标准",
          outputFiles: [`outputs/${id}.md`],
        },
      ],
    });
  };
  const save = async () => {
    setError("");
    let checked: CompanyOrganization;
    try {
      checked = validate(draft);
    } catch (cause) {
      setError(`配置未通过检查：${String(cause).slice(0, 1100)}`);
      return;
    }
    setBusy(true);
    try {
      if (await onSave(checked, revision)) onClose();
      else
        setError(
          "保存未成功，草稿仍保留。若配置已被其他窗口修改，请关闭后重新打开，核对最新配置。",
        );
    } catch {
      setError("连接异常，草稿仍保留，请稍后重试。");
    }
    setBusy(false);
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) setDiscard(true);
      }}
    >
      <DialogPopup className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>配置团队与工作流程</DialogTitle>
          <DialogDescription>
            先添加部门和员工，再把员工安排到流程阶段。保存只更新配置，不启动任务；已有任务保留原配置。
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <fieldset disabled={busy} className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex gap-1">
                <Button
                  variant={section === "people" ? "secondary" : "ghost"}
                  onClick={() => setSection("people")}
                >
                  部门与员工
                </Button>
                <Button
                  variant={section === "flows" ? "secondary" : "ghost"}
                  onClick={() => setSection("flows")}
                >
                  工作流程
                </Button>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => addNode("department")}>
                  添加部门
                </Button>
                <Button size="sm" variant="outline" onClick={() => addNode("role")}>
                  添加员工
                </Button>
              </div>
            </div>
            {catalog.error && (
              <p role="alert" className="text-sm text-destructive">
                模型与技能目录读取失败：{catalog.error}
                <Button size="sm" variant="ghost" onClick={catalog.refresh}>
                  重试
                </Button>
              </p>
            )}
            {section === "people" && (
              <div className="grid gap-5 md:grid-cols-[190px_minmax(0,1fr)]">
                <aside aria-label="组织成员" className="max-h-96 space-y-1 overflow-auto">
                  {draft.nodes.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      aria-current={selection === item.id ? "true" : undefined}
                      onClick={() => {
                        setSelection(item.id);
                        setSearch("");
                      }}
                      className={`w-full rounded-md px-3 py-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${selection === item.id ? "bg-accent" : "hover:bg-muted/50"}`}
                    >
                      <span className="block truncate">{item.name}</span>
                      <span className="text-xs text-muted-foreground">{kinds[item.kind]}</span>
                    </button>
                  ))}
                </aside>
                {node && (
                  <div className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="space-y-1 text-sm">
                        名称
                        <Input
                          nativeInput
                          value={node.name}
                          maxLength={120}
                          onChange={(event) => updateNode({ name: event.target.value })}
                        />
                      </label>
                      <label className="space-y-1 text-sm">
                        汇报给
                        <select
                          className={control}
                          value={node.parentId ?? ""}
                          disabled={node.kind === "owner"}
                          onChange={(event) => updateNode({ parentId: event.target.value })}
                        >
                          {node.kind === "owner" && <option value="">公司最高层</option>}
                          {draft.nodes
                            .filter((item) => item.id !== node.id)
                            .map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name}
                              </option>
                            ))}
                        </select>
                      </label>
                    </div>
                    <label className="block space-y-1 text-sm">
                      职责
                      <Textarea
                        rows={3}
                        value={node.responsibility}
                        onChange={(event) => updateNode({ responsibility: event.target.value })}
                      />
                    </label>
                    {["role", "lead", "coordinator"].includes(node.kind) && (
                      <section className="space-y-4 rounded-lg border border-border/60 p-4">
                        <h3 className="text-sm font-medium">执行能力 · Codex 订阅</h3>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <label className="space-y-1 text-sm">
                            模型
                            <select
                              className={control}
                              value={node.employee?.model ?? ""}
                              onChange={(event) => configureModel(event.target.value)}
                            >
                              <option value="" disabled>
                                选择模型
                              </option>
                              {node.employee &&
                                !catalog.data?.models.some(
                                  (model) => model.id === node.employee!.model,
                                ) && (
                                  <option value={node.employee.model}>
                                    {node.employee.model}（当前目录未找到）
                                  </option>
                                )}
                              {catalog.data?.models.map((model) => (
                                <option key={model.id} value={model.id}>
                                  {model.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="space-y-1 text-sm">
                            推理强度
                            <select
                              className={control}
                              disabled={!node.employee}
                              value={node.employee?.effort ?? "medium"}
                              onChange={(event) =>
                                node.employee &&
                                updateNode({
                                  employee: {
                                    ...node.employee,
                                    effort: event.target.value as CompanyEmployee["effort"],
                                  },
                                })
                              }
                            >
                              {(
                                catalog.data?.models.find(
                                  (model) => model.id === node.employee?.model,
                                )?.efforts ?? [node.employee?.effort ?? "medium"]
                              ).map((effort) => (
                                <option key={effort} value={effort}>
                                  {efforts[effort as CompanyEmployee["effort"]] ?? effort}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        {catalog.data && !catalog.data.models.length && (
                          <p role="status" className="text-xs text-muted-foreground">
                            本机模型目录为空。请先在 Codex 登录并刷新模型，再重新打开配置。
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          模型来自本机 Codex 目录。其他 Provider
                          尚未接入；订阅额度不足时任务会等待，不切换付费 API。
                        </p>
                        {node.employee && (
                          <div className="space-y-3">
                            <p className="text-sm">
                              Skills · 已选 {node.employee.skills.length} / 12
                            </p>
                            <Input
                              nativeInput
                              placeholder="搜索 skill 名称或路径"
                              value={search}
                              onChange={(event) => setSearch(event.target.value)}
                              aria-label="搜索技能"
                            />
                            <div className="flex flex-wrap gap-2">
                              {node.employee.skills.map((path) => (
                                <Button
                                  key={path}
                                  size="sm"
                                  variant="secondary"
                                  onClick={() =>
                                    updateNode({
                                      employee: {
                                        ...node.employee!,
                                        skills: node.employee!.skills.filter(
                                          (item) => item !== path,
                                        ),
                                      },
                                    })
                                  }
                                >
                                  {path.split("/").at(-2)} ×
                                </Button>
                              ))}
                            </div>
                            <div className="max-h-44 space-y-2 overflow-auto rounded-md border border-border/60 p-3">
                              {catalog.data?.skills
                                .filter((skill) =>
                                  skill.name.toLowerCase().includes(search.toLowerCase()),
                                )
                                .slice(0, 80)
                                .map((skill) => (
                                  <label
                                    key={skill.path}
                                    className="flex items-start gap-2 text-xs"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={node.employee!.skills.includes(skill.path)}
                                      disabled={
                                        !node.employee!.skills.includes(skill.path) &&
                                        node.employee!.skills.length >= 12
                                      }
                                      onChange={(event) =>
                                        updateNode({
                                          employee: {
                                            ...node.employee!,
                                            skills: event.target.checked
                                              ? [...node.employee!.skills, skill.path]
                                              : node.employee!.skills.filter(
                                                  (item) => item !== skill.path,
                                                ),
                                          },
                                        })
                                      }
                                    />
                                    <span className="break-all">{skill.name}</span>
                                  </label>
                                ))}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              显示前 80 个匹配结果，可输入关键词缩小范围。Skills
                              作为任务指引；依赖的 MCP 或外部工具仍需单独适配。
                            </p>
                          </div>
                        )}
                      </section>
                    )}
                    <details className="space-y-3 rounded-lg border border-border/60 p-4">
                      <summary className="cursor-pointer text-sm">授权说明与记忆范围</summary>
                      <label className="block space-y-1 text-sm">
                        授权说明
                        <Textarea
                          value={node.authority}
                          onChange={(event) => updateNode({ authority: event.target.value })}
                        />
                      </label>
                      <label className="block space-y-1 text-sm">
                        记忆范围
                        <Textarea
                          value={node.memory}
                          onChange={(event) => updateNode({ memory: event.target.value })}
                        />
                      </label>
                      <p className="text-xs text-muted-foreground">
                        这些说明不授予发布、付费或访问私人资料的权限。实际执行仍受公司后台边界约束。
                      </p>
                    </details>
                    <div className="flex flex-wrap items-center gap-3">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!canRemove}
                        onClick={() => {
                          setDraft({
                            ...draft,
                            nodes: draft.nodes.filter((item) => item.id !== node.id),
                          });
                          setSelection(draft.nodes[0]!.id);
                        }}
                      >
                        删除此节点
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        有下级、被流程引用或属于内置流程的节点需先解除关联。
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
            {section === "flows" && (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-48 flex-1">
                    <select
                      aria-label="选择工作流程"
                      className={control}
                      value={flowSelection}
                      onChange={(event) => setFlowSelection(event.target.value)}
                    >
                      <option value="">选择自定义流程</option>
                      {flows.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button
                    variant="outline"
                    disabled={!departments.length}
                    onClick={() => {
                      const id = `flow-${randomUUID()}`;
                      setDraft({
                        ...draft,
                        workflows: [
                          ...flows,
                          {
                            id,
                            name: "新工作流程",
                            departmentId: departments[0]!.id,
                            enabled: false,
                            steps: [],
                          },
                        ],
                      });
                      setFlowSelection(id);
                    }}
                  >
                    添加流程
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  小红书是保留的内置模板；这里可以创建不限业务类型的顺序流程。每个阶段指定员工、交付文件和验收条件。
                </p>
                {flow && (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="space-y-1 text-sm">
                        流程名称
                        <Input
                          nativeInput
                          value={flow.name}
                          onChange={(event) => updateFlow({ name: event.target.value })}
                        />
                      </label>
                      <label className="space-y-1 text-sm">
                        所属部门
                        <select
                          className={control}
                          value={flow.departmentId}
                          onChange={(event) => updateFlow({ departmentId: event.target.value })}
                        >
                          {departments.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={flow.enabled}
                        onChange={(event) => updateFlow({ enabled: event.target.checked })}
                      />
                      启用此流程，允许新建任务
                    </label>
                    <ol className="space-y-4">
                      {flow.steps.map((step, index) => (
                        <li
                          key={step.id}
                          className="space-y-3 rounded-lg border border-border/60 p-4"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs text-muted-foreground">
                              第 {index + 1} 阶段 ·{" "}
                              {step.kind === "review" ? "独立审核" : "执行交付"}
                            </span>
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={index === 0}
                                onClick={() => {
                                  const steps = [...flow.steps];
                                  [steps[index - 1], steps[index]] = [
                                    steps[index]!,
                                    steps[index - 1]!,
                                  ];
                                  updateFlow({ steps });
                                }}
                              >
                                上移
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={index === flow.steps.length - 1}
                                onClick={() => {
                                  const steps = [...flow.steps];
                                  [steps[index], steps[index + 1]] = [
                                    steps[index + 1]!,
                                    steps[index]!,
                                  ];
                                  updateFlow({ steps });
                                }}
                              >
                                下移
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  updateFlow({
                                    steps: flow.steps.filter((item) => item.id !== step.id),
                                  })
                                }
                              >
                                移除
                              </Button>
                            </div>
                          </div>
                          <div className="grid gap-4 sm:grid-cols-2">
                            <label className="space-y-1 text-sm">
                              阶段名称
                              <Input
                                nativeInput
                                value={step.name}
                                onChange={(event) =>
                                  updateStep(index, { name: event.target.value })
                                }
                              />
                            </label>
                            <label className="space-y-1 text-sm">
                              负责人
                              <select
                                className={control}
                                value={step.employeeId}
                                onChange={(event) =>
                                  updateStep(index, { employeeId: event.target.value })
                                }
                              >
                                {employees.map((item) => (
                                  <option key={item.id} value={item.id}>
                                    {item.name} · {item.employee!.model}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                          <label className="block space-y-1 text-sm">
                            本阶段工作
                            <Textarea
                              rows={2}
                              value={step.instructions}
                              onChange={(event) =>
                                updateStep(index, { instructions: event.target.value })
                              }
                            />
                          </label>
                          <label className="block space-y-1 text-sm">
                            验收标准
                            <Textarea
                              rows={2}
                              value={step.acceptance}
                              onChange={(event) =>
                                updateStep(index, { acceptance: event.target.value })
                              }
                            />
                          </label>
                          <label className="block space-y-1 text-sm">
                            交付文件（每行一个，以 outputs/ 开头）
                            <Textarea
                              rows={2}
                              value={step.outputFiles.join("\n")}
                              onChange={(event) =>
                                updateStep(index, { outputFiles: event.target.value.split("\n") })
                              }
                              placeholder="outputs/result.md"
                            />
                          </label>
                        </li>
                      ))}
                    </ol>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={flow.steps.length >= 12 || flow.steps.at(-1)?.kind === "review"}
                        onClick={() => addStep("produce")}
                      >
                        添加执行阶段
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={
                          !flow.steps.length ||
                          flow.steps.length >= 12 ||
                          flow.steps.at(-1)?.kind === "review"
                        }
                        onClick={() => addStep("review")}
                      >
                        添加独立审核
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setDraft({
                            ...draft,
                            workflows: flows.filter((item) => item.id !== flow.id),
                          });
                          setFlowSelection("");
                        }}
                      >
                        删除流程
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      流程结束统一交你最终验收。删除或修改配置不影响已经创建的任务；新任务采用新配置。
                    </p>
                  </>
                )}
              </div>
            )}
            {error && (
              <p
                role="alert"
                className="whitespace-pre-wrap break-words rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
              >
                {error}
              </p>
            )}
            {discard && (
              <div
                role="alert"
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4"
              >
                <p className="text-sm">关闭将放弃尚未保存的修改。</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setDiscard(false)}>
                    继续编辑
                  </Button>
                  <Button size="sm" variant="outline" onClick={onClose}>
                    放弃并关闭
                  </Button>
                </div>
              </div>
            )}
          </fieldset>
        </DialogPanel>
        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={() => setDiscard(true)}>
            取消
          </Button>
          <Button disabled={busy || !revision} onClick={save}>
            {busy ? "正在保存…" : "保存配置"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
