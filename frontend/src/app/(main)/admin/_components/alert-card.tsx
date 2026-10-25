import { WidgetHead } from "./widgets/widget-head";

interface AlertCardProps {
  count: number;
  /** 最久等待天数（迭代二：设计稿「最久等待 3 天 2 小时」；无待评估时为 0） */
  oldestWaitDays?: number;
  /** 最久等待余数小时 */
  oldestWaitHours?: number;
  /** 涉及的业务负责人数（迭代二新增，distinct 归属） */
  ownerCount?: number;
}

/**
 * 工作台「待评估提醒」暖卡（span 3，设计稿屏 01 第 3 卡）。
 *
 * 严格对齐 hifi `.wg.warm`（决策 01：Apricot 是全屏唯一暖卡，无阴影）：
 * - 卡头标题与「去处理」链接都用 Rust（`.wg.warm .wg-title/.sec-link`）；
 * - 大数字 52px Signifier + 两行说明。原「评估预警」徽章为设计稿没有的
 *   自造元素，按「严格对齐设计稿」口径移除。
 */
export function AlertCard({ count, oldestWaitDays, oldestWaitHours, ownerCount }: AlertCardProps) {
  return (
    <div
      className="flex min-w-0 flex-1 flex-col rounded-cards bg-apricot-wash px-[22px] py-5"
      role="region"
      aria-label="待评估提醒"
    >
      <WidgetHead
        title="待评估提醒"
        link="去处理"
        href="/admin/leads"
        titleClassName="text-rust"
        linkClassName="text-rust hover:text-[#3f1c11]"
      />

      <div
        className="font-display mt-3.5 text-[52px] leading-none text-rust tabular-nums"
        aria-live="polite"
        aria-atomic="true"
      >
        {count}
      </div>

      <p className="mt-2.5 text-[13px] leading-[1.5] text-rust/80">
        {count === 0 ? (
          "暂无待评估线索，处理得很及时"
        ) : (
          <>
            最久等待 {oldestWaitDays ?? 0} 天 {oldestWaitHours ?? 0} 小时
            {ownerCount != null && (
              <>
                <br />
                涉及 {ownerCount} 位业务负责人
              </>
            )}
          </>
        )}
      </p>
    </div>
  );
}
