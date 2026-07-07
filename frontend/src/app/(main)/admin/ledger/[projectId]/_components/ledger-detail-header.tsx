import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function LedgerDetailHeader() {
  return (
    <Link
      href="/admin/ledger"
      className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
    >
      <ArrowLeft className="h-4 w-4" />
      返回资金账本
    </Link>
  );
}
