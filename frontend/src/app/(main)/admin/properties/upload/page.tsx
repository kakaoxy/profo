import { UploadZone } from "./upload-zone";
import { PageContainer, PageHeader } from "@/app/(main)/admin/_components";

export default function UploadPage() {
  return (
    <div className="min-h-screen bg-fog">
      <PageContainer className="flex flex-col gap-8">
        <PageHeader
          title="批量导入房源"
          description="通过上传 CSV 文件批量创建或更新房源数据。请先下载模板，按照格式要求填写后上传。"
        />

        {/* 核心功能区 */}
        <UploadZone />

        {/* 帮助文档区 */}
        <div className="rounded-cards bg-white p-6 shadow-steep text-sm text-graphite space-y-4">
          <h2 className="text-sm font-medium text-ink">注意事项：</h2>
          <ul className="list-disc pl-4 space-y-1">
            <li>请务必使用&quot;下载数据模板&quot;功能获取最新的 CSV 模板。</li>
            <li>标有&quot;必填&quot;的字段不能为空，否则会导致该行数据导入失败。</li>
            <li>如果在售/成交状态填写错误，系统会根据验证规则拒绝导入。</li>
            <li>单次上传建议不超过 1000 条数据，以免处理时间过长。</li>
          </ul>
        </div>
      </PageContainer>
    </div>
  );
}
