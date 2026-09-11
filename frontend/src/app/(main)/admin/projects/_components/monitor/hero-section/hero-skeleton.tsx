"use client";

export function HeroSkeleton() {
  return (
    <section className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 bg-white border-b border-fog">
      <div className="lg:col-span-7 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="mt-1 p-2 rounded-lg bg-fog animate-pulse w-8 h-8" />
            <div className="flex-1">
              <div className="h-3 bg-fog rounded animate-pulse w-16 mb-2" />
              <div className="h-4 bg-fog rounded animate-pulse w-32" />
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="mt-1 p-2 rounded-lg bg-fog animate-pulse w-8 h-8" />
            <div className="flex-1">
              <div className="h-3 bg-fog rounded animate-pulse w-16 mb-2" />
              <div className="h-4 bg-fog rounded animate-pulse w-24" />
            </div>
          </div>
        </div>
        <div className="space-y-4">
          <div className="h-20 bg-fog rounded animate-pulse" />
          <div className="h-12 bg-fog rounded animate-pulse" />
        </div>
      </div>
      <div className="lg:col-span-5">
        <div className="h-32 bg-fog rounded animate-pulse" />
      </div>
    </section>
  );
}
