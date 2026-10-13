import { PageContainer, PageHeader } from "@/app/(main)/admin/_components";
import { ImportClient } from "./import-client";

export const dynamic = "force-dynamic";

/**
 * 字典数据导入页（FR-08 / Task 3.2）.
 *
 * 四步流程：上传 → 解析校验 → 执行进度 → 对账报告 + 任务历史。
 */
export default function ImportPage() {
  return (
    <PageContainer>
      <PageHeader
        title="导入数据"
        description="上海全域楼盘字典原始包（zip/txt ≤2GB，GBK/UTF-8 自动识别）四步导入"
      />
      <ImportClient />
    </PageContainer>
  );
}
