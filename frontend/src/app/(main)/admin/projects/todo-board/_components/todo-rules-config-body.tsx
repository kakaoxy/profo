"use client";

import { useState } from "react";
import { ChevronDown, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TodoBoardRulesData, TodoFieldLevel } from "../_lib/todo-board-config";
import { GRACE_ROWS, MILESTONE_ROWS, R2_FIELD_ORDER, clampRuleDays } from "../_lib/todo-board-config";

interface TodoRulesConfigBodyProps {
  /** 已保存的当前生效值（脏状态对比基准） */
  saved: TodoBoardRulesData;
  /** 出厂默认值（「恢复默认」回填来源，来自 GET 响应 defaults） */
  defaults: TodoBoardRulesData;
  /** 管理员编辑态；false = 只读（禁用控件 + 仅「关闭」页脚） */
  canEdit: boolean;
  saving: boolean;
  dirty: boolean;
  onDirtyChange: (dirty: boolean) => void;
  /** 保存（父组件发 PUT + toast + refresh） */
  onSave: (payload: TodoBoardRulesData) => void;
  onClose: () => void;
}

/** 步进器（设计稿 .stp）：− / + 单步、数字直输、失焦收敛 1~999、单位「天」 */
function Stepper({
  value,
  disabled,
  onChange,
  label,
}: {
  value: number;
  disabled: boolean;
  onChange: (v: number) => void;
  label: string;
}) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? String(value);
  const commit = (raw: string) => {
    setText(null);
    const next = clampRuleDays(parseInt(raw, 10));
    if (next !== value) onChange(next);
  };
  const step = (delta: number) => onChange(clampRuleDays(value + delta));
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-px rounded-full bg-fog p-0.5", disabled && "pointer-events-none opacity-40")}>
      <button
        type="button"
        aria-label={`减 1 天（${label}）`}
        onClick={() => step(-1)}
        className="flex h-6 w-6 items-center justify-center rounded-full text-sm leading-none text-graphite transition-colors hover:bg-pure-white hover:text-ink hover:shadow-steep-sm"
      >
        −
      </button>
      <input
        value={shown}
        inputMode="numeric"
        aria-label={`${label}天数`}
        onChange={(e) => {
          setText(e.target.value);
          const v = parseInt(e.target.value, 10);
          if (!Number.isNaN(v) && clampRuleDays(v) !== value) onChange(clampRuleDays(v));
        }}
        onBlur={(e) => commit(e.target.value)}
        className="w-9 rounded-lg bg-transparent px-0 py-[3px] text-center font-mono text-[13px] font-[500] tabular-nums text-ink outline-none focus:bg-pure-white focus:shadow-[0_0_0_1.5px_var(--color-ink)]"
      />
      <button
        type="button"
        aria-label={`加 1 天（${label}）`}
        onClick={() => step(1)}
        className="flex h-6 w-6 items-center justify-center rounded-full text-sm leading-none text-graphite transition-colors hover:bg-pure-white hover:text-ink hover:shadow-steep-sm"
      >
        +
      </button>
      <span className="pl-[3px] pr-2 text-[11px] text-dove">天</span>
    </span>
  );
}

/** 字段三态切换（设计稿 .seg）：core=rust / minor=ink / off=dove */
function FieldSegment({
  value,
  disabled,
  onChange,
}: {
  value: TodoFieldLevel;
  disabled: boolean;
  onChange: (v: TodoFieldLevel) => void;
}) {
  const options: { level: TodoFieldLevel; label: string }[] = [
    { level: "core", label: "核心" },
    { level: "minor", label: "次要" },
    { level: "off", label: "忽略" },
  ];
  return (
    <span className={cn("inline-flex shrink-0 rounded-full bg-fog p-0.5", disabled && "pointer-events-none opacity-40")}>
      {options.map(({ level, label }) => (
        <button
          key={level}
          type="button"
          onClick={() => onChange(level)}
          className={cn(
            "rounded-full px-[9px] py-[3px] text-[10.5px] font-[450] tracking-[-0.005em] text-graphite transition-colors hover:text-ink",
            value === level && level === "core" && "bg-rust text-pure-white hover:text-pure-white",
            value === level && level === "minor" && "bg-ink text-pure-white hover:text-pure-white",
            value === level && level === "off" && "bg-dove text-pure-white hover:text-pure-white",
          )}
        >
          {label}
        </button>
      ))}
    </span>
  );
}

/**
 * 规则配置弹窗主体（设计稿 ARTBOARD 02-A）：
 * 分组一装修工序里程碑（6 步进器）· 分组二宽限与提醒窗口（6 步进器）·
 * 分组三基础信息字段集（折叠 + 11 行三态切换）· 页脚恢复默认/脏标/取消/保存。
 * 表单状态在本地编辑（props.saved 为基准），保存经 onSave 交父组件发 PUT。
 */
export function TodoRulesConfigBody({
  saved,
  defaults,
  canEdit,
  saving,
  dirty,
  onDirtyChange,
  onSave,
  onClose,
}: TodoRulesConfigBodyProps) {
  const [values, setValues] = useState<TodoBoardRulesData>(saved);
  const [fieldsOpen, setFieldsOpen] = useState(false);

  const setValue = (key: keyof TodoBoardRulesData, v: number) => {
    setValues((prev) => ({ ...prev, [key]: v }));
    onDirtyChange(true);
  };
  const setMilestone = (stage: string, v: number) => {
    setValues((prev) => ({ ...prev, milestone_days: { ...prev.milestone_days, [stage]: v } }));
    onDirtyChange(true);
  };
  const setField = (name: string, level: TodoFieldLevel) => {
    setValues((prev) => ({ ...prev, basic_info_fields: { ...prev.basic_info_fields, [name]: level } }));
    onDirtyChange(true);
  };
  const resetToDefaults = () => {
    setValues(defaults);
    onDirtyChange(true);
  };

  const coreCount = R2_FIELD_ORDER.filter((n) => values.basic_info_fields[n] === "core").length;
  const minorCount = R2_FIELD_ORDER.filter((n) => values.basic_info_fields[n] === "minor").length;
  const offCount = R2_FIELD_ORDER.length - coreCount - minorCount;
  const fieldSummary = `${coreCount} 核心 · ${minorCount} 次要${offCount ? ` · ${offCount} 忽略` : ""}`;

  return (
    // flex-1：在桌面 Popover（max-h + flex-col）里受高度约束，中间阈值区内部滚动；移动 Sheet 父级非 flex 不受影响
    <div className={cn("flex min-h-0 flex-1 flex-col", !canEdit && "select-none")}>
      {/* 页头 */}
      <div className="flex items-center gap-2 px-[18px] pt-4 pb-1">
        <span className="min-w-0 flex-1 text-[15px] font-[480] text-ink">规则配置</span>
        <button
          type="button"
          aria-label="关闭"
          onClick={onClose}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[15px] leading-none text-graphite transition-colors hover:bg-fog"
        >
          ✕
        </button>
      </div>
      <div className="px-[18px] pb-2.5 text-[11.5px] leading-[1.6] font-[430] text-dove">
        调整待办规则触发阈值，保存后<b className="font-[480] text-graphite">下个规则快照</b>生效 ·
        输入框即当前生效值
      </div>

      {/* 非管理员只读提示条 */}
      {!canEdit && (
        <div className="mx-[18px] mb-2 flex items-center gap-[7px] rounded-[10px] bg-[#eef0f3] px-3 py-2 text-[11.5px] font-[430] text-graphite">
          <span aria-hidden>🔒</span>
          你当前为只读权限，阈值仅管理员可修改
        </div>
      )}

      {/* 主体（阈值区内部滚动） */}
      <div className="min-h-0 flex-1 overflow-y-auto px-[18px] pb-1.5">
        {/* 分组一 · 装修工序里程碑 */}
        <div className="pt-0.5">
          <div className="py-3 pb-0.5 text-[11px] font-[500] tracking-[0.06em] text-graphite">装修工序里程碑</div>
          {MILESTONE_ROWS.map(({ stage, desc }) => (
            <div key={stage} className="flex items-center gap-2.5 py-1.5">
              <span className="shrink-0 text-[13px] font-[480] text-ink">{stage}</span>
              <span className="min-w-0 flex-1 truncate text-[11.5px] font-[430] text-dove">{desc}</span>
              <Stepper
                label={stage}
                value={values.milestone_days[stage]}
                disabled={!canEdit}
                onChange={(v) => setMilestone(stage, v)}
              />
            </div>
          ))}
          <p className="py-1 pb-2 text-[11px] leading-[1.65] font-[430] text-dove">
            交房后 N 天内未记录该工序完成日期即提示（P1）；逾期超过「里程碑逾期升 P0」天数 → 升
            P0。锚点：约定交房时间（为空回退进入装修日）。
          </p>
        </div>

        {/* 分组二 · 宽限与提醒窗口 */}
        <div className="mt-3 border-t border-[#f0f0f2] pt-0.5">
          <div className="py-3 pb-0.5 text-[11px] font-[500] tracking-[0.06em] text-graphite">宽限与提醒窗口</div>
          {GRACE_ROWS.map(({ key, name, desc }) => (
            <div key={key} className="flex items-center gap-2.5 py-1.5">
              <span className="shrink-0 text-[13px] font-[480] text-ink">{name}</span>
              <span className="min-w-0 flex-1 truncate text-[11.5px] font-[430] text-dove">{desc}</span>
              <Stepper
                label={name}
                value={values[key]}
                disabled={!canEdit}
                onChange={(v) => setValue(key, v)}
              />
            </div>
          ))}
          <p className="py-1 pb-2 text-[11px] leading-[1.65] font-[430] text-dove">
            「进入装修后」取状态流转日志最新 renovating 时间；各窗口口径与现有规则一致，仅阈值开放；「基础信息缺失」为本轮新增宽限（现网缺即提示）。
          </p>
        </div>

        {/* 分组三 · 基础信息字段集（折叠） */}
        <div className="mt-3 border-t border-[#f0f0f2]">
          <button
            type="button"
            onClick={() => setFieldsOpen((o) => !o)}
            className="flex w-full items-center gap-2 py-3 pb-1.5 text-left"
          >
            <span className="min-w-0 flex-1 text-[11px] font-[500] tracking-[0.06em] text-graphite">
              基础信息字段集
            </span>
            <span className="shrink-0 text-[11px] font-[430] text-dove">{fieldSummary}</span>
            <ChevronDown
              className={cn("h-3.5 w-3.5 shrink-0 text-graphite transition-transform duration-200", fieldsOpen && "rotate-180")}
            />
          </button>
          {fieldsOpen && (
            <div className="pb-1.5">
              {R2_FIELD_ORDER.map((name) => (
                <div key={name} className="flex items-center gap-2.5 py-1">
                  <span className="min-w-0 flex-1 text-[12.5px] font-[450] text-ink">{name}</span>
                  <FieldSegment
                    value={values.basic_info_fields[name]}
                    disabled={!canEdit}
                    onChange={(level) => setField(name, level)}
                  />
                </div>
              ))}
              <p className="py-1 pb-2 text-[11px] leading-[1.65] font-[430] text-dove">
                决定 R2 检查范围与分级：核心缺 → P1，仅次要缺 → P2，忽略 =
                不检查。与上方「基础信息缺失」宽限配合：签约后超 N 天仍未达标才提示。
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 页脚 */}
      <div className="flex items-center gap-2 border-t border-[#f0f0f2] bg-fog px-4 py-3">
        {canEdit && (
          <button
            type="button"
            onClick={resetToDefaults}
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12.5px] font-[450] tracking-[-0.009em] text-graphite transition-colors hover:bg-pure-white hover:text-ink"
          >
            <RotateCcw className="h-3 w-3" />
            恢复默认
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          {canEdit && dirty && (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-[450] whitespace-nowrap text-rust before:h-[7px] before:w-[7px] before:shrink-0 before:rounded-full before:bg-rust before:content-['']">
              有未保存改动
            </span>
          )}
          {canEdit ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="shrink-0 rounded-full bg-pure-white px-4 py-[7px] text-[12.5px] font-[450] tracking-[-0.009em] text-ink shadow-steep-sm transition-shadow hover:shadow-steep"
              >
                取消
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => onSave(values)}
                className="shrink-0 rounded-full bg-ink px-[18px] py-[7px] text-[12.5px] font-[450] tracking-[-0.009em] text-pure-white transition-colors hover:bg-[#2a2d31] disabled:opacity-60"
              >
                {saving ? "保存中…" : "保存"}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-full bg-pure-white px-4 py-[7px] text-[12.5px] font-[450] tracking-[-0.009em] text-ink shadow-steep-sm transition-shadow hover:shadow-steep"
            >
              关闭
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
