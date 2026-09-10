import { cn } from "@/lib/utils";
import {
  LEVEL_LABELS,
  LEVEL_PILL_CLASS,
  stageLabel,
  type Subject,
  type SubjectMode,
} from "./subject-schema";

interface SubjectDictionaryTableProps {
  subjects: Subject[];
}

/**
 * 完整科目字典表（折叠展开）
 *
 * Server Component，使用原生 <details> 实现折叠，按 level 排序展示。
 */
export function SubjectDictionaryTable({ subjects }: SubjectDictionaryTableProps) {
  const sorted = subjects.slice().sort((a, b) => a.level.localeCompare(b.level));

  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-inputs bg-white px-5 py-3.5 text-sm font-medium text-ash shadow-steep-sm [&::-webkit-details-marker]:hidden">
        <span className="text-graphite transition-transform group-open:rotate-90">▸</span>
        查看完整科目字典表（{subjects.length} 项）
      </summary>
      <div className="mt-2 overflow-hidden rounded-cards bg-white shadow-steep-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-dove/40 bg-fog text-left text-[11px] tracking-wide text-graphite">
                <th className="px-3 py-2 font-medium">ID</th>
                <th className="px-3 py-2 font-medium">科目名称</th>
                <th className="px-3 py-2 font-medium">归入成本层级</th>
                <th className="px-3 py-2 font-medium">进损益</th>
                <th className="px-3 py-2 font-medium">业务模式</th>
                <th className="px-3 py-2 font-medium">业务阶段</th>
                <th className="px-3 py-2 font-medium">备注</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-dove/30 transition-colors last:border-0 hover:bg-apricot-wash/20"
                >
                  <td className="px-3 py-2 font-mono text-[11px] text-graphite">{s.id}</td>
                  <td className="px-3 py-2 font-medium text-ink">
                    {s.name}
                    {!s.system && (
                      <span className="ml-1 rounded bg-apricot-wash px-1 text-[9px] text-rust">
                        自定义
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                        LEVEL_PILL_CLASS[s.level],
                      )}
                    >
                      {LEVEL_LABELS[s.level]}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {s.pnl ? (
                      <span className="rounded bg-apricot-wash px-1.5 py-0.5 text-[11px] text-rust">
                        是
                      </span>
                    ) : (
                      <span className="rounded bg-fog px-1.5 py-0.5 text-[11px] text-graphite">
                        否
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <ModeTicks modes={s.modes as SubjectMode[]} />
                  </td>
                  <td className="px-3 py-2 text-xs text-ash">
                    {stageLabel(s.modes[0] as SubjectMode, s.stage)}
                  </td>
                  <td className="px-3 py-2 text-xs text-graphite">{s.note ?? "—"}</td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-graphite">
                    暂无科目
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </details>
  );
}

function ModeTicks({ modes }: { modes: SubjectMode[] }) {
  return (
    <span className="inline-flex gap-1">
      <span
        className={cn(
          "rounded px-1.5 py-0.5 text-[10px]",
          modes.includes("agent") ? "bg-apricot-wash text-rust" : "bg-fog text-dove",
        )}
      >
        代理
      </span>
      <span
        className={cn(
          "rounded px-1.5 py-0.5 text-[10px]",
          modes.includes("acquire") ? "bg-sky-wash text-ink" : "bg-fog text-dove",
        )}
      >
        收购
      </span>
    </span>
  );
}
