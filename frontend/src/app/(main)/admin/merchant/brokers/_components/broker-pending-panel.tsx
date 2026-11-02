import type { components } from "@/lib/api-types";
import { BrokerAvatar } from "./broker-avatar";

type PendingBinding = components["schemas"]["BrokerBindingResponse"];

function formatPendingTime(value: string): string {
  const date = new Date(value);
  const now = new Date();
  const time = date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  if (startOfDate === startOfToday) return `今天 ${time}`;
  if (startOfToday - startOfDate === 86_400_000) return `昨天 ${time}`;
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** 待审核绑定聚合卡（REQ-IT7-04）.*/
export function BrokerPendingPanel({
  pending,
  onApprove,
  onViewAll,
}: {
  pending: PendingBinding[];
  onApprove: (id: string, approve: boolean) => void;
  onViewAll: () => void;
}) {
  if (!pending.length) return null;

  return (
    <section className="rounded-cards bg-white px-5 py-4 shadow-steep-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-ink">
          待审核绑定 <span className="ml-1 text-rust">{pending.length}</span>
        </h2>
        <button
          type="button"
          className="text-xs text-graphite underline-offset-4 hover:underline"
          onClick={onViewAll}
        >
          查看全部
        </button>
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {pending.slice(0, 4).map((item) => (
          <div key={item.id} className="flex items-center gap-3 rounded-inputs bg-fog px-4 py-3">
            <BrokerAvatar name={item.broker_name || "经纪人"} id={item.id} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{item.broker_name || "经纪人"}</p>
              <p className="mt-0.5 truncate text-[11px] text-graphite">
                {item.store_name} · {formatPendingTime(item.applied_at)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <button
                type="button"
                className="text-xs font-medium text-rust underline-offset-4 hover:underline"
                onClick={() => onApprove(item.id, true)}
              >
                通过
              </button>
              <button
                type="button"
                className="text-xs text-graphite underline-offset-4 hover:underline"
                onClick={() => onApprove(item.id, false)}
              >
                驳回
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
