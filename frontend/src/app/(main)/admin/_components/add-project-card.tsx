import { Plus } from "lucide-react";
import { CreateProjectDialog } from "../projects/_components/create-project";

interface AddProjectCardProps {
  /**
   * 布局模式：
   * - `rail`（默认）旧版 LegacyDashboard 的横向卡流（虚线大卡 280px 宽 / 400px 高）
   * - `grid` 新版工作台 monitor_projects widget 的等宽网格
   *   （设计稿 `.m-card` + 透明底虚线：一行内容、与项目卡同高）
   */
  layout?: "rail" | "grid";
}

/**
 * 「添加新项目」卡（工作台重点监控区第 5 张卡，设计稿屏 01）。
 *
 * 抽为组件的原因：新版 12 栏工作台把「重点监控项目」下沉成 `monitor_projects`
 * widget，而旧版 `LegacyDashboard` 的 MonitorSection 仍在同一个文件里保留一个
 * release 作回退（SPEC §12）。两处都要这张卡，内联会复制十余行样式类。
 */
export function AddProjectCard({ layout = "rail" }: AddProjectCardProps) {
  const isGrid = layout === "grid";

  return (
    <CreateProjectDialog
      trigger={
        <div
          className={
            isGrid
              ? "flex h-full min-h-[150px] w-full cursor-pointer items-center justify-center gap-2 rounded-cards bg-transparent p-6 text-center text-graphite shadow-[inset_0_0_0_2px_rgba(163,166,175,0.4)] transition-colors hover:bg-fog group"
              : "w-full sm:w-70 sm:shrink-0 bg-fog rounded-cards border-2 border-dashed border-dove/40 flex flex-col items-center justify-center p-6 text-center group cursor-pointer hover:bg-white hover:border-dove transition-[background-color,border-color] min-h-100"
          }
        >
          {isGrid ? (
            <>
              <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
              <p className="text-[13.5px] font-[450] text-graphite group-hover:text-ink transition-colors">
                添加新项目
              </p>
            </>
          ) : (
            <>
              <div className="w-14 h-14 rounded-full bg-white shadow-steep-sm flex items-center justify-center text-graphite mb-4 transition-colors group-hover:bg-ink group-hover:text-white">
                <Plus className="w-6 h-6" aria-hidden="true" />
              </div>
              <p className="text-base font-medium text-ink group-hover:text-ink transition-colors">
                添加新项目
              </p>
              <p className="text-xs text-graphite mt-1.5 max-w-35">快速录入房源或新建开发项目</p>
            </>
          )}
        </div>
      }
    />
  );
}
