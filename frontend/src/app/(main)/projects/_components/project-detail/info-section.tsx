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
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">{children}</CardContent>
    </Card>
  );
}
