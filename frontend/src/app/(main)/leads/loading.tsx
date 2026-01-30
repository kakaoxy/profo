import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <div className="flex-1 space-y-4 p-4 sm:p-8 pt-6 container max-w-[1600px] mx-auto">
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-3 text-muted-foreground">加载线索数据...</span>
      </div>
    </div>
  );
}
