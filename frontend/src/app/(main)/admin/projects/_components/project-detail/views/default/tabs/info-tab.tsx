"use client";

import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { Project } from "../../../../../types";
import { formatDate, formatPrice } from "../../../utils";
import { searchCommunitiesAction } from "@/app/(main)/admin/leads/actions/search-communities";
import { InfoInlineEditor } from "./info-inline-editor";
import {
  BUSINESS_FORM_LABEL,
  formatLayout,
  formatCostAssumption,
  formatCommissionRange,
  GroupTitle,
  InfoCell,
  BankCardItem,
  RevealableField,
} from "./info-tab-display";

interface InfoTabProps {
  project: Project;
  /**
   * 卡头「编辑」textlink（旧抽屉链路：点击打开页面级编辑弹窗）。
   * inlineEditable=true 时忽略此回调，编辑按钮改为进入就地编辑态。
   */
  onEdit?: () => void;
  /** V4.3 就地编辑：true 时卡头「编辑」切换为卡片内编辑态（不再弹窗） */
  inlineEditable?: boolean;
  /** 就地编辑保存成功回调（父组件局部刷新数据） */
  onInlineSaved?: () => void;
  /** 页面级用户列表（userId → 展示名），就地编辑的项目负责人下拉复用 */
  usersById?: Map<string, string>;
  /** 外部触发进入编辑态（顶栏「编辑」：递增计数 + 滚动锚点） */
  editRequest?: number;
}

/**
 * 信息 Tab（V4.2 · 设计稿 1:1）— 项目信息卡
 * 单卡容器 + 卡头（标题/副题/编辑 textlink），组内分组：
 * 房源信息 / 业主信息（含人数 pill）/ 合同要件 / 公用事业户号，
 * 交易数据保留置于末尾（设计稿无此组，保留是为不丢数据）。
 * 备注不再渲染（签约阶段副列「备注」卡已承载，避免重复）。
 * 展示子组件与格式化函数见 info-tab-display.tsx（本文件保持 <500 行）。
 */
export function InfoTab({
  project,
  onEdit,
  inlineEditable = false,
  onInlineSaved,
  usersById,
  editRequest,
}: InfoTabProps) {
  const [isEditing, setIsEditing] = useState(false);

  // 外部触发编辑（顶栏「编辑」editRequest 递增 → 进入编辑态）
  useEffect(() => {
    if (inlineEditable && editRequest && editRequest > 0) {
      setIsEditing(true);
    }
  }, [editRequest, inlineEditable]);

  // 行政区来自小区（Project 本身没有 district 字段），通过小区搜索接口异步拉取
  // 使用 {name, district} 结构避免小区切换时显示陈旧数据
  const [fetched, setFetched] = useState<{
    name: string;
    district?: string;
  } | null>(null);

  useEffect(() => {
    // 已有 district 或无小区名时不查询
    if (project.district || !project.community_name) {
      return;
    }
    const name = project.community_name;
    let mounted = true;
    searchCommunitiesAction(name)
      .then((results) => {
        if (!mounted) return;
        const matched = results.find((c) => c.name === name);
        setFetched({ name, district: matched?.district });
      })
      .catch(() => {
        if (mounted) setFetched({ name, district: undefined });
      });
    return () => {
      mounted = false;
    };
  }, [project.community_name, project.district]);

  const district =
    project.district ||
    (fetched && fetched.name === project.community_name ? fetched.district : undefined);

  // 已售项目展示用时天数
  const isSold = project.status === "sold" || project.status === "已售";
  const daysOnMarket =
    isSold && project.days_on_market != null ? `${project.days_on_market} 天` : undefined;

  // 业主人数（业主 + 共有人）：owners 数组优先，回退单业主字段计 1
  const ownerCount = project.owners?.length ?? (project.owner_name ? 1 : 0);

  return (
    <section className="rounded-cards bg-pure-white p-6 font-sohne shadow-steep">
      {/* 卡头（原型 .card-head）：标题 + 副题 + 编辑入口（就地编辑态 / 旧抽屉弹窗链路） */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-medium text-ink">项目信息</h3>
          <p className="mt-0.5 text-[13px] font-[430] text-graphite">房源、业主与合同要件</p>
        </div>
        {isEditing && inlineEditable ? (
          <span className="text-sm font-[450] text-rust">编辑中</span>
        ) : inlineEditable ? (
          // V4.3 就地编辑：先经页面层全量刷新（onEdit），再借 editRequest 进入编辑态
          <button
            type="button"
            onClick={() => (onEdit ? onEdit() : setIsEditing(true))}
            className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 bg-none text-sm font-[450] text-ink hover:underline hover:underline-offset-4"
          >
            <Pencil className="h-[15px] w-[15px]" />
            编辑
          </button>
        ) : onEdit ? (
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 bg-none text-sm font-[450] text-ink hover:underline hover:underline-offset-4"
          >
            <Pencil className="h-[15px] w-[15px]" />
            编辑
          </button>
        ) : null}
      </div>

      {/* 就地编辑态（V4.3）：复用 create-project 表单体系，保存后父组件局部刷新 */}
      {isEditing && inlineEditable ? (
        <InfoInlineEditor
          project={project}
          usersById={usersById}
          onCancel={() => setIsEditing(false)}
          onSaved={() => {
            setIsEditing(false);
            onInlineSaved?.();
          }}
        />
      ) : (
        <>
          {/* --- 房源信息（卡头后首个分组，无顶部外边距） --- */}
          <GroupTitle className="mt-0">房源信息</GroupTitle>
          <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
            <InfoCell label="小区名称" value={project.community_name} />
            <InfoCell label="行政区" value={district} />
            <InfoCell
              label="业务形式"
              value={project.business_form ? BUSINESS_FORM_LABEL[project.business_form] : "未设置"}
            />
            <InfoCell label="产证面积" value={project.area ? `${project.area} ㎡` : undefined} />
            <InfoCell label="户型" value={formatLayout(project.layout)} />
            <InfoCell label="朝向" value={project.orientation} />
            <InfoCell
              label="详细地址"
              value={project.address}
              full
              copyable
              copyValue={project.address}
            />
          </div>

          {/* --- 业主信息（组题带人数 pill） --- */}
          <GroupTitle
            className="mt-[22px]"
            suffix={
              ownerCount > 0 ? (
                <span className="inline-flex items-center rounded-full border border-[#e2e2e5] bg-pure-white px-[13px] py-[5px] text-[13px] font-[450] text-graphite">
                  共 {ownerCount} 位
                </span>
              ) : undefined
            }
          >
            业主信息
          </GroupTitle>
          <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
            {project.owners && project.owners.length > 0 ? (
              // 多业主遍历（owners 数组优先），块间分隔线保持可读
              project.owners.map((owner, index) => (
                <div
                  key={owner.id ?? `owner-${index}`}
                  className={cn("contents", index > 0 && "[&>*:first-child]:mt-4")}
                >
                  {/* 关系类型：仅非"业主"时显示 */}
                  {owner.relation_type && owner.relation_type !== "业主" && (
                    <InfoCell label="关系类型" value={owner.relation_type} />
                  )}
                  <InfoCell label="业主姓名" value={owner.owner_name} />
                  <RevealableField label="联系电话" value={owner.owner_phone} />
                  <RevealableField label="身份证号" value={owner.owner_id_card} />
                  <InfoCell label="开户行" value={owner.bank_name} />
                  <BankCardItem maskedValue={owner.bank_card_number} ownerId={owner.id} />
                  <InfoCell label="备注" value={owner.owner_info} />
                </div>
              ))
            ) : (
              // 回退到单业主字段（兼容历史数据）
              <>
                <InfoCell label="业主姓名" value={project.owner_name} />
                <RevealableField label="业主联系方式" value={project.owner_phone} />
                <RevealableField label="业主身份证" value={project.owner_id_card} />
              </>
            )}
          </div>

          {/* --- 合同要件 --- */}
          <GroupTitle className="mt-[22px]">合同要件</GroupTitle>
          <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
            <InfoCell
              label="合同编号"
              value={project.contract_no}
              copyable
              copyValue={project.contract_no}
            />
            <InfoCell label="签约日期" value={formatDate(project.signing_date)} />
            <InfoCell label="交房日期" value={formatDate(project.planned_handover_date)} />
            <InfoCell label="签约价格" value={formatPrice(project.signing_price)} />
            <InfoCell
              label="合同周期"
              value={project.signing_period ? `${project.signing_period} 天` : undefined}
            />
            <InfoCell
              label="顺延期"
              value={project.extension_period ? `${project.extension_period} 天` : undefined}
            />
            <InfoCell
              label="顺延期租金"
              value={project.extension_rent ? `¥ ${project.extension_rent} / 月` : undefined}
            />
            <InfoCell label="委托期限" value={formatCommissionRange(project)} full />
            <InfoCell label="税费及佣金承担方" value={formatCostAssumption(project)} full />
            <InfoCell label="其他约定条款" value={project.other_agreements} full />
          </div>

          {/* --- 公用事业户号 --- 仅有值时（任一户号非空）才渲染整个分组 */}
          {(project.electricity_account || project.water_account || project.gas_account) && (
            <>
              <GroupTitle className="mt-[22px]">公用事业户号</GroupTitle>
              <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
                <InfoCell label="电表户号" value={project.electricity_account} />
                <InfoCell label="水表户号" value={project.water_account} />
                <InfoCell label="煤气户号" value={project.gas_account} />
              </div>
            </>
          )}

          {/* --- 交易数据（设计稿无此组，保留是为不丢数据 · 置于末尾） --- */}
          <GroupTitle className="mt-[22px]">交易数据</GroupTitle>
          <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
            <InfoCell label="挂牌价" value={formatPrice(project.list_price)} />
            <InfoCell
              label="成交价"
              value={
                project.sold_price ? (
                  <span className="font-mono text-money-positive">
                    {formatPrice(project.sold_price)}
                  </span>
                ) : undefined
              }
            />
            <InfoCell
              label="现金流"
              value={
                project.net_cash_flow !== undefined ? (
                  <span
                    className={cn(
                      "font-mono",
                      (project.net_cash_flow ?? 0) >= 0
                        ? "text-money-positive"
                        : "text-money-negative",
                    )}
                  >
                    {formatPrice((project.net_cash_flow || 0) / 10000)}
                  </span>
                ) : undefined
              }
            />
            <InfoCell label="成交日期" value={formatDate(project.sold_date)} />
            <InfoCell label="上架日期" value={formatDate(project.listing_date)} />
            {daysOnMarket && <InfoCell label="用时" value={daysOnMarket} />}
          </div>
        </>
      )}
    </section>
  );
}
