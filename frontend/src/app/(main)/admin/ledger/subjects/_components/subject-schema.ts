import { z } from "zod";
import {
  Calendar,
  CheckCircle,
  Hammer,
  Landmark,
  PenLine,
  Tag,
  type LucideIcon,
} from "lucide-react";
import type { components } from "@/lib/api-types";

/**
 * 科目管理共享类型 / Zod 校验 / UI 常量
 *
 * 对齐后端 schemas/project/finance.py::FinanceSubjectResponse 与
 * models/common/base.py::SubjectLevel / SubjectStage 枚举。
 */

/** 业务模式 */
export type SubjectMode = "agent" | "acquire";

/** 业务阶段（signing/renovation/holding/listing/sold） */
export type SubjectStage = "signing" | "renovation" | "holding" | "listing" | "sold";

/** 成本层级 1-7 */
export type SubjectLevel = "1" | "2" | "3" | "4" | "5" | "6" | "7";

/** 科目响应（对齐后端 FinanceSubjectResponse） */
export type Subject = components["schemas"]["FinanceSubjectResponse"];

/** 创建载荷（对齐后端 FinanceSubjectCreate，system 由后端强制 false） */
export interface SubjectCreateInput {
  name: string;
  level: SubjectLevel;
  pnl: boolean;
  modes: SubjectMode[];
  stage: SubjectStage;
  note?: string | null;
}

/** 更新载荷（对齐后端 FinanceSubjectUpdate，全部可选） */
export interface SubjectUpdateInput {
  name?: string;
  level?: SubjectLevel;
  pnl?: boolean;
  modes?: SubjectMode[];
  stage?: SubjectStage;
  note?: string | null;
}

// ===== Zod 校验（与后端 Pydantic 语义对齐） =====
export const subjectIdSchema = z.string().min(1, "科目 ID 不能为空");

export const subjectModeSchema = z.enum(["agent", "acquire"]);
export const subjectStageSchema = z.enum(["signing", "renovation", "holding", "listing", "sold"]);
export const subjectLevelSchema = z.enum(["1", "2", "3", "4", "5", "6", "7"]);

export const createSubjectSchema = z.object({
  name: z.string().min(1, "科目名称不能为空").max(50, "科目名称最多 50 字"),
  level: subjectLevelSchema,
  pnl: z.boolean(),
  modes: z.array(subjectModeSchema).min(1, "至少选择一种业务模式"),
  stage: subjectStageSchema,
  note: z.string().max(200, "备注最多 200 字").nullable().optional(),
});

export const updateSubjectSchema = createSubjectSchema.partial();

/** 编辑弹窗表单值类型 */
export type SubjectFormValues = z.infer<typeof createSubjectSchema>;

// ===== UI 共享常量 =====

/** 层级标签（①取得成本 ~ ⑦配对项），对齐设计文档 LEVEL_LABELS */
export const LEVEL_LABELS: Record<SubjectLevel, string> = {
  "1": "①取得成本",
  "2": "②直接改造成本",
  "3": "③交易费用",
  "4": "④资金成本",
  "5": "⑤现金流专属",
  "6": "⑥收入项",
  "7": "⑦配对项",
};

/**
 * 层级 pill Tailwind 类（Steep：Apricot → Rust 暖色梯度）
 *
 * DESIGN.md 的彩色硬约束只留 Rust + Apricot/Sky 两个 wash，故弃用原
 * 红/琥珀/蓝/橙/天蓝/绿/紫 七色彩虹。梯度按「①②③④ 成本层（浅底 + Rust 深字）
 * → ⑤⑥⑦ 现金流/收入/配对项（深底 + 白字）」分两组展开，
 * 每一色阶的正文对比度均 ≥ 4.5:1（层级数字 ①~⑦ 同时写在文案里，颜色仅作强化）。
 *
 * 该梯度已在 DESIGN.md「Warm Ladder」登记为调色板的受控扩展；改色请同步该表。
 * text-rust 即 #5d2a1a、text-pure-white 即 #ffffff，故此处只写底色/描边的裸值。
 */
export const LEVEL_PILL_CLASS: Record<SubjectLevel, string> = {
  "1": "bg-[#fbe1d1] text-rust border-[#f2d0ba]",
  "2": "bg-[#f7d0b4] text-rust border-[#eec3a3]",
  "3": "bg-[#f0bd97] text-rust border-[#e6b088]",
  "4": "bg-[#e6a877] text-rust border-[#dc9c6a]",
  "5": "bg-[#a85028] text-pure-white border-[#9a4723]",
  "6": "bg-[#83381b] text-pure-white border-[#763116]",
  "7": "bg-[#5d2a1a] text-pure-white border-[#5d2a1a]",
};

/** 业务阶段元数据（按业务模式分组，对齐设计文档 STAGE_META） */
export interface StageMeta {
  key: SubjectStage;
  /** 阶段标记图标：单色描边（Steep 弃用 emoji） */
  icon: LucideIcon;
  name: string;
  sub: string;
}

export const STAGE_META: Record<SubjectMode, StageMeta[]> = {
  agent: [
    { key: "signing", icon: PenLine, name: "签约", sub: "阶段一 · 资金注入" },
    { key: "renovation", icon: Hammer, name: "装修", sub: "阶段二 · 改造投入" },
    { key: "listing", icon: Tag, name: "在售", sub: "阶段三 · 营销推广" },
    { key: "sold", icon: CheckCircle, name: "已售", sub: "阶段四 · 收入实现" },
  ],
  acquire: [
    { key: "signing", icon: Landmark, name: "签约/买入", sub: "阶段一 · 产权登记" },
    { key: "holding", icon: Calendar, name: "持有期", sub: "阶段二 · 按揭持有" },
    { key: "renovation", icon: Hammer, name: "装修", sub: "阶段三 · 改造投入" },
    { key: "listing", icon: Tag, name: "在售", sub: "阶段四 · 营销推广" },
    { key: "sold", icon: CheckCircle, name: "已售", sub: "阶段五 · 差额回收" },
  ],
};

/** 根据模式 + 阶段 key 查询阶段中文名 */
export function stageLabel(mode: SubjectMode, stage: SubjectStage): string {
  return STAGE_META[mode].find((s) => s.key === stage)?.name ?? stage;
}
