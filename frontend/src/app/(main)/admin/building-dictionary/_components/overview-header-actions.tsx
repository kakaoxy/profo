"use client";

/**
 * 字典总览页头动作区（FR-01 / 设计稿 pg-head）。
 *
 * 三个按钮与页头标题同行右对齐：＋新增小区（开新增弹层）→
 * 待审核（徽标计数，apricot 暖底）→ 导入数据（Ink 深色主按钮）。
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

import { CreateCommunityDialog } from "./create-community-dialog";

interface BdOverviewHeaderActionsProps {
  pendingCount: number;
}

export function BdOverviewHeaderActions({ pendingCount }: BdOverviewHeaderActionsProps) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2.5">
        <Button variant="outline" size="sm" className="rounded-full" onClick={() => setCreateOpen(true)}>
          ＋ 新增小区
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="rounded-full"
          onClick={() => router.push("/admin/building-dictionary/review")}
        >
          待审核
          {pendingCount > 0 ? (
            <span className="ml-1 rounded-full bg-apricot-wash px-1.5 py-0.5 font-mono text-[10px] leading-none text-rust">
              {pendingCount}
            </span>
          ) : null}
        </Button>
        <Button
          size="sm"
          className="rounded-full bg-ink text-white"
          onClick={() => router.push("/admin/building-dictionary/import")}
        >
          导入数据
        </Button>
      </div>
      <CreateCommunityDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => {
          setCreateOpen(false);
          router.refresh();
        }}
      />
    </>
  );
}
