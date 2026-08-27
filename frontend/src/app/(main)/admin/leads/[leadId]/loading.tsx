export default function LeadDetailLoading() {
  return (
    <div className="flex flex-1 flex-col bg-fog">
      {/* 顶部返回栏占位 */}
      <div className="sticky top-0 z-40 h-14 bg-card/80 border-b border-dove backdrop-blur-xl" />

      {/* 内容区骨架 */}
      <main className="max-w-2xl mx-auto w-full px-3 py-4 space-y-4">
        <div className="h-48 rounded-xl bg-fog animate-pulse ring-1 ring-dove/40" />
        <div className="h-40 rounded-2xl bg-fog animate-pulse ring-1 ring-dove/40" />
        <div className="h-64 rounded-2xl bg-fog animate-pulse ring-1 ring-dove/40" />
        <div className="h-32 rounded-2xl bg-fog animate-pulse ring-1 ring-dove/40" />
      </main>
    </div>
  );
}
