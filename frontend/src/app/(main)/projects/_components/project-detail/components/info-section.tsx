import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface InfoSectionProps {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * 信息区块组件 - 带标题的卡片式布局
 */
export function InfoSection({ title, icon, children }: InfoSectionProps) {
  return (
    <Card className="bg-card/50 border-muted">
      <CardHeader className="!pb-2 px-4 border-b border-border/60">
        <CardTitle className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 !pt-2 !pb-2 grid gap-x-8 gap-y-1 sm:grid-cols-2">{children}</CardContent>
    </Card>
  );
}
