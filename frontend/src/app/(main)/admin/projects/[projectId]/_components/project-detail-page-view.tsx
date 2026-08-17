"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import { Project } from "../../types";
import { updateProjectAction, deleteProjectAction } from "../../actions/core";
import { useProjectDetail } from "../../_components/project-detail/hooks/use-project-detail";
import { useProjectAttachments } from "../../_components/project-detail/hooks/use-project-attachments";
import { RenovationView } from "../../_components/project-detail/views/renovation";
import { DefaultView } from "../../_components/project-detail/views/default";
import { SellingView } from "../../_components/project-detail/views/selling";
import type { ActivityTabKey } from "../../_components/project-detail/views/selling/activity-tabs";
import { SoldView } from "../../_components/project-detail/views/sold";
import { EndedView } from "../../_components/project-detail/views/ended";
import { HandoverDialog } from "../../_components/project-detail/views/default/handover-dialog";
import { ListingDialog } from "../../_components/project-detail/views/renovation/listing-dialog";
import { DealDialog } from "../../_components/project-detail/views/selling/deal-dialog";
import type { SigningMaterial } from "../../_components/project-detail/types";
import { TopToolbar } from "./page-shell/top-toolbar";
import { HeroSection } from "./page-shell/hero-section";
import { SectionNav } from "./page-shell/section-nav";
import { Flowbar } from "./page-shell/flowbar";
import { SideColumn } from "./page-shell/side-column";
import { useTeamMembers } from "./page-shell/use-team-members";
import { MobileActionBar } from "./page-shell/mobile-action-bar";
import { RefreshSkeleton } from "./page-shell/refresh-skeleton";
import { PROJECT_SECTION_IDS, getStageCta } from "./page-shell/config";
import { MonitorSheet } from "../../_components/monitor/monitor-sheet";

interface ProjectDetailPageViewProps {
  initialProject: Project;
}

/** 阶段流转确认弹窗类型（移动端吸底操作条主 CTA 触发） */
type StageDialogKind = "handover" | "listing" | "deal";

/**
 * 项目详情独立页客户端外壳（V4 · Steep 风格，Phase 1）
 *
 * 结构：顶部工具行 → Hero（生命周期 stepper + 项目名 + 阶段状态 pill）
 * → Sticky 分区导航 → 12 栏内容网格（主列 8 / 副列 4 占位）→ 移动端吸底操作条（仅主 CTA）。
 *
 * 主列五个阶段视图（DefaultView / RenovationView / SellingView / SoldView / EndedView）与
 * useProjectDetail / useProjectAttachments 数据流保持原有逻辑不变，仅包进主列容器；
 * 编辑（V4.3 就地编辑）：顶栏/项目信息卡「编辑」→ 卡片内 inline 编辑 + 局部刷新，不再弹窗；
 * 删除沿用 AlertDialog + deleteProjectAction；
 * 阶段流转主 CTA 收口于移动端吸底操作条，打开对应确认弹窗（V4.1），复用视图内同组件受控实例，
 * 成功后 toast + stepper 前进 + 自动切至新阶段视图（handleXxxSuccess 内置语义）。
 */
export function ProjectDetailPageView({ initialProject }: ProjectDetailPageViewProps) {
  const router = useRouter();
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // 编辑 / 删除操作状态（顶部工具行共用；编辑已改为就地编辑，删除确认弹窗挂载于此）
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  // 删除弹窗「输入项目名以确认」受控输入（打开时重置）
  const [deleteConfirmName, setDeleteConfirmName] = useState("");

  // 顶栏「编辑」→ 项目信息卡就地编辑触发（V4.3：递增计数 + 滚动锚点，不再弹窗）
  const [infoEditRequest, setInfoEditRequest] = useState(0);

  // 已售态「修改销售信息」textlink → SoldView 内 EditSalesInfoDialog 受控开关
  const [soldEditOpen, setSoldEditOpen] = useState(false);

  // 全量刷新期间主列显示卡片级 skeleton（V4.1 加载规范；局部刷新不显示）
  const [isRefreshingFull, setIsRefreshingFull] = useState(false);

  // 阶段流转确认弹窗开关（null = 全部关闭）
  const [stageDialog, setStageDialog] = useState<StageDialogKind | null>(null);

  // 在售销售动态：三类记录计数（分区导航徽标）+ 外部指定激活 tab（分区导航联动）
  const [activityCounts, setActivityCounts] = useState<{
    viewing: number;
    offer: number;
    negotiation: number;
  }>();
  const [activeActivityTab, setActiveActivityTab] = useState<ActivityTabKey>();

  // 在售「结束项目」→ SellingView 内 ActualEndDateDialog 受控开关（flowbar 接线）
  const [endProjectOpen, setEndProjectOpen] = useState(false);

  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

  const {
    project,
    viewMode,
    currentProjectStageIndex,
    refreshProjectData,
    handleViewModeChange,
    handleHandoverSuccess,
    handleListingSuccess,
    handleDealSuccess,
  } = useProjectDetail({ initialProject, isOpen: true });

  // 页面级团队数据：用户列表 + 装修合同（右侧副列角色 ID 解析 / 对接负责人展示共用；
  // 装修合同拉取自 RenovationView 上提至此，签约阶段也能展示对接负责人）
  const { usersById, renovationMeta: pageRenovationMeta } = useTeamMembers(project?.id);

  const handleUpdateAttachments = useCallback(
    async (attachments: SigningMaterial[]) => {
      if (!project) return;
      const result = await updateProjectAction(project.id, {
        signing_materials: attachments.length
          ? attachments.map((a) => ({ ...a, size: a.size ?? 0 }))
          : null,
      });
      if (!result.success) {
        toast.error(result.message || "附件保存失败");
      }
    },
    [project],
  );

  const { attachments, createHandlers, onUpload } = useProjectAttachments({
    signingMaterials: project?.signing_materials,
    onUpdateAttachments: handleUpdateAttachments,
  });

  // 全量刷新包装：refreshProjectData(true) 期间主列显示卡片级 skeleton
  // （编辑保存后 / 附件保存后 / 编辑前拉取完整数据共用；局部刷新不经过此处）
  const refreshFullWithSkeleton = useCallback(async () => {
    setIsRefreshingFull(true);
    try {
      await refreshProjectData(true);
    } finally {
      setIsRefreshingFull(false);
    }
  }, [refreshProjectData]);

  const handleUpdateAttachmentsWithRefresh = useCallback(
    async (updatedAttachments: SigningMaterial[]) => {
      await handleUpdateAttachments(updatedAttachments);
      await refreshFullWithSkeleton();
    },
    [handleUpdateAttachments, refreshFullWithSkeleton],
  );

  // 顶栏「编辑」/ 项目信息卡「编辑」→ 先拉全量数据（保证表单字段完整，期间主列 skeleton）
  // → 递增 editRequest 进入就地编辑态 + 滚动到项目信息卡（V4.3，不再弹窗）
  const handleEditClick = useCallback(async () => {
    await refreshFullWithSkeleton();
    setInfoEditRequest((n) => n + 1);
    requestAnimationFrame(() => {
      document
        .getElementById(PROJECT_SECTION_IDS.overview)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [refreshFullWithSkeleton]);

  // 删除确认后执行（沿用原 PageHeader.handleDelete，成功后返回列表）
  const handleDelete = useCallback(async () => {
    if (!project) return;
    setIsDeleting(true);
    try {
      const res = await deleteProjectAction(project.id);
      if (res.success) {
        toast.success("项目已删除");
        setIsDeleteOpen(false);
        router.back();
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error("删除失败");
    } finally {
      setIsDeleting(false);
    }
  }, [project, router]);

  // 删除弹窗开关：打开时清空「输入项目名以确认」
  const handleDeleteOpenChange = useCallback((open: boolean) => {
    setIsDeleteOpen(open);
    setDeleteConfirmName("");
  }, []);

  // 移动端吸底操作条主 CTA → 按当前阶段打开流转确认弹窗（V4.1）：
  // 签约 → 交房确认；装修 → 上架确认；在售 → 成交确认（映射原型 nextByDlg）
  const handleStageCtaClick = useCallback(() => {
    if (currentProjectStageIndex === 0) {
      setStageDialog("handover");
    } else if (currentProjectStageIndex === 1) {
      setStageDialog("listing");
    } else if (currentProjectStageIndex === 2) {
      setStageDialog("deal");
    }
  }, [currentProjectStageIndex]);

  const closeStageDialog = useCallback(() => setStageDialog(null), []);

  if (!project) return null;

  const handlers = createHandlers(setPreviewImage);
  const isSoldMode = viewMode === "sold";
  const viewKey = project.id;

  const stageCtaLabel = getStageCta(currentProjectStageIndex);
  const stageCta = stageCtaLabel
    ? { label: stageCtaLabel.label, onClick: handleStageCtaClick }
    : null;

  // 底部阶段操作条（V4：单屏唯一实心 CTA 收口于此；已售/已下架无 flowbar）
  const stageFlowbar = (() => {
    const label = stageCtaLabel?.label;
    if (!label) return null;
    switch (currentProjectStageIndex) {
      case 0:
        return {
          hint: {
            kind: "clock" as const,
            text: "签约要件齐备后，确认交房即进入装修阶段（需选择实际交房日期）",
          },
          cta: { label, onClick: () => setStageDialog("handover") },
        };
      case 1:
        return {
          hint: {
            kind: "clock" as const,
            text: "全部 6 个阶段完成后可上架销售（需填写上架日期与挂牌价格）",
          },
          cta: { label, onClick: () => setStageDialog("listing") },
        };
      default:
        return {
          hint: {
            kind: "warn" as const,
            text: "结束项目不可恢复为在售；确认成交需填写成交价与日期",
          },
          cta: { label, onClick: () => setStageDialog("deal") },
          endProject: { onClick: () => setEndProjectOpen(true) },
        };
    }
  })();

  return (
    <div className="min-h-screen overflow-x-clip bg-fog font-sohne text-ink">
      {/* 顶部工具行 + Hero 区 */}
      <div className="mx-auto w-full max-w-[1200px] px-4 pt-2 sm:px-6 lg:px-8">
        <TopToolbar
          project={project}
          viewMode={viewMode}
          onBack={handleClose}
          onEdit={handleEditClick}
          onDelete={() => setIsDeleteOpen(true)}
        />
        <HeroSection
          project={project}
          currentProjectStageIndex={currentProjectStageIndex}
          onViewModeChange={handleViewModeChange}
          onEditSalesInfo={isSoldMode ? () => setSoldEditOpen(true) : undefined}
        />
      </div>

      {/* Sticky 分区导航（key 随 viewMode 重置选中态；已下架不渲染） */}
      {viewMode !== "ended" && (
        <div className="mx-auto w-full max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <SectionNav
            key={viewMode}
            viewMode={viewMode}
            counts={{
              documents: attachments.length,
              viewing: activityCounts?.viewing,
              offer: activityCounts?.offer,
              negotiation: activityCounts?.negotiation,
            }}
            onTabSelect={(tabKey) => {
              // 按 viewMode 分发到对应视图的内 tab 联动（分区导航 tabKey 条目）
              if (viewMode === "selling") {
                setActiveActivityTab(tabKey as ActivityTabKey);
              }
              // 装修（V4.4 顺序渲染后）不再需要 tabKey 联动，直接锚点滚动；
              // 签约（V4.2 顺序渲染后）同理
            }}
          />
        </div>
      )}

      {/* 内容区 12 栏网格：≥1024px（lg，对齐设计稿 1100px 断点）主列 8 + 副列 4，
          副列（aside 网格项）sticky 吸附（设计稿 .col-side），<1024px 副列下沉 */}
      <div className="mx-auto grid w-full max-w-[1200px] grid-cols-1 gap-5 px-4 pb-16 sm:px-6 lg:grid-cols-12 lg:px-8">
        <main className="min-w-0 lg:col-span-8">
          <section id={PROJECT_SECTION_IDS.overview} className="scroll-mt-28 md:scroll-mt-24">
            {/* 全量刷新期间显示卡片级 skeleton（V4.1 加载规范；局部刷新不显示避免闪烁） */}
            {isRefreshingFull ? (
              <RefreshSkeleton />
            ) : isSoldMode ? (
              <SoldView
                project={project}
                viewMode={viewMode}
                setViewMode={handleViewModeChange}
                currentProjectStageIndex={currentProjectStageIndex}
                editSalesInfoOpen={soldEditOpen}
                onEditSalesInfoOpenChange={setSoldEditOpen}
                hideHeader
              />
            ) : viewMode === "ended" ? (
              <EndedView
                key={viewKey}
                project={project}
                onClose={handleClose}
                onDelete={() => setIsDeleteOpen(true)}
              />
            ) : (
              <>
                {viewMode === "renovation" && (
                  <RenovationView
                    key={viewKey}
                    project={project}
                    onRefresh={refreshProjectData}
                    onListingSuccess={handleListingSuccess}
                    contractMeta={pageRenovationMeta}
                  />
                )}
                {viewMode === "selling" && (
                  <SellingView
                    key={viewKey}
                    project={project}
                    onRefresh={refreshProjectData}
                    onDealSuccess={handleDealSuccess}
                    onActivityCounts={setActivityCounts}
                    activeActivityTab={activeActivityTab}
                    endProjectDialogOpen={endProjectOpen}
                    onEndProjectDialogOpenChange={setEndProjectOpen}
                  />
                )}
                {(viewMode === "signing" || !["renovation", "selling"].includes(viewMode)) && (
                  <DefaultView
                    key={viewKey}
                    project={project}
                    attachments={attachments}
                    handlers={handlers}
                    onUpdateAttachments={handleUpdateAttachmentsWithRefresh}
                    onUploadAttachment={onUpload}
                    onHandoverSuccess={handleHandoverSuccess}
                    onEditProject={handleEditClick}
                    onProjectSaved={async () => {
                      // 就地编辑保存成功 → 局部刷新（无 skeleton），右侧副列/关键日期联动
                      await refreshProjectData(false);
                    }}
                    usersById={usersById}
                    editRequest={infoEditRequest}
                  />
                )}
              </>
            )}
          </section>

          {/* 底部阶段操作条（主列视图之后；签约 clock / 装修 clock / 在售 warn + 结束项目） */}
          {stageFlowbar && (
            <div className="mt-5">
              <Flowbar
                hint={stageFlowbar.hint}
                cta={stageFlowbar.cta}
                endProject={stageFlowbar.endProject}
              />
            </div>
          )}
        </main>

        {/* 副列：网格项自身 sticky（设计稿 .col-side），self-start 高度不拉伸，随主列滚动吸附 */}
        <aside className="min-w-0 lg:col-span-4 lg:sticky lg:top-24 lg:self-start">
          <div className="flex flex-col gap-5">
            <SideColumn
              project={project}
              viewMode={viewMode}
              renovationMeta={pageRenovationMeta}
              usersById={usersById}
            />
          </div>
        </aside>
      </div>

      {/* 移动端（<768px）底部吸顶操作条（仅主 CTA；已售/已下架无 CTA 时不渲染） */}
      <MobileActionBar cta={stageCta} />

      {/* 房源监控侧滑面板（副列快捷入口经由 ?monitor_id= 打开，与列表页行为一致） */}
      <MonitorSheet />

      {/* 阶段流转确认弹窗（V4.1）：Hero 主 CTA / 移动端操作条的页面级受控实例，
          与视图内触发按钮共用同一组件与同一提交 action；
          成功链路：弹窗内 toast → handleXxxSuccess（刷新 + 自动切新阶段视图）
          → stepper 随 project.status 前进 → 受控关闭 */}
      <HandoverDialog
        project={project}
        open={stageDialog === "handover"}
        onOpenChange={closeStageDialog}
        onSuccess={handleHandoverSuccess}
      />
      <ListingDialog
        project={project}
        open={stageDialog === "listing"}
        onOpenChange={closeStageDialog}
        onSuccess={handleListingSuccess}
      />
      <DealDialog
        project={project}
        open={stageDialog === "deal"}
        onOpenChange={closeStageDialog}
        onSuccess={handleDealSuccess}
      />

      {/* 编辑已改为项目信息卡就地编辑（InfoTab），此处不再挂载编辑弹窗 */}

      {/* 删除确认（沿用 AlertDialog + deleteProjectAction；V4.1 补「输入项目名以确认」+ Rust 确认按钮） */}
      <AlertDialog open={isDeleteOpen} onOpenChange={handleDeleteOpenChange}>
        <AlertDialogContent className="rounded-cards">
          <AlertDialogHeader>
            <div className="text-[13px] font-[500] uppercase tracking-[0.08em] text-rust">
              危险操作 · Destructive
            </div>
            <AlertDialogTitle className="text-[26px] font-[500] leading-[1.18] tracking-[-0.23px] text-ink">
              删除项目
            </AlertDialogTitle>
            <AlertDialogDescription className="pt-2 text-[14px] font-[430] leading-[1.6] text-ash">
              即将删除项目「{project.name}」。删除为软删除，仅管理员可在回收站恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-2.5 rounded-[14px] border border-[#f0dcd2] bg-[#fdf4ef] px-[15px] py-[13px] text-[13.5px] font-[430] leading-[1.55] text-rust">
            <AlertTriangle className="mt-[2px] h-4 w-4 shrink-0" />
            <span>将同时移除该项目的文书、照片、跟进与销售记录的可见性；请输入项目名确认。</span>
          </div>
          <div className="grid gap-2">
            <label htmlFor="delete-confirm-name" className="text-[13px] font-medium text-graphite">
              输入项目名以确认
            </label>
            <Input
              id="delete-confirm-name"
              value={deleteConfirmName}
              onChange={(e) => setDeleteConfirmName(e.target.value)}
              placeholder={project.name}
              autoComplete="off"
              className="h-11 rounded-[16px]"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full border-[#e2e2e5] px-[14px] py-[6.5px] text-[13.5px] font-[450] text-ink hover:border-dove hover:bg-[#fafafa]">
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={isDeleting || deleteConfirmName !== project.name}
              className="rounded-full bg-rust px-[14px] py-[6.5px] text-[13.5px] font-[450] text-pure-white hover:bg-rust/90 focus:ring-rust"
            >
              {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>图片预览</DialogTitle>
          </DialogHeader>
          <div className="relative flex h-[75vh] w-full items-center justify-center py-4">
            {previewImage && (
              <Image
                src={previewImage}
                alt="预览"
                fill
                className="rounded-lg object-contain"
                sizes="(max-width: 1024px) 100vw, 1024px"
                priority
                unoptimized
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
