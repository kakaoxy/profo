import { FileText, TrendingUp, User, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { Project } from "../../../types";
import { InfoSection } from "../info-section";
import { InfoItem } from "../info-item";
import { formatDate, formatPrice } from "../utils";

interface InfoTabProps {
  project: Project;
}

/**
 * 信息 Tab - 展示项目详细信息
 */
export function InfoTab({ project }: InfoTabProps) {
  return (
    <div className="space-y-4">
      {/* 基础信息 */}
      <InfoSection title="基础信息" icon={<MapPin className="h-4 w-4" />}>
        <div className="grid grid-cols-2 gap-2">
          <InfoItem label="小区" value={project.community_name} />
          <InfoItem label="负责人" value={project.manager} />
          <InfoItem
            label="面积"
            value={project.area ? `${project.area} ㎡` : undefined}
          />
          <InfoItem label="标签" value={project.tags?.join(", ")} />
          <InfoItem
            label="地址"
            value={project.address}
            className="col-span-2"
            copyable
            copyValue={project.address}
          />
        </div>
      </InfoSection>

      {/* 交易数据 */}
      <InfoSection title="交易数据" icon={<TrendingUp className="h-4 w-4" />}>
        <div className="grid grid-cols-2 gap-2">
          <InfoItem
            label="签约价"
            value={formatPrice(project.signing_price)}
            highlight
          />
          <InfoItem
            label="挂牌价"
            value={formatPrice(project.list_price)}
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
                    project.net_cash_flow >= 0 ? "text-green-600" : "text-red-500"
                  )}
                >
                  {formatPrice(project.net_cash_flow)}
                </span>
              ) : undefined
            }
          />
          <InfoItem
            label="签约周期"
            value={
              project.signing_period
                ? `${project.signing_period} 个月`
                : undefined
            }
          />
          <InfoItem label="签约日期" value={formatDate(project.signing_date)} />
          <InfoItem
            label="计划交房"
            value={formatDate(project.planned_handover_date)}
          />
          <InfoItem label="成交日期" value={formatDate(project.sold_date)} />
        </div>
      </InfoSection>

      {/* 业主信息 */}
      <InfoSection title="业主信息" icon={<User className="h-4 w-4" />}>
        <div className="grid grid-cols-2 gap-2">
          <InfoItem label="业主姓名" value={project.owner_name} />
          <InfoItem
            label="联系电话"
            value={project.owner_phone}
            copyable
            copyValue={project.owner_phone}
          />
          <InfoItem
            label="身份证号"
            value={
              project.owner_id_card
                ? `${project.owner_id_card.slice(0, 6)}****${project.owner_id_card.slice(-4)}`
                : undefined
            }
            copyable
            copyValue={project.owner_id_card}
            className="col-span-2"
          />
        </div>
      </InfoSection>

      {/* 合同与备注 */}
      {(project.cost_assumption ||
        project.other_agreements ||
        project.notes ||
        project.remarks) && (
        <InfoSection title="合同与备注" icon={<FileText className="h-4 w-4" />}>
          <div className="space-y-2">
            <InfoItem label="费用承担" value={project.cost_assumption} />
            <InfoItem label="其他约定" value={project.other_agreements} />
            <InfoItem label="备注" value={project.notes || project.remarks} />
          </div>
        </InfoSection>
      )}
    </div>
  );
}
