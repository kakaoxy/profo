import { redirect } from "next/navigation";

/**
 * 旧治理页入口（M5 / FR-14 v1.9）.
 *
 * 治理合并融合进字典交互（抽屉「合并」按钮 + 合并信息区块），
 * 系统内不再有独立治理页 —— 本路由重定向至字典总览。
 */
export default function GovernanceRedirectPage() {
  redirect("/admin/building-dictionary");
}
