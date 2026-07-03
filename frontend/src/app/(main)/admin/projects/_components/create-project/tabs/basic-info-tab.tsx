"use client";

import { logger } from "@/lib/logger";
import { useState, useEffect } from "react";
import { UseFormReturn, Controller } from "react-hook-form";
import { FormValues, ORIENTATION_OPTIONS, BUSINESS_FORM_OPTIONS } from "../schema";
import { SimpleInputField } from "../form-components";
import { CommunitySelect } from "@/components/common/community-select";
import { getUsersSimpleAction, getCurrentUserAction } from "../../../actions/sales";
import { FloorInput } from "@/components/common";
import { toast } from "sonner";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { RadioGroup } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface TabProps {
  form: UseFormReturn<FormValues>;
}

interface UserOption {
  id: string;
  nickname: string | null;
  username: string;
}

// 户型数字输入框组件 — Steep: centered text, rounded-inputs, compact height
function RoomNumberField({
  control,
  name,
  placeholder,
}: {
  control: UseFormReturn<FormValues>["control"];
  name: "rooms" | "halls" | "bathrooms";
  placeholder: string;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className="flex-1">
          <FormControl>
            <Input
              type="number"
              min={0}
              step={1}
              placeholder={placeholder}
              {...field}
              value={field.value ?? ""}
              onChange={(e) => {
                const val = e.target.value;
                field.onChange(val === "" ? undefined : parseInt(val, 10));
              }}
              className="rounded-inputs h-10 text-center border-dove/50 bg-pure-white focus-visible:border-ink/30 focus-visible:ring-ink/10"
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export function BasicInfoTab({ form }: TabProps) {
  const { control } = form;
  const [users, setUsers] = useState<UserOption[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);

  // 区分是来自小区的 district（只读）还是用户手输（可编辑）
  const [communityDistrict, setCommunityDistrict] = useState<string | undefined>(undefined);
  const [communityBusinessCircle, setCommunityBusinessCircle] = useState<string | undefined>(undefined);

  // 加载用户列表 + 当前登录用户（并行）
  useEffect(() => {
    let mounted = true;
    Promise.all([getUsersSimpleAction(), getCurrentUserAction()])
      .then(([usersResult, currentUserResult]) => {
        if (!mounted) return;
        if (usersResult.success && usersResult.data) {
          setUsers(usersResult.data);
        } else if (!usersResult.success) {
          logger.error("加载用户列表失败:", usersResult.message);
          toast.error(usersResult.message || "加载用户列表失败");
        }
        if (currentUserResult.success && currentUserResult.data) {
          const currentManagerId = form.getValues("project_manager_id");
          if (!currentManagerId) {
            form.setValue("project_manager_id", currentUserResult.data.id);
          }
        }
        setIsLoadingUsers(false);
      })
      .catch((err) => {
        if (!mounted) return;
        logger.error("加载数据失败:", err);
        toast.error("加载数据失败");
        setIsLoadingUsers(false);
      });
    return () => {
      mounted = false;
    };
  }, [form]);

  return (
    <div className="space-y-5">
      {/* 第一行：小区 / 行政区 / 商圈（行政区与商圈较窄，小区占更大比例） */}
      <div className="grid grid-cols-[2fr_1fr_1fr] gap-4">
        {/* 小区名称 - 使用小区选择组件 */}
        <Controller
          control={control}
          name="community_name"
          render={({ field }) => (
            <CommunitySelect
              value={field.value}
              onChange={(community) => {
                field.onChange(community.name);
                form.setValue("community_id", community.id || undefined);
                form.setValue("district", community.district || "");
                form.setValue("original_community_district", community.district || "");
                setCommunityDistrict(community.district);
                form.setValue("business_circle", community.businessCircle || "");
                form.setValue("original_community_business_circle", community.businessCircle || "");
                setCommunityBusinessCircle(community.businessCircle);
              }}
            />
          )}
        />

        {/* 行政区 */}
        <FormField
          control={control}
          name="district"
          render={({ field }) => {
            const hasCommunityDistrict = !!communityDistrict;
            return (
              <FormItem>
                <FormLabel className="text-[14px] font-medium text-foreground tracking-tight">
                  行政区
                  {!hasCommunityDistrict && (
                    <span className="text-[12px] text-graphite font-normal ml-1">
                      （可手输）
                    </span>
                  )}
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder="如：黄浦区"
                    readOnly={hasCommunityDistrict}
                    {...field}
                    value={field.value || ""}
                    className={`rounded-inputs h-10 border-dove/50 bg-pure-white placeholder:text-dove focus-visible:border-ink/30 focus-visible:ring-ink/10 ${
                      hasCommunityDistrict ? "bg-fog/60 text-graphite" : ""
                    }`}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            );
          }}
        />

        {/* 商圈 */}
        <FormField
          control={control}
          name="business_circle"
          render={({ field }) => {
            const hasCommunityBusinessCircleVal = !!communityBusinessCircle;
            return (
              <FormItem>
                <FormLabel className="text-[14px] font-medium text-foreground tracking-tight">
                  商圈
                  {!hasCommunityBusinessCircleVal && (
                    <span className="text-[12px] text-graphite font-normal ml-1">
                      （可手输）
                    </span>
                  )}
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder="如：南京西路"
                    readOnly={hasCommunityBusinessCircleVal}
                    {...field}
                    value={field.value || ""}
                    className={`rounded-inputs h-10 border-dove/50 bg-pure-white placeholder:text-dove focus-visible:border-ink/30 focus-visible:ring-ink/10 ${
                      hasCommunityBusinessCircleVal ? "bg-fog/60 text-graphite" : ""
                    }`}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            );
          }}
        />
      </div>

      {/* 第二行：详细地址 - 独占一行（地址通常较长） */}
      <FormField
        control={control}
        name="address"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-[14px] font-medium text-foreground tracking-tight">
              详细地址
              <span className="text-error ml-0.5">*</span>
            </FormLabel>
            <FormControl>
              <Input
                placeholder="街道/楼栋/门牌号"
                {...field}
                value={field.value || ""}
                className="rounded-inputs h-10 border-dove/50 bg-pure-white placeholder:text-dove focus-visible:border-ink/30 focus-visible:ring-ink/10"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* 第三行：产证面积 + 户型 */}
      <div className="grid grid-cols-2 gap-4">
        {/* 产证面积 */}
        <FormField
          control={control}
          name="area"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-[14px] font-medium text-foreground tracking-tight">
                产证面积 (㎡)
              </FormLabel>
              <FormControl>
                <Input
                  type="number"
                  placeholder="输入面积"
                  {...field}
                  value={field.value || ""}
                  className="rounded-inputs h-10 border-dove/50 bg-pure-white placeholder:text-dove focus-visible:border-ink/30 focus-visible:ring-ink/10"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* 户型 - Steep: pill-chip styled room inputs */}
        <FormItem>
          <FormLabel className="text-[14px] font-medium text-foreground tracking-tight">
            户型
            <span className="text-[12px] text-graphite font-normal ml-1">（至少填写一项）</span>
          </FormLabel>
          <div className="flex items-center gap-2">
            <RoomNumberField
              control={control}
              name="rooms"
              placeholder="2"
            />
            <span className="text-[13px] text-graphite shrink-0">室</span>
            <RoomNumberField
              control={control}
              name="halls"
              placeholder="1"
            />
            <span className="text-[13px] text-graphite shrink-0">厅</span>
            <RoomNumberField
              control={control}
              name="bathrooms"
              placeholder="1"
            />
            <span className="text-[13px] text-graphite shrink-0">卫</span>
          </div>
        </FormItem>
      </div>

      {/* 第四行：楼层 + 朝向 */}
      <div className="grid grid-cols-2 gap-4">
        {/* 楼层 - 共享组件（与线索表单共用） */}
        <FormField
          control={control}
          name="floor_info"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-[14px] font-medium text-foreground tracking-tight">楼层</FormLabel>
              <FormControl>
                <FloorInput
                  value={field.value || ""}
                  onChange={field.onChange}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* 朝向 — Steep: pill-style radio chips */}
        <FormField
          control={control}
          name="orientation"
          render={({ field }) => (
            <FormItem className="space-y-3">
              <FormLabel className="text-[14px] font-medium text-foreground tracking-tight">朝向</FormLabel>
              <FormControl>
                <RadioGroup
                  onValueChange={field.onChange}
                  value={field.value}
                  className="flex flex-wrap gap-2"
                >
                  {ORIENTATION_OPTIONS.map((option) => (
                    <label
                      key={option.value}
                      className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-medium cursor-pointer transition-all border ${
                        field.value === option.value
                          ? "bg-ink text-pure-white border-ink"
                          : "bg-pure-white text-graphite border-dove/50 hover:border-dove hover:bg-fog/50"
                      }`}
                    >
                      <input
                        type="radio"
                        value={option.value}
                        checked={field.value === option.value}
                        onChange={() => field.onChange(option.value)}
                        className="sr-only"
                      />
                      {option.label}
                    </label>
                  ))}
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      {/* 第五行：业务形式（与朝向同样的 pill 选项形式） + 项目负责人 */}
      <div className="grid grid-cols-2 gap-4">
        {/* 业务形式 — Steep: pill-style radio chips（与朝向同款） */}
        <FormField
          control={control}
          name="business_form"
          render={({ field }) => (
            <FormItem className="space-y-3">
              <FormLabel className="text-[14px] font-medium text-foreground tracking-tight">业务形式</FormLabel>
              <FormControl>
                <RadioGroup
                  onValueChange={field.onChange}
                  value={field.value || ""}
                  className="flex flex-wrap gap-2"
                >
                  {BUSINESS_FORM_OPTIONS.map((option) => (
                    <label
                      key={option.value}
                      className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-medium cursor-pointer transition-all border ${
                        field.value === option.value
                          ? "bg-ink text-pure-white border-ink"
                          : "bg-pure-white text-graphite border-dove/50 hover:border-dove hover:bg-fog/50"
                      }`}
                    >
                      <input
                        type="radio"
                        value={option.value}
                        checked={field.value === option.value}
                        onChange={() => field.onChange(option.value)}
                        className="sr-only"
                      />
                      {option.label}
                    </label>
                  ))}
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* 项目负责人 */}
        <FormField
          control={control}
          name="project_manager_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-[14px] font-medium text-foreground tracking-tight">项目负责人</FormLabel>
              <Select
                value={field.value || "__empty__"}
                onValueChange={(value) => {
                  const newValue = value === "__empty__" ? undefined : value;
                  field.onChange(newValue);
                }}
                disabled={isLoadingUsers}
              >
                <FormControl>
                  <SelectTrigger className="rounded-inputs h-10 border-dove/50 bg-pure-white text-[14px] focus:ring-ink/10">
                    <SelectValue placeholder="未选择" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="__empty__">未选择</SelectItem>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.nickname || user.username}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      {/* 第六行：公用事业户号 */}
      <div className="space-y-3">
        <h3 className="text-[14px] font-medium text-foreground tracking-tight">公用事业户号</h3>
        <div className="grid grid-cols-3 gap-4">
          <SimpleInputField
            control={control}
            name="electricity_account"
            label="电表户号"
          />
          <SimpleInputField
            control={control}
            name="water_account"
            label="水表户号"
          />
          <SimpleInputField
            control={control}
            name="gas_account"
            label="煤气户号"
          />
        </div>
      </div>
    </div>
  );
}
