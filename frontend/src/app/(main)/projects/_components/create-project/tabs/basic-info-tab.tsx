"use client";

import { useState, useEffect } from "react";
import { UseFormReturn, Controller } from "react-hook-form";
import { FormValues, ORIENTATION_OPTIONS } from "../schema";
import { CommunitySelect } from "@/components/common/community-select";
import { getUsersSimpleAction } from "../../../actions/sales";
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

  // 加载用户列表
  useEffect(() => {
    let mounted = true;
    getUsersSimpleAction().then((result) => {
      if (mounted) {
        if (result.success && result.data) {
          setUsers(result.data);
        } else if (!result.success) {
          console.error("加载用户列表失败:", result.message);
          toast.error(result.message || "加载用户列表失败");
        }
        setIsLoadingUsers(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

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
              onChange={(community) => field.onChange(community.name)}
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
                <span className="text-red-500 ml-1">*</span>
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

      {/* 第二行：产证面积 + 户型 */}
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

      {/* 第三行：朝向 + 项目负责人 */}
      <div className="grid grid-cols-2 gap-4">
        {/* 朝向 - 单选框 */}
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

        {/* 负责人选择 */}
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
    </div>
  );
}
