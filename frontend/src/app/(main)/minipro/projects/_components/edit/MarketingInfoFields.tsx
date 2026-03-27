"use client";

import * as React from "react";
import { useFormContext } from "react-hook-form";
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { TagInputField } from "./TagInputField";
import type { FormValues } from "../form-schema";
import { Check, ChevronsUpDown, Building2, Plus, Loader2, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { searchCommunitiesAction } from "@/app/(main)/leads/actions";
import { getUsersSimpleAction } from "@/app/(main)/users/actions";
import type { UserSimpleResponse } from "@/app/(main)/users/actions";

// Community Select Component
interface Community {
  id: number;
  name: string;
  district?: string;
  business_circle?: string;
}

const CommunitySelect = ({ value, onChange }: { value: string; onChange: (value: string, id?: number) => void }) => {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<Community[]>([]);
  const [loading, setLoading] = React.useState(false);
  const debounceRef = React.useRef<NodeJS.Timeout>(null);

  React.useEffect(() => {
    if (!open) return;

    if (!query) {
      setResults([]);
      return;
    }

    setLoading(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      try {
        const data = await searchCommunitiesAction(query);
        setResults(data);
      } catch (err) {
        console.error(err);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, open]);

  const handleSelect = (community: Community) => {
    onChange(community.name, community.id);
    setOpen(false);
    setQuery("");
  };

  const handleCreateNew = () => {
    if (!query) return;
    onChange(query);
    setOpen(false);
    setQuery("");
  };

  return (
    <div className="space-y-2">
      <label className="block text-xs font-bold text-[#707785] uppercase tracking-wider">
        小区名称 <span className="text-[#ba1a1a]">*</span>
      </label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full h-12 justify-between rounded-xl px-4 text-left font-medium border-[#c0c7d6]/50 hover:bg-[#e5eeff] hover:text-[#0b1c30] bg-white"
          >
            <div className="flex items-center gap-2 truncate">
              <Building2 className="h-4 w-4 text-[#707785] shrink-0" />
              <span className={cn("truncate", !value && "text-[#707785] font-normal")}>
                {value || "输入小区搜索..."}
              </span>
            </div>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0 rounded-xl" align="start">
          <div className="p-2 border-b border-[#c0c7d6]/20">
            <input
              className="w-full px-3 py-2 text-sm bg-[#f8f9ff] border border-[#c0c7d6]/30 rounded-lg outline-none focus:ring-2 focus:ring-[#005daa]/20"
              placeholder="输入关键词搜索..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="max-h-[300px] overflow-y-auto p-1">
            {loading && (
              <div className="flex items-center justify-center py-6 text-[#707785]">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                <span className="text-xs">搜索中...</span>
              </div>
            )}

            {!loading && results.length === 0 && query && (
              <div className="p-1">
                <button
                  className="w-full flex items-center gap-2 p-3 text-sm text-[#005daa] bg-[#005daa]/5 hover:bg-[#005daa]/10 rounded-lg transition-colors font-bold"
                  onClick={handleCreateNew}
                >
                  <Plus className="h-4 w-4" />
                  <span>使用新名称 &quot;{query}&quot;</span>
                </button>
              </div>
            )}

            {!loading && results.map((community) => (
              <button
                key={community.id}
                className={cn(
                  "w-full flex items-center justify-between p-3 text-sm rounded-lg hover:bg-[#eff4ff] transition-colors group text-left",
                  value === community.name && "bg-[#eff4ff] text-[#005daa] font-bold"
                )}
                onClick={() => handleSelect(community)}
              >
                <div className="flex flex-col gap-0.5">
                  <span className="font-bold text-[#0b1c30]">{community.name}</span>
                  <span className="text-[10px] text-[#707785] flex items-center gap-1">
                    {community.district} {community.business_circle && `· ${community.business_circle}`}
                  </span>
                </div>
                {value === community.name && <Check className="h-4 w-4" />}
              </button>
            ))}

            {!loading && !query && results.length === 0 && (
              <div className="py-8 text-center text-[#707785] text-xs">
                请输入关键词查找小区
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};

// Layout Inputs Component
const LayoutInputs = ({ value, onChange }: { value: string; onChange: (value: string) => void }) => {
  const [room, setRoom] = React.useState(() => value.match(/(\d+)室/)?.[1] || "");
  const [hall, setHall] = React.useState(() => value.match(/(\d+)厅/)?.[1] || "");
  const [toilet, setToilet] = React.useState(() => value.match(/(\d+)卫/)?.[1] || "");

  const handleChange = (type: "room" | "hall" | "toilet", val: string) => {
    const num = val.replace(/[^\d]/g, "");
    let newRoom = room;
    let newHall = hall;
    let newToilet = toilet;

    if (type === "room") {
      setRoom(num);
      newRoom = num;
    }
    if (type === "hall") {
      setHall(num);
      newHall = num;
    }
    if (type === "toilet") {
      setToilet(num);
      newToilet = num;
    }

    if (newRoom) {
      let res = `${newRoom}室`;
      if (newHall) res += `${newHall}厅`;
      if (newToilet) res += `${newToilet}卫`;
      onChange(res);
    } else {
      onChange("");
    }
  };

  return (
    <div className="space-y-2">
      <label className="block text-xs font-bold text-[#707785] uppercase tracking-wider">
        房源户型 <span className="text-[#ba1a1a]">*</span>
      </label>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            inputMode="numeric"
            className="w-full h-11 px-3 border border-[#c0c7d6]/50 rounded-xl bg-white text-sm font-bold text-center outline-none focus:ring-2 focus:ring-[#005daa]/20 text-[#0b1c30]"
            value={room}
            onChange={(e) => handleChange("room", e.target.value)}
            placeholder="n"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#707785]">室</span>
        </div>
        <div className="relative flex-1">
          <input
            inputMode="numeric"
            className="w-full h-11 px-3 border border-[#c0c7d6]/50 rounded-xl bg-white text-sm font-bold text-center outline-none focus:ring-2 focus:ring-[#005daa]/20 text-[#0b1c30]"
            value={hall}
            onChange={(e) => handleChange("hall", e.target.value)}
            placeholder="n"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#707785]">厅</span>
        </div>
        <div className="relative flex-1">
          <input
            inputMode="numeric"
            className="w-full h-11 px-3 border border-[#c0c7d6]/50 rounded-xl bg-white text-sm font-bold text-center outline-none focus:ring-2 focus:ring-[#005daa]/20 text-[#0b1c30]"
            value={toilet}
            onChange={(e) => handleChange("toilet", e.target.value)}
            placeholder="n"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#707785]">卫</span>
        </div>
      </div>
    </div>
  );
};

// Floor Input Component
const FloorInput = ({ value, onChange }: { value: string; onChange: (value: string) => void }) => {
  const [current, setCurrent] = React.useState(() => value.match(/(\d+)层/)?.[1] || "");
  const [total, setTotal] = React.useState(() => value.match(/共(\d+)层/)?.[1] || "");

  const handleChange = (type: "current" | "total", val: string) => {
    const num = val.replace(/[^\d]/g, "");
    let newCurrent = current;
    let newTotal = total;

    if (type === "current") {
      setCurrent(num);
      newCurrent = num;
    }
    if (type === "total") {
      setTotal(num);
      newTotal = num;
    }

    if (newCurrent && newTotal) {
      onChange(`${newCurrent}/共${newTotal}层`);
    } else if (newCurrent) {
      onChange(`${newCurrent}层`);
    } else {
      onChange("");
    }
  };

  return (
    <div className="space-y-2">
      <label className="block text-xs font-bold text-[#707785] uppercase tracking-wider">
        楼层信息 <span className="text-[#ba1a1a]">*</span>
      </label>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            inputMode="numeric"
            className="w-full h-11 px-3 border border-[#c0c7d6]/50 rounded-xl bg-white text-sm font-bold text-center outline-none focus:ring-2 focus:ring-[#005daa]/20 text-[#0b1c30]"
            value={current}
            onChange={(e) => handleChange("current", e.target.value)}
            placeholder="当前"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#707785]">层</span>
        </div>
        <span className="text-[#707785] font-bold">/</span>
        <div className="relative flex-1">
          <input
            inputMode="numeric"
            className="w-full h-11 px-3 border border-[#c0c7d6]/50 rounded-xl bg-white text-sm font-bold text-center outline-none focus:ring-2 focus:ring-[#005daa]/20 text-[#0b1c30]"
            value={total}
            onChange={(e) => handleChange("total", e.target.value)}
            placeholder="总"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#707785]">层</span>
        </div>
      </div>
    </div>
  );
};

// Orientation Select Component
const OrientationSelect = ({ value, onChange }: { value: string; onChange: (value: string) => void }) => {
  const orientations = ["南", "北", "东", "西", "南北", "东西", "东南", "西南", "东北", "西北"];

  return (
    <div className="space-y-2">
      <label className="block text-xs font-bold text-[#707785] uppercase tracking-wider">
        朝向 <span className="text-[#ba1a1a]">*</span>
      </label>
      <div className="grid grid-cols-5 gap-2">
        {orientations.map((ori) => (
          <button
            key={ori}
            type="button"
            onClick={() => onChange(ori)}
            className={cn(
              "h-10 rounded-lg text-sm font-bold transition-all border",
              value === ori
                ? "bg-[#005daa] text-white border-[#005daa]"
                : "bg-white text-[#0b1c30] border-[#c0c7d6]/50 hover:border-[#005daa]/50"
            )}
          >
            {ori}
          </button>
        ))}
      </div>
    </div>
  );
};

// Price Inputs Component
const PriceInputs = ({
  totalPrice,
  unitPrice,
  area,
  onTotalPriceChange,
  onUnitPriceChange,
}: {
  totalPrice: string;
  unitPrice: string;
  area: string;
  onTotalPriceChange: (value: string) => void;
  onUnitPriceChange: (value: number) => void;
}) => {
  // Auto calculate unit price when total price or area changes
  React.useEffect(() => {
    const total = parseFloat(totalPrice);
    const areaNum = parseFloat(area);
    if (total > 0 && areaNum > 0) {
      // 计算逻辑：总价(万元) * 10000 / 面积(㎡) = 单价(元/㎡)
      const calculatedUnitPrice = (total * 10000) / areaNum;
      onUnitPriceChange(Math.round(calculatedUnitPrice));
    }
  }, [totalPrice, area]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="space-y-2">
        <label className="block text-xs font-bold text-[#707785] uppercase tracking-wider">
          总价 (万元) <span className="text-[#ba1a1a]">*</span>
        </label>
        <div className="relative">
          <input
            inputMode="decimal"
            className="w-full h-14 px-4 border border-[#c0c7d6]/50 rounded-xl bg-white text-2xl font-black outline-none focus:ring-2 focus:ring-[#005daa]/20 text-[#005daa]"
            value={totalPrice}
            onChange={(e) => onTotalPriceChange(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder="0"
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-[#707785]">万</span>
        </div>
      </div>

      <div className="space-y-2">
        <label className="block text-xs font-bold text-[#707785] uppercase tracking-wider">
          单价 (元/㎡)
        </label>
        <div className="relative">
          <input
            inputMode="decimal"
            className="w-full h-14 px-4 border border-[#c0c7d6]/50 rounded-xl bg-[#f8f9ff] text-xl font-bold outline-none text-[#0b1c30]"
            value={unitPrice}
            readOnly
            placeholder="自动计算"
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-[#7d5400] bg-[#ffddb0]/30 px-2 py-0.5 rounded">
            自动
          </span>
        </div>
      </div>
    </div>
  );
};

// Consultant Select Component
const ConsultantSelect = ({ value, onChange }: { value: string | undefined; onChange: (value: string | undefined) => void }) => {
  const [open, setOpen] = React.useState(false);
  const [consultants, setConsultants] = React.useState<UserSimpleResponse[]>([]);
  const [loading, setLoading] = React.useState(false);

  // Fetch consultants when popover opens
  React.useEffect(() => {
    const fetchConsultants = async () => {
      setLoading(true);
      try {
        const result = await getUsersSimpleAction({ status: "active" });
        if (result.success && result.data?.items) {
          setConsultants(result.data.items);
        } else {
          setConsultants([]);
        }
      } catch (err) {
        console.error("Failed to fetch consultants:", err);
        setConsultants([]);
      } finally {
        setLoading(false);
      }
    };

    if (open) {
      fetchConsultants();
    }
  }, [open]);

  // Find selected consultant by string id
  const selectedConsultant = consultants.find(c => c.id === value);

  return (
    <div className="space-y-2">
      <label className="block text-xs font-bold text-[#707785] uppercase tracking-wider">
        房源顾问
      </label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full h-12 justify-between rounded-xl px-4 text-left font-medium border-[#c0c7d6]/50 hover:bg-[#e5eeff] hover:text-[#0b1c30] bg-white"
          >
            <div className="flex items-center gap-2 truncate">
              <User className="h-4 w-4 text-[#707785] shrink-0" />
              <span className={cn("truncate", !selectedConsultant && "text-[#707785] font-normal")}>
                {selectedConsultant
                  ? `${selectedConsultant.nickname || selectedConsultant.username}`
                  : "选择房源顾问..."}
              </span>
            </div>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0 rounded-xl" align="start">
          <div className="max-h-[300px] overflow-y-auto p-1">
            {loading && (
              <div className="flex items-center justify-center py-6 text-[#707785]">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                <span className="text-xs">加载中...</span>
              </div>
            )}

            {!loading && consultants.length === 0 && (
              <div className="py-8 text-center text-[#707785] text-xs">
                暂无顾问数据
              </div>
            )}

            {!loading && consultants.map((consultant) => (
              <button
                key={consultant.id}
                className={cn(
                  "w-full flex items-center justify-between p-3 text-sm rounded-lg hover:bg-[#eff4ff] transition-colors group text-left",
                  value === consultant.id && "bg-[#eff4ff] text-[#005daa] font-bold"
                )}
                onClick={() => {
                  onChange(consultant.id);
                  setOpen(false);
                }}
              >
                <div className="flex flex-col gap-0.5">
                  <span className="font-bold text-[#0b1c30]">
                    {consultant.nickname || consultant.username}
                  </span>
                  <span className="text-[10px] text-[#707785]">
                    {consultant.username}
                  </span>
                </div>
                {value === consultant.id && <Check className="h-4 w-4" />}
              </button>
            ))}

            {/* Clear selection option */}
            {!loading && value && (
              <div className="p-1 border-t border-[#c0c7d6]/20 mt-1">
                <button
                  className="w-full flex items-center gap-2 p-3 text-sm text-[#707785] hover:bg-[#ffdad6]/30 rounded-lg transition-colors"
                  onClick={() => {
                    onChange(undefined);
                    setOpen(false);
                  }}
                >
                  <span>清除选择</span>
                </button>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};

export function MarketingInfoFields() {
  const { control, watch, setValue } = useFormContext<FormValues>();
  const tags = watch("tags") ?? [];
  const layout = watch("layout") ?? "";
  const floorInfo = watch("floor_info") ?? "";
  const orientation = watch("orientation") ?? "";
  const totalPrice = watch("total_price") ?? "";
  const unitPrice = watch("unit_price") ?? "";
  const area = watch("area") ?? "";

  return (
    <div className="space-y-6">
      {/* Basic Info Section */}
      <section className="bg-[#eff4ff] rounded-2xl p-8">
        <h3 className="text-lg font-bold text-[#0b1c30] mb-6 flex items-center gap-2">
          <span className="w-1.5 h-6 bg-[#005daa] rounded-full"></span>
          基础信息 (Basic Info)
        </h3>
        <div className="space-y-6">
          {/* 第一行：小区名称和房源标题 - 使用 items-start 对齐 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            <FormField
              control={control}
              name="community_id"
              render={({ field }) => (
                <FormItem className="space-y-0">
                  <FormControl>
                    <CommunitySelect
                      value={watch("community_name") || ""}
                      onChange={(name, id) => {
                        if (id) field.onChange(id);
                        setValue("community_name", name);
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name="title"
              render={({ field }) => (
                <FormItem className="space-y-2">
                  <FormLabel className="block text-xs font-bold text-[#707785] uppercase tracking-wider">
                    房源标题 <span className="text-[#ba1a1a]">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="输入吸引人的房源标题"
                      {...field}
                      value={String(field.value ?? "")}
                      onChange={(e) => field.onChange(e.target.value)}
                      className="w-full h-12 px-4 border border-[#c0c7d6]/50 rounded-xl bg-white text-sm font-medium outline-none focus:ring-2 focus:ring-[#005daa]/20 text-[#0b1c30]"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* 第二行：顾问选择 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            <FormField
              control={control}
              name="consultant_id"
              render={({ field }) => (
                <FormItem className="space-y-0">
                  <FormControl>
                    <ConsultantSelect
                      value={field.value}
                      onChange={(id) => field.onChange(id)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>
      </section>

      {/* Layout & Specs Section */}
      <section className="bg-[#eff4ff] rounded-2xl p-8">
        <h3 className="text-lg font-bold text-[#0b1c30] mb-6 flex items-center gap-2">
          <span className="w-1.5 h-6 bg-[#005daa] rounded-full"></span>
          户型与规格 (Layout & Specs)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField
            control={control}
            name="layout"
            render={({ field }) => (
              <FormItem className="space-y-0">
                <FormControl>
                  <LayoutInputs
                    value={field.value || ""}
                    onChange={(val) => field.onChange(val)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={control}
            name="area"
            render={({ field }) => (
              <FormItem className="space-y-2">
                <FormLabel className="block text-xs font-bold text-[#707785] uppercase tracking-wider">
                  面积 (㎡) <span className="text-[#ba1a1a]">*</span>
                </FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input
                      inputMode="decimal"
                      placeholder="例如：120.5"
                      value={field.value || ""}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^\d.]/g, "");
                        const numVal = val === "" ? 0 : parseFloat(val);
                        field.onChange(numVal);
                      }}
                      className="w-full h-11 px-4 border border-[#c0c7d6]/50 rounded-xl bg-white text-sm font-bold outline-none focus:ring-2 focus:ring-[#005daa]/20 text-[#0b1c30]"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-[#707785]">㎡</span>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={control}
            name="floor_info"
            render={({ field }) => (
              <FormItem className="space-y-0">
                <FormControl>
                  <FloorInput
                    value={field.value || ""}
                    onChange={(val) => field.onChange(val)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={control}
            name="orientation"
            render={({ field }) => (
              <FormItem className="space-y-0">
                <FormControl>
                  <OrientationSelect
                    value={field.value || ""}
                    onChange={(val) => field.onChange(val)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </section>

      {/* Pricing Section */}
      <section className="bg-[#eff4ff] rounded-2xl p-8">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-bold text-[#0b1c30] flex items-center gap-2">
            <span className="w-1.5 h-6 bg-[#005daa] rounded-full"></span>
            价格设置 (Pricing)
          </h3>
        </div>
        <FormField
          control={control}
          name="total_price"
          render={({ field }) => (
            <FormItem className="space-y-0">
              <FormControl>
                <PriceInputs
                  totalPrice={String(field.value ?? "")}
                  unitPrice={String(watch("unit_price") ?? "")}
                  area={String(watch("area") ?? "")}
                  onTotalPriceChange={(val) => {
                    const numVal = val === "" ? 0 : parseFloat(val);
                    field.onChange(numVal);
                  }}
                  onUnitPriceChange={(val) => setValue("unit_price", val)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </section>

      {/* Tags Section */}
      <section className="bg-[#eff4ff] rounded-2xl p-8">
        <h3 className="text-lg font-bold text-[#0b1c30] mb-6 flex items-center gap-2">
          <span className="w-1.5 h-6 bg-[#005daa] rounded-full"></span>
          标签与风格 (Tags & Styles)
        </h3>
        <FormField
          control={control}
          name="tags"
          render={({ field }) => (
            <FormItem className="space-y-2">
              <FormLabel className="block text-xs font-bold text-[#707785] uppercase tracking-wider">
                房源标签
                <span className="text-xs text-[#707785]/60 ml-2">
                  ({tags.length}/20)
                </span>
              </FormLabel>
              <FormControl>
                <TagInputField
                  value={field.value ?? []}
                  onChange={(value) => field.onChange(value)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </section>
    </div>
  );
}
