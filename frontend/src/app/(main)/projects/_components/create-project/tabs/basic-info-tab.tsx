"use client";

import { UseFormReturn, Controller } from "react-hook-form";
import { FormValues, ORIENTATION_OPTIONS } from "../schema";
import { SimpleInputField } from "../form-components";
import { CommunitySelect } from "@/components/common/community-select";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface TabProps {
  form: UseFormReturn<FormValues>;
}

// 户型数字输入框组件
function RoomNumberField({
  control,
  name,
  label,
  placeholder,
}: {
  control: UseFormReturn<FormValues>["control"];
  name: "rooms" | "halls" | "bathrooms";
  label: string;
  placeholder: string;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className="flex-1">
          <FormLabel className="text-xs text-muted-foreground">{label}</FormLabel>
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
              className="text-center"
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

  return (
    <div className="space-y-5">
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

      {/* 产证面积 */}
      <SimpleInputField
        control={control}
        name="area"
        label="产证面积 (㎡)"
        placeholder="输入面积"
        type="number"
      />

      {/* 户型 - 三个独立输入框 */}
      <div className="space-y-2">
        <FormLabel>户型</FormLabel>
        <div className="flex items-center gap-2">
          <RoomNumberField
            control={control}
            name="rooms"
            label=""
            placeholder="2"
          />
          <span className="text-muted-foreground pt-5">室</span>
          <RoomNumberField
            control={control}
            name="halls"
            label=""
            placeholder="1"
          />
          <span className="text-muted-foreground pt-5">厅</span>
          <RoomNumberField
            control={control}
            name="bathrooms"
            label=""
            placeholder="1"
          />
          <span className="text-muted-foreground pt-5">卫</span>
        </div>
        <p className="text-xs text-muted-foreground">至少填写一项</p>
      </div>

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

      {/* 详细地址 */}
      <SimpleInputField
        control={control}
        name="address"
        label="详细地址"
        placeholder="街道/楼栋/门牌号"
        required
      />
    </div>
  );
}
