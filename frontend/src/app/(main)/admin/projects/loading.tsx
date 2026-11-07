export default function ProjectsLoading() {
  return (
    <div className="min-h-screen bg-fog">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-7 px-4 pb-12 pt-6 sm:px-6 lg:px-8">
        <div className="animate-pulse">
          <div className="h-2.5 w-40 rounded-full bg-dove/20" />
          <div className="mt-4 h-11 w-52 rounded-[10px] bg-dove/20" />
          <div className="mt-4 h-3 w-80 rounded-full bg-dove/15" />
        </div>
        <div className="animate-pulse rounded-cards bg-white p-6 shadow-steep">
          <div className="flex items-end justify-between gap-8">
            <div>
              <div className="h-2.5 w-24 rounded-full bg-dove/20" />
              <div className="mt-4 h-12 w-24 rounded-[10px] bg-dove/20" />
              <div className="mt-3 h-2.5 w-56 rounded-full bg-dove/15" />
            </div>
            <div className="hidden gap-10 md:flex">
              {[0, 1, 2].map((item) => (
                <div key={item}>
                  <div className="h-2.5 w-20 rounded-full bg-dove/15" />
                  <div className="mt-3 h-6 w-24 rounded-[8px] bg-dove/20" />
                </div>
              ))}
            </div>
          </div>
          <div className="mt-8 grid grid-cols-2 gap-2 md:grid-cols-5">
            {[0, 1, 2, 3, 4].map((item) => (
              <div key={item} className="h-[104px] rounded-[16px] bg-fog" />
            ))}
          </div>
        </div>
        <div className="animate-pulse rounded-cards bg-white p-5 shadow-steep">
          <div className="h-5 w-28 rounded-full bg-dove/20" />
          <div className="mt-5 flex gap-3">
            <div className="h-10 w-56 rounded-inputs bg-fog" />
            <div className="h-10 w-32 rounded-inputs bg-fog" />
            <div className="h-10 w-32 rounded-inputs bg-fog" />
          </div>
          <div className="mt-4 space-y-0">
            {[0, 1, 2, 3, 4, 5].map((item) => (
              <div key={item} className="flex h-[86px] items-center gap-4 border-t border-dove/15">
                <div className="h-11 w-11 rounded-[12px] bg-fog" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-1/3 rounded-full bg-dove/20" />
                  <div className="h-2.5 w-1/2 rounded-full bg-dove/15" />
                </div>
                <div className="h-6 w-20 rounded-full bg-fog" />
                <div className="h-4 w-24 rounded-full bg-fog" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
