import { FileText, TrendingUp, User, MapPin, FileCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Project } from "../../../../../types";
import { InfoSection } from "../../../components/info-section";
import { InfoItem } from "../../../components/info-item";
import { formatDate, formatPrice } from "../../../utils";

interface InfoTabProps {
  project: Project;
}

/**
 * 信息 Tab - 展示项目详细信息
 * 按照创建表单的结构组织：基础信息、代理协议、业主信息
 */
export function InfoTab({ project }: InfoTabProps) {
  // 脱敏函数：前3后4，中间用*代替
  const maskString = (str?: string | null, keepStart = 3, keepEnd = 4): string | undefined => {
    if (!str) return undefined;
    if (str.length <= keepStart + keepEnd) return str;
    const start = str.slice(0, keepStart);
    const end = str.slice(-keepEnd);
    const middle = "*".repeat(str.length - keepStart - keepEnd);
    return `${start}${middle}${end}`;
  };

  // 格式化户型显示
  const formatLayout = (layout?: string | null): string | undefined => {
    if (!layout) return undefined;
    // 将 "3室2厅2卫" 格式化为更友好的显示
    const match = layout.match(/(\d+)室(\d+)厅(\d+)卫/);
    if (match) {
      return `${match[1]}室${match[2]}厅${match[3]}卫`;
    }
    return layout;
  };

  return (
    <div className="space-y-4">
      {/* --- 基础信息 --- */}
      <InfoSection title="基础信息" icon={<MapPin className="h-4 w-4" />}>
        {/* 小区名称 */}
        <InfoItem label="小区名称" value={project.community_name} />

        {/* 产证面积 */}
        <InfoItem
          label="产证面积"
          value={project.area ? `${project.area} ㎡` : undefined}
        />

        {/* 户型 */}
        <InfoItem
          label="户型"
          value={formatLayout(project.layout)}
        />

        {/* 朝向 */}
        <InfoItem
          label="朝向"
          value={project.orientation}
        />

        {/* 详细地址 */}
        <InfoItem
          label="详细地址"
          value={project.address}
          className="sm:col-span-2"
          copyable
          copyValue={project.address}
        />
      </InfoSection>

      {/* --- 代理协议 --- */}
      <InfoSection title="代理协议" icon={<FileCheck className="h-4 w-4" />}>
        {/* 合同编号 */}
        <InfoItem
          label="合同编号"
          value={project.contract_no}
          copyable
          copyValue={project.contract_no}
        />

        {/* 签约日期 */}
        <InfoItem
          label="签约日期"
          value={formatDate(project.signing_date)}
        />

        {/* 交房日期 */}
        <InfoItem
          label="交房日期"
          value={formatDate(project.planned_handover_date)}
        />

        {/* 签约价格 */}
        <InfoItem
          label="签约价格"
          value={formatPrice(project.signing_price)}
          highlight
        />

        {/* 合同周期 */}
        <InfoItem
          label="合同周期"
          value={
            project.signing_period
              ? `${project.signing_period} 天`
              : undefined
          }
        />

        {/* 顺延期 */}
        <InfoItem
          label="顺延期"
          value={
            project.extension_period
              ? `${project.extension_period} 天`
              : undefined
          }
        />

        {/* 顺延期租金 */}
        <InfoItem
          label="顺延期租金"
          value={
            project.extension_rent
              ? `¥ ${project.extension_rent} / 月`
              : undefined
          }
        />

        {/* 税费及佣金承担方 */}
        <InfoItem
          label="税费及佣金承担方"
          value={project.cost_assumption}
          className="sm:col-span-2"
        />

        {/* 其他约定条款 */}
        <InfoItem
          label="其他约定条款"
          value={project.other_agreements}
          className="sm:col-span-2"
        />
      </InfoSection>

      {/* --- 业主信息 --- */}
      <InfoSection title="业主信息" icon={<User className="h-4 w-4" />}>
        {/* 业主姓名 */}
        <InfoItem label="业主姓名" value={project.owner_name} />

        {/* 业主联系方式 - 脱敏显示，支持复制完整数据 */}
        <InfoItem
          label="业主联系方式"
          value={maskString(project.owner_phone)}
          copyable
          copyValue={project.owner_phone}
        />

        {/* 业主身份证 - 脱敏显示，支持复制完整数据 */}
        <InfoItem
          label="业主身份证"
          value={maskString(project.owner_id_card)}
          copyable
          copyValue={project.owner_id_card}
          className="sm:col-span-2"
        />
      </InfoSection>

      {/* --- 交易数据（保留作为参考） --- */}
      <InfoSection title="交易数据" icon={<TrendingUp className="h-4 w-4" />}>
        <InfoItem
          label="挂牌价"
          value={formatPrice(project.list_price)}
          highlight
        />
        <InfoItem
          label="成交价"
          value={
            project.sold_price ? (
              <span className="text-green-600 font-bold font-mono">
                {formatPrice(project.sold_price)}
              </span>
            ) : undefined
          }
        />
        <InfoItem
          label="现金流"
          value={
            project.net_cash_flow !== undefined ? (
              <span
                className={cn(
                  "font-bold font-mono",
                  (project.net_cash_flow ?? 0) >= 0
                    ? "text-green-600"
                    : "text-red-500"
                )}
              >
                {formatPrice((project.net_cash_flow || 0) / 10000)}
              </span>
            ) : undefined
          }
        />
        <InfoItem
          label="成交日期"
          value={formatDate(project.sold_date)}
        />
        <InfoItem
          label="上架日期"
          value={formatDate(project.listing_date)}
        />
      </InfoSection>

      {/* --- 备注 --- */}
      <InfoSection title="备注" icon={<FileText className="h-4 w-4" />}>
        <InfoItem
          label="备注"
          value={project.notes}
          className="sm:col-span-2"
        />
      </InfoSection>
    </div>
  );
}
