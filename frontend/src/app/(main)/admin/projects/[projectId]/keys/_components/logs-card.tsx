import { Badge } from "@/components/ui/badge";
import { safeFormatDate } from "@/lib/formatters";

import { KEY_LOG_ACTION_META, KEY_LOG_ACTOR_META, keyLogSummary } from "./constants";
import type { KeyLogItem } from "./constants";

interface LogsCardProps {
  logs: KeyLogItem[];
}

/** 操作日志卡：时间线列表（时间 / 操作人 / 动作 Badge / 对象摘要），倒序由后端保证。 */
export function LogsCard({ logs }: LogsCardProps) {
  return (
    <section className="rounded-cards bg-pure-white p-6 shadow-steep">
      <h3 className="text-base font-[500] text-ink">操作日志</h3>
      {logs.length === 0 ? (
        <p className="mt-3 text-sm font-[430] text-graphite">暂无操作日志</p>
      ) : (
        <ul className="mt-2">
          {logs.map((log) => {
            const actionMeta = KEY_LOG_ACTION_META[log.action] ?? {
              label: log.action,
              variant: "outline" as const,
            };
            const actorMeta = KEY_LOG_ACTOR_META[log.actor_type] ?? {
              label: log.actor_type,
              variant: "outline" as const,
            };
            const summary = keyLogSummary(log);
            return (
              <li
                key={log.id}
                className="flex items-center gap-3 border-b border-[#f0f0f2] py-[11px] text-sm last:border-b-0"
              >
                <span className="w-[120px] shrink-0 text-[13px] font-[430] text-graphite">
                  {safeFormatDate(log.created_at, "yyyy.MM.dd HH:mm")}
                </span>
                <span
                  className="w-[96px] shrink-0 truncate text-[13.5px] font-[450] text-ink"
                  title={log.actor_name ?? undefined}
                >
                  {log.actor_name ?? "—"}
                </span>
                <Badge variant={actorMeta.variant} className="shrink-0">
                  {actorMeta.label}
                </Badge>
                <Badge variant={actionMeta.variant} className="shrink-0">
                  {actionMeta.label}
                </Badge>
                {summary && (
                  <span className="min-w-0 truncate text-[13px] font-[430] text-graphite">
                    {summary}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
