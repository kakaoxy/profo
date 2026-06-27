import Link from "next/link";
import { Compass } from "lucide-react";
import { cLocale } from "@/lib/i18n/c-locale";

export default function CNotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-graphite">
      <Compass className="mb-4 h-12 w-12 text-dove" />
      <p className="text-lg font-medium text-ink">{cLocale.notFound.title}</p>
      <p className="mt-1 text-sm">{cLocale.notFound.description}</p>
      <Link
        href="/"
        className="mt-4 inline-flex items-center rounded-full bg-ink px-6 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
      >
        {cLocale.common.action.backHome}
      </Link>
    </div>
  );
}
