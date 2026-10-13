import { redirect } from "next/navigation";

/**
 * 旧户型图库页入口（M5 / FR-20 v1.9）.
 *
 * 小区图片管理融合进字典详情抽屉「户型图库」区块（唯一管理界面），
 * 系统内不再有独立图片页 —— 本路由重定向至字典总览。
 */
export default function CommunityImagesRedirectPage() {
  redirect("/admin/building-dictionary");
}
