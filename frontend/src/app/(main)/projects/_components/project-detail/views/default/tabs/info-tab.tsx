import { FileText, TrendingUp, User, MapPin } from "lucide-react";
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
 */
export function InfoTab({ project }: InfoTabProps) {
  // 1. 获取备注内容：日志显示 notes 和 remarks 可能为 null，做个兼容
  // 如果两者都没有，InfoItem 会自动显示 "-"
  const remarksContent = project.notes || project.remarks;

  return (
    <div className="space-y-4">
      {/* --- 基础信息 --- */}
      <InfoSection title="基础信息" icon={<MapPin className="h-4 w-4" />}>
        {/* 小区名称：日志显示为 community_name */}
        <InfoItem label="小区" value={project.community_name} />

        {/* 负责人：日志显示为 manager */}
        <InfoItem label="负责人" value={project.manager} />

        {/* 面积：日志显示为 area */}
        <InfoItem
          label="面积"
          value={project.area ? `${project.area} ㎡` : undefined}
        />

        {/* 标签：日志显示为 tags (null) */}
        <InfoItem label="标签" value={project.tags?.join(", ")} />

        {/* 地址：日志显示为 address */}
        <InfoItem
          label="地址"
          value={project.address}
          className="sm:col-span-2"
          copyable
          copyValue={project.address}
        />
      </InfoSection>

      {/* --- 交易数据 --- */}
      <InfoSection title="交易数据" icon={<TrendingUp className="h-4 w-4" />}>
        <InfoItem
          label="签约价"
          value={formatPrice(project.signingPrice || project.signing_price)}
          highlight
        />
        <InfoItem
          label="挂牌价"
          value={formatPrice(project.listPrice || project.list_price)}
          highlight
        />
        <InfoItem
          label="成交价"
          value={
            project.soldPrice || project.sold_price ? (
              <span className="text-green-600 font-bold font-mono">
                {formatPrice(project.soldPrice || project.sold_price)}
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
          label="签约周期"
          value={
            project.signingPeriod || project.signing_period
              ? `${project.signingPeriod || project.signing_period} 个月`
              : undefined
          }
        />

        {/* --- [新增] 延长期 --- */}
        <InfoItem
          label="延长期"
          value={
            project.extensionPeriod || project.extension_period
              ? `${project.extensionPeriod || project.extension_period} 个月`
              : undefined
          }
        />

        {/* --- [新增] 延期租金 --- */}
        <InfoItem
          label="延期租金"
          value={
            project.extensionRent || project.extension_rent
              ? `¥ ${project.extensionRent || project.extension_rent} / 月`
              : undefined
          }
        />

        <InfoItem
          label="签约日期"
          value={formatDate(project.signingDate || project.signing_date)}
        />
        <InfoItem
          label="计划交房"
          value={formatDate(
            project.plannedHandoverDate || project.planned_handover_date
          )}
        />
        <InfoItem
          label="成交日期"
          value={formatDate(project.soldDate || project.sold_date)}
        />
        <InfoItem
          label="上架日期"
          value={formatDate(project.listing_date)}
        />
      </InfoSection>

      {/* --- 业主信息 --- */}
      <InfoSection title="业主信息" icon={<User className="h-4 w-4" />}>
        {/* 业主姓名：日志显示为 owner_name */}
        <InfoItem label="业主姓名" value={project.owner_name} />

        {/* 联系电话：日志显示为 owner_phone */}
        <InfoItem
          label="联系电话"
          value={project.owner_phone}
          copyable
          copyValue={project.owner_phone}
        />

        {/* 身份证号：日志显示为 owner_id_card */}
        <InfoItem
          label="身份证号"
          value={
            project.owner_id_card
              ? `${project.owner_id_card.slice(
                  0,
                  6
                )}****${project.owner_id_card.slice(-4)}`
              : undefined
          }
          copyable
          copyValue={project.owner_id_card}
          className="sm:col-span-2"
        />
      </InfoSection>

      {/* --- 合同与备注 --- */}
      {/* 始终渲染此区域，哪怕字段为空 */}
      <InfoSection title="合同与备注" icon={<FileText className="h-4 w-4" />}>
        {/* 费用承担：日志显示为 costAssumption */}
        <InfoItem
          label="费用承担"
          value={project.costAssumption}
          className="sm:col-span-2"
        />

        {/* 其他约定：日志显示为 otherAgreements */}
        <InfoItem
          label="其他约定"
          value={project.otherAgreements}
          className="sm:col-span-2"
        />

        {/* 备注：使用上面计算的 remarksContent */}
        <InfoItem
          label="备注"
          value={remarksContent}
          className="sm:col-span-2"
        />
      </InfoSection>
    </div>
  );
}
