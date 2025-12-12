import { cookies } from "next/headers";
import { UploadZone } from "./upload-zone";

export default async function UploadPage() {
  const cookieStore = await cookies();
  
  // --- 调试代码开始 ---
  console.log("🛠️ [服务端调试] 所有 Cookies:", cookieStore.getAll().map(c => c.name));
  
  const tokenCookie = cookieStore.get("access_token");
  console.log("🛠️ [服务端调试] 尝试读取 access_token:", tokenCookie);
  
  const token = tokenCookie?.value || "";
  console.log("🛠️ [服务端调试] 最终传给组件的 Token:", token ? "有值 (长度 " + token.length + ")" : "空字符串");
  // --- 调试代码结束 ---
      

  return (
    <div className="container max-w-3xl mx-auto py-10 space-y-8">
      {/* 标题区 */}

      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">批量导入房源</h1>
        <p className="text-muted-foreground">
          通过上传 CSV 文件批量创建或更新房源数据。请先下载模板，按照格式要求填写后上传。
        </p>
      </div>

      {/* 核心功能区 */}
      <UploadZone accessToken={token} />

      {/* 帮助文档区 */}
      <div className="bg-slate-50 rounded-lg p-6 border text-sm text-muted-foreground space-y-4">
        <h4 className="font-semibold text-slate-900">注意事项：</h4>
        <ul className="list-disc pl-4 space-y-1">
          <li>请务必使用“下载数据模板”功能获取最新的 CSV 模板。</li>
          <li>标有“必填”的字段不能为空，否则会导致该行数据导入失败。</li>
          <li>如果在售/成交状态填写错误，系统会根据验证规则拒绝导入。</li>
          <li>单次上传建议不超过 1000 条数据，以免处理时间过长。</li>
        </ul>
      </div>
    </div>
  );
}