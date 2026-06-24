import { ValuationForm } from "@/components/c/lead/ValuationForm";
import { ValuationSidebar } from "@/components/c/lead/ValuationSidebar";

export default function ValuationPage() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 md:px-6 py-6 sm:py-8">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-2xl font-medium text-ink">免费获取专业估价</h1>
        <p className="mt-1.5 sm:mt-2 text-sm text-ash">
          填写房源信息，专业估价师将基于真实成交数据为您评估房产价值
        </p>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-8">
          <ValuationForm />
        </div>
        <div className="hidden lg:block lg:col-span-4">
          <ValuationSidebar />
        </div>
      </div>
    </div>
  );
}
