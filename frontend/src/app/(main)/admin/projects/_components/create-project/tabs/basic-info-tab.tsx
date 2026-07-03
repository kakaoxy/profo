"use client";

import { logger } from "@/lib/logger";
import { useState, useEffect } from "react";
import { UseFormReturn, Controller } from "react-hook-form";
import { FormValues, ORIENTATION_OPTIONS, BUSINESS_FORM_OPTIONS } from "../schema";
import { CommunitySelect } from "@/components/common/community-select";
import { getUsersSimpleAction, getCurrentUserAction } from "../../../actions/sales";
import { toast } from "sonner";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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

// 户型数字输入框组件
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
              className="text-center h-10"
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
  // 通过跟踪 community 原始 district 来判断
  const [communityDistrict, setCommunityDistrict] = useState<string | undefined>(undefined);
  // 商圈同理：来自小区则只读，无则可编辑
  const [communityBusinessCircle, setCommunityBusinessCircle] = useState<string | undefined>(undefined);

  // 加载用户列表 + 当前登录用户（并行）
  useEffect(() => {
    let mounted = true;
    Promise.all([getUsersSimpleAction(), getCurrentUserAction()]).then(
      ([usersResult, currentUserResult]) => {
        if (!mounted) return;
        if (usersResult.success && usersResult.data) {
          setUsers(usersResult.data);
        } else if (!usersResult.success) {
          logger.error("加载用户列表失败:", usersResult.message);
          toast.error(usersResult.message || "加载用户列表失败");
        }
        // 新建模式下，若项目负责人为空，默认设为当前登录用户
        if (currentUserResult.success && currentUserResult.data) {
          const currentManagerId = form.getValues("project_manager_id");
          if (!currentManagerId) {
            form.setValue("project_manager_id", currentUserResult.data.id);
          }
        }
        setIsLoadingUsers(false);
      }
    );
    return () => {
      mounted = false;
    };
  }, [form]);

  return (
    <div className="space-y-4">
      {/* 第一行：小区名称 + 详细地址 */}
      <div className="grid grid-cols-2 gap-4">
        {/* 小区名称 - 使用小区选择组件 */}
        <Controller
          control={control}
          name="community_name"
          render={({ field }) => (
            <CommunitySelect
              value={field.value}
              onChange={(community) => {
                field.onChange(community.name);
                // 同时保存小区ID用于市场监控数据关联
                form.setValue("community_id", community.id || undefined);
                // 回填行政区（来自小区搜索结果）
                form.setValue("district", community.district || "");
                // 快照小区原始行政区，用于 onSubmit 比对是否被用户修改（AC-4.3）
                form.setValue("original_community_district", community.district || "");
                setCommunityDistrict(community.district);
                // 回填商圈（与行政区同源，来自小区）
                form.setValue("business_circle", community.businessCircle || "");
                form.setValue("original_community_business_circle", community.businessCircle || "");
                setCommunityBusinessCircle(community.businessCircle);
              }}
            />
          )}
        />

        {/* 详细地址 */}
        <FormField
          control={control}
          name="address"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                详细地址
                <span className="text-error ml-1">*</span>
              </FormLabel>
              <FormControl>
                <Input
                  placeholder="街道/楼栋/门牌号"
                  {...field}
                  value={field.value || ""}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      {/* 第二行：业务形式 + 行政区 + 商圈 */}
      <div className="grid grid-cols-3 gap-4">
        {/* 业务形式 */}
        <FormField
          control={control}
          name="business_form"
          render={({ field }) => (
            <FormItem>
              <FormLabel>业务形式</FormLabel>
              <Select
                value={field.value || "__empty__"}
                onValueChange={(value) => {
                  field.onChange(value === "__empty__" ? "" : value);
                }}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="未设置" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="__empty__">未设置</SelectItem>
                  {BUSINESS_FORM_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* 行政区 - 选择小区后自动回填，无 district 时可编辑 */}
        <FormField
          control={control}
          name="district"
          render={({ field }) => {
            const hasCommunityDistrict = !!communityDistrict;
            return (
              <FormItem>
                <FormLabel>
                  行政区
                  {!hasCommunityDistrict && (
                    <span className="text-xs text-muted-foreground ml-1">
                      （小区未设置，可手输）
                    </span>
                  )}
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder="如：黄浦区"
                    readOnly={hasCommunityDistrict}
                    {...field}
                    value={field.value || ""}
                    className={hasCommunityDistrict ? "bg-muted/50 text-muted-foreground" : ""}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            );
          }}
        />

        {/* 商圈 - 选择小区后自动回填，无 business_circle 时可编辑 */}
        <FormField
          control={control}
          name="business_circle"
          render={({ field }) => {
            const hasCommunityBusinessCircleVal = !!communityBusinessCircle;
            return (
              <FormItem>
                <FormLabel>
                  商圈
                  {!hasCommunityBusinessCircleVal && (
                    <span className="text-xs text-muted-foreground ml-1">
                      （小区未设置，可手输）
                    </span>
                  )}
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder="如：南京西路"
                    readOnly={hasCommunityBusinessCircleVal}
                    {...field}
                    value={field.value || ""}
                    className={hasCommunityBusinessCircleVal ? "bg-muted/50 text-muted-foreground" : ""}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            );
          }}
        />
      </div>

      {/* 第三行：产证面积 + 户型 */}
      <div className="grid grid-cols-2 gap-4">
        {/* 产证面积 */}
        <FormField
          control={control}
          name="area"
          render={({ field }) => (
            <FormItem>
              <FormLabel>产证面积 (㎡)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  placeholder="输入面积"
                  {...field}
                  value={field.value || ""}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* 户型 - 三个独立输入框 */}
        <FormItem>
          <FormLabel>户型    <p className="text-xs text-muted-foreground mt-1">（至少填写一项）</p></FormLabel>
          <div className="flex items-center gap-2">
            <RoomNumberField
              control={control}
              name="rooms"
              placeholder="2"
            />
            <span className="text-muted-foreground">室</span>
            <RoomNumberField
              control={control}
              name="halls"
              placeholder="1"
            />
            <span className="text-muted-foreground">厅</span>
            <RoomNumberField
              control={control}
              name="bathrooms"
              placeholder="1"
            />
            <span className="text-muted-foreground">卫</span>
          </div>

        </FormItem>
      </div>

      {/* 第四行：朝向 - 独占一行（5 个选项横向排列更舒展） */}
      <FormField
        control={control}
        name="orientation"
        render={({ field }) => (
          <FormItem className="space-y-2">
            <FormLabel>朝向</FormLabel>
            <FormControl>
              <RadioGroup
                onValueChange={field.onChange}
                value={field.value}
                className="flex flex-wrap gap-4"
              >
                {ORIENTATION_OPTIONS.map((option) => (
                  <FormItem
                    key={option.value}
                    className="flex items-center space-x-2 space-y-0"
                  >
                    <FormControl>
                      <RadioGroupItem value={option.value} />
                    </FormControl>
                    <FormLabel className="font-normal cursor-pointer">
                      {option.label}
                    </FormLabel>
                  </FormItem>
                ))}
              </RadioGroup>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* 第五行：项目负责人 - 独占一行，避免与朝向 RadioGroup 并排导致宽度不均 */}
      <FormField
        control={control}
        name="project_manager_id"
        render={({ field }) => (
          <FormItem>
            <FormLabel>项目负责人</FormLabel>
            <Select
              value={field.value || "__empty__"}
              onValueChange={(value) => {
                const newValue = value === "__empty__" ? undefined : value;
                field.onChange(newValue);
              }}
              disabled={isLoadingUsers}
            >
              <FormControl>
                <SelectTrigger>
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
  );
}
