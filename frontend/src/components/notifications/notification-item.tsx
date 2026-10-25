import { Phone, Megaphone, Kanban, KeyRound, Smartphone, Wallet, Settings, ShieldCheck } from "lucide-react";
import type { NotificationDeliverySnapshot, NotificationListItem } from "./shared";
import { formatRelativeTime } from "./shared";

/** 分类 → 图标 */
const CATEGORY_ICONS: Record<string, typeof Phone> = {
  lead: Phone,
  growth: Megaphone,
  project: Kanban,
  key: KeyRound,
  marketing: Smartphone,
  finance: Wallet,
  system: Settings,
  security: ShieldCheck,
};

interface DeliveryTagProps {
  delivery?: NotificationDeliverySnapshot | null;
}

/**
 * 投递状态点（设计稿补充口径 b：把 TEMPLATE_MISSING 从日志搬到用户可见处）。
 * 绿=送达 / 灰=跳过 / Rust=失败。
 */
export function DeliveryTag({ delivery }: DeliveryTagProps) {
  const wechat = delivery?.wechat;
  if (!wechat) return null;

  const { status, error_code: errorCode } = wechat;
  const label =
    status === "success" ? "微信已送达" : status === "skipped" ? "微信跳过" : "微信失败";
  const tip =
    status === "skipped" && errorCode === "TEMPLATE_MISSING"
      ? "微信跳过：模板未配置"
      : status === "skipped" && errorCode === "NO_OPENID"
        ? "微信跳过：用户未绑定 openid"
        : status === "failed"
          ? `微信失败${errorCode ? `：${errorCode}` : ""}`
          : "微信已送达";
  const dotClass =
    status === "success" ? "bg-money-negative" : status === "failed" ? "bg-rust" : "bg-dove";

  return (
    <span className="inline-flex items-center gap-1 text-[11.5px] text-graphite" title={tip}>
      <i className={`h-1.5 w-1.5 rounded-full ${dotClass}`} aria-hidden="true" />
      {label}
    </span>
  );
}

interface NotificationItemProps {
  item: NotificationListItem;
  /** 点击（标记已读 + 按 action_type 跳转） */
  onRead: (item: NotificationListItem) => void;
  /** 紧凑模式（抽屉内） */
  compact?: boolean;
}

/** 消息行（抽屉与消息中心共用，设计稿 §06 组件状态：未读实心底 + 圆点 / 已读降权） */
export function NotificationItem({ item, onRead, compact = false }: NotificationItemProps) {
  const Icon = CATEGORY_ICONS[item.category] ?? Settings;
  const unread = !item.read_at;
  const isUrgent = item.priority === "urgent";

  return (
    <button
      type="button"
      onClick={() => onRead(item)}
      aria-label={`${unread ? "未读，" : ""}${item.title}`}
      className={`flex w-full items-start gap-3 rounded-inputs text-left transition-colors hover:bg-fog ${
        compact ? "px-3 py-2.5" : "px-4 py-3.5"
      } ${unread ? "bg-white" : ""} ${isUrgent ? "border-l-2 border-rust" : ""}`}
    >
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-fog text-graphite">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span
            className={`truncate text-[13.5px] ${
              unread ? "font-[480] text-ink" : "font-[430] text-ash"
            }`}
          >
            {item.title}
          </span>
          {isUrgent && (
            <span className="shrink-0 rounded-pill bg-apricot-wash px-2 py-0.5 text-[11px] text-rust">
              紧急
            </span>
          )}
          {item.priority === "high" && (
            <span className="shrink-0 rounded-pill border border-dove/50 px-2 py-0.5 text-[11px] text-graphite">
              重要
            </span>
          )}
        </span>
        {item.body && (
          <span className="mt-0.5 block truncate text-[12.5px] text-graphite">{item.body}</span>
        )}
      </span>

      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-[11.5px] text-dove">{formatRelativeTime(item.created_at)}</span>
        <span className="flex items-center gap-1.5">
          <DeliveryTag delivery={item.delivery} />
          {unread && <i className="h-1.5 w-1.5 rounded-full bg-ink" aria-hidden="true" />}
        </span>
      </span>
    </button>
  );
}

