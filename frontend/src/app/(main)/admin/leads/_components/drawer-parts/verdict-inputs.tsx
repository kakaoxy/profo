"use client";

import React, { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { SCORE_ANCHORS, SCORE_LABELS, daysSay, daysTier, daysTierLabel } from "@/lib/lead-verdict";

/**
 * 房源条件分选择器（admin · 五星点选）.
 *
 * 口径：单一综合分 1-5（不拆户型/楼层）。锚点文案随分值切换，保证「4 分」跨员工
 * 指同一件事 —— 没有锚点的一致性，跨人评分等于噪声。
 *
 * 可访问性：选中态用**实底**而非仅换颜色（颜色不可依赖时仍可分辨），
 * 并给出 aria-label 与 aria-pressed。
 */
interface ScorePickerProps {
  value: number | null;
  onChange: (value: number) => void;
  /** 已禁用（提交中） */
  disabled?: boolean;
}

export const ScorePicker: React.FC<ScorePickerProps> = ({ value, onChange, disabled }) => {
  const [hovered, setHovered] = useState<number | null>(null);
  const active = hovered ?? value;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5" role="group" aria-label="房源条件分">
        {[1, 2, 3, 4, 5].map((score) => {
          const isOn = active != null && score <= active;
          return (
            <button
              key={score}
              type="button"
              disabled={disabled}
              aria-pressed={value === score}
              aria-label={`${score} 分 · ${SCORE_LABELS[score as 1 | 2 | 3 | 4 | 5]}`}
              onMouseEnter={() => setHovered(score)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onChange(score)}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-[11px] border transition-colors",
                "disabled:cursor-not-allowed disabled:opacity-50",
                isOn && value != null && hovered == null
                  ? "border-ink bg-ink text-white"
                  : isOn
                    ? "border-[#f2d0ba] bg-apricot-wash text-rust"
                    : "border-dove/60 bg-white text-dove hover:border-dove hover:text-graphite",
              )}
            >
              <Star className={cn("h-4 w-4", isOn && "fill-current")} aria-hidden="true" />
            </button>
          );
        })}
        <span
          className={cn("ml-2 text-[13px] font-medium", value == null ? "text-ash" : "text-ink")}
        >
          {value == null ? "未评分" : `${value} 分 · ${SCORE_LABELS[value as 1 | 2 | 3 | 4 | 5]}`}
        </span>
      </div>

      {/* 锚点提示条：随选择切换，未选时展示全表 */}
      <div className="flex gap-2 rounded-inputs bg-fog px-3 py-2">
        <span className="mt-0.5 h-4 w-4 shrink-0 rounded-[5px] border border-dove/50 bg-white text-center font-mono text-[9px] leading-4 text-graphite">
          i
        </span>
        <p className="text-[11.5px] leading-relaxed text-graphite">
          {value == null ? (
            <>
              打分锚点：
              {(Object.keys(SCORE_LABELS) as unknown as (keyof typeof SCORE_LABELS)[]).map(
                (k, idx) => (
                  <React.Fragment key={k}>
                    {idx > 0 && <span className="mx-1 text-dove">·</span>}
                    <span className="font-medium text-ash">
                      {k} {SCORE_LABELS[k]}
                    </span>{" "}
                    {SCORE_ANCHORS[k].split("：")[1] ?? SCORE_ANCHORS[k]}
                  </React.Fragment>
                ),
              )}
            </>
          ) : (
            <>
              <span className="font-medium text-ash">
                {value} 分 · {SCORE_LABELS[value as 1 | 2 | 3 | 4 | 5]}
              </span>
              {" —— "}
              {SCORE_ANCHORS[value as 1 | 2 | 3 | 4 | 5]}
            </>
          )}
        </p>
      </div>
    </div>
  );
};

/**
 * 装修后可售天数输入 + 实时档位反馈.
 *
 * 员工只填天数（连续值），档位与「约 N 个月」由纯函数派生 —— 存储保留精度，
 * 展示层翻译成人话。档位不入库（阈值会调，改阈值不该刷全表）。
 */
interface SaleDaysInputProps {
  value: number | null;
  onChange: (value: number | null) => void;
  disabled?: boolean;
}

export const SaleDaysInput: React.FC<SaleDaysInputProps> = ({ value, onChange, disabled }) => {
  const tier = daysTier(value);
  const say = daysSay(value);

  return (
    <div className="space-y-2">
      <div className="flex h-11 items-center gap-2 rounded-inputs border border-dove/60 bg-white px-3.5 transition-colors focus-within:border-ink focus-within:ring-2 focus-within:ring-ink/10">
        <span className="font-mono text-[11px] text-graphite">约</span>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={365}
          disabled={disabled}
          value={value ?? ""}
          onChange={(e) => {
            const raw = e.target.value;
            onChange(raw === "" ? null : Number(raw));
          }}
          placeholder="0"
          aria-label="装修后可售天数"
          className="min-w-0 flex-1 border-0 bg-transparent font-sans text-[20px] font-medium tabular-nums text-ink outline-none placeholder:text-dove disabled:cursor-not-allowed"
        />
        <span className="font-mono text-[11px] text-graphite">天</span>
      </div>

      <div className="flex min-h-[26px] items-center gap-2">
        {tier == null ? (
          <>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-fog px-3 py-1 text-[11.5px] font-medium text-dove">
              <span className="h-1 w-1 rounded-full bg-dove" />
              待填天数
            </span>
            <span className="text-[11.5px] text-graphite">
              填写后自动生成档位与「约 N 个月」文案
            </span>
          </>
        ) : (
          <>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11.5px] font-medium",
                tier === "rush"
                  ? "bg-rust text-white"
                  : tier === "slow"
                    ? "bg-[#eef0f3] text-graphite"
                    : "bg-apricot-wash text-rust",
              )}
            >
              <span
                className={cn(
                  "h-1 w-1 rounded-full",
                  tier === "rush" ? "bg-white" : tier === "slow" ? "bg-graphite" : "bg-rust",
                )}
              />
              {daysTierLabel(value)}
            </span>
            <span className="text-[11.5px] text-graphite">
              展示为「预计 {value} 天 · {say}」
            </span>
          </>
        )}
      </div>
    </div>
  );
};
