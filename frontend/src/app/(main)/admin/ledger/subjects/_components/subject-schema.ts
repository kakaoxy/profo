import { z } from "zod";

/**
 * 科目管理共享类型 / Zod 校验 / UI 常量
 *
 * 对齐后端 schemas/project/finance.py::FinanceSubjectResponse 与
 * models/common/base.py::SubjectLevel / SubjectStage 枚举。
 *
 * ⚠️未覆盖：api-types.d.ts 尚未生成 /admin/subjects 路径（后端已就绪但未跑 pnpm gen-api），
 * 故在此本地定义类型。待 gen-api 后可切换为 components["schemas"]["FinanceSubjectResponse"]。
 */

/** 业务模式 */
export type SubjectMode = "agent" | "acquire";

/** 业务阶段（signing/renovation/holding/listing/sold） */
export type SubjectStage =
  | "signing"
  | "renovation"
  | "holding"
  | "listing"
  | "sold";

/** 成本层级 1-7 */
export type SubjectLevel = "1" | "2" | "3" | "4" | "5" | "6" | "7";

/** 科目响应（对齐后端 FinanceSubjectResponse） */
export interface Subject {
  id: string;
  name: string;
  level: SubjectLevel;
  pnl: boolean;
  modes: SubjectMode[];
  stage: SubjectStage;
  note: string | null;
  system: boolean;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

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
export const subjectStageSchema = z.enum([
  "signing",
  "renovation",
  "holding",
  "listing",
  "sold",
]);
export const subjectLevelSchema = z.enum([
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
]);

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

/** 层级 pill Tailwind 类（对齐设计文档 lp-1~lp-7 配色） */
export const LEVEL_PILL_CLASS: Record<SubjectLevel, string> = {
  "1": "bg-red-100 text-red-700 border-red-200",
  "2": "bg-amber-100 text-amber-700 border-amber-200",
  "3": "bg-blue-100 text-blue-700 border-blue-200",
  "4": "bg-yellow-200 text-yellow-800 border-yellow-300",
  "5": "bg-sky-100 text-sky-700 border-sky-200",
  "6": "bg-green-100 text-green-700 border-green-200",
  "7": "bg-purple-100 text-purple-700 border-purple-200",
};

/** 业务阶段元数据（按业务模式分组，对齐设计文档 STAGE_META） */
export interface StageMeta {
  key: SubjectStage;
  icon: string;
  name: string;
  sub: string;
}

export const STAGE_META: Record<SubjectMode, StageMeta[]> = {
  agent: [
    { key: "signing", icon: "✍️", name: "签约", sub: "阶段一 · 资金注入" },
    { key: "renovation", icon: "🔨", name: "装修", sub: "阶段二 · 改造投入" },
    { key: "listing", icon: "🏷️", name: "在售", sub: "阶段三 · 营销推广" },
    { key: "sold", icon: "✅", name: "已售", sub: "阶段四 · 收入实现" },
  ],
  acquire: [
    { key: "signing", icon: "🏦", name: "签约/买入", sub: "阶段一 · 产权登记" },
    { key: "holding", icon: "📆", name: "持有期", sub: "阶段二 · 按揭持有" },
    { key: "renovation", icon: "🔨", name: "装修", sub: "阶段三 · 改造投入" },
    { key: "listing", icon: "🏷️", name: "在售", sub: "阶段四 · 营销推广" },
    { key: "sold", icon: "✅", name: "已售", sub: "阶段五 · 差额回收" },
  ],
};

/** 根据模式 + 阶段 key 查询阶段中文名 */
export function stageLabel(mode: SubjectMode, stage: SubjectStage): string {
  return STAGE_META[mode].find((s) => s.key === stage)?.name ?? stage;
}
