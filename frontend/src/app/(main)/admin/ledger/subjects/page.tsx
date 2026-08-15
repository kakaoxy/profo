import { listSubjects } from "./actions";
import { SubjectFlowchart } from "./_components/subject-flowchart";
import { SubjectDictionaryTable } from "./_components/subject-dictionary-table";
import type { Subject } from "./_components/subject-schema";

/**
 * 科目管理页（Server Component）
 *
 * 并行请求 agent / acquire 两套科目（消除请求瀑布），传递给流程图组件展示。
 */
export default async function SubjectManagePage() {
  const [agentRes, acquireRes] = await Promise.all([
    listSubjects("agent"),
    listSubjects("acquire"),
  ]);

  const agentSubjects: Subject[] = agentRes.success ? agentRes.data : [];
  const acquireSubjects: Subject[] = acquireRes.success ? acquireRes.data : [];

  // 两套列表可能含同一科目（同时属于两种模式），按 id 去重供字典表展示
  const seen = new Set<string>();
  const allSubjects = [...agentSubjects, ...acquireSubjects].filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });

  // F1: 显式检查各自的 success 分支，让 TS 正确窄化 ActionResult 联合类型
  const errorMsg = !agentRes.success
    ? agentRes.message
    : !acquireRes.success
      ? acquireRes.message
      : null;

  return (
    <div className="min-h-screen bg-muted">
      <div className="mx-auto flex w-full max-w-400 flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">科目管理</h1>
          <p className="text-sm text-muted-foreground">
            按业务流阶段呈现科目 · 支持增删改查 · 代理/收购双模式切换
          </p>
        </div>

        <div className="flex items-start gap-2 rounded-lg border border-rust/20 bg-apricot-wash/30 px-4 py-3 text-sm text-rust">
          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-rust text-[10px] font-bold text-pure-white">
            i
          </span>
          <span>
            按项目业务流分阶段呈现科目：每个阶段下挂该阶段会发生的科目。系统预置科目不可删除，用户自定义科目可增删改。
          </span>
        </div>

        {errorMsg && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {errorMsg}
          </div>
        )}

        <SubjectFlowchart agentSubjects={agentSubjects} acquireSubjects={acquireSubjects} />

        <SubjectDictionaryTable subjects={allSubjects} />
      </div>
    </div>
  );
}
