import { Loader2 } from "lucide-react";
import { PageContainer } from "@/app/(main)/admin/_components";

export default function Loading() {
  return (
    <div className="min-h-screen bg-fog">
      <PageContainer>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-ink" />
          <span className="ml-3 text-graphite">加载线索数据...</span>
        </div>
      </PageContainer>
    </div>
  );
}
