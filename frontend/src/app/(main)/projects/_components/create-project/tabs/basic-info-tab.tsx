"use client";

import { UseFormReturn } from "react-hook-form";
import { FormValues } from "../schema";
import { SimpleInputField } from "../form-components";

interface TabProps {
  form: UseFormReturn<FormValues>;
}

export function BasicInfoTab({ form }: TabProps) {
  const { control } = form;

  return (
    <div className="space-y-5">
      <SimpleInputField
        control={control}
        name="name"
        label="项目名称 *" // 可以自己在 Label 组件里处理星号，这里简单写
        placeholder="例如：中远两湾城-3-201"
      />

      <div className="grid grid-cols-2 gap-4">
        <SimpleInputField
          control={control}
          name="community_name"
          label="小区名称"
          placeholder="输入小区..."
        />
        <SimpleInputField
          control={control}
          name="manager"
          label="负责人"
          placeholder="项目经理"
        />
      </div>

      <SimpleInputField
        control={control}
        name="address"
        label="详细地址"
        placeholder="街道/楼栋/门牌号"
      />

      <SimpleInputField
        control={control}
        name="tags"
        label="标签"
        placeholder="急售, 学区 (逗号分隔)"
        description="多个标签请用逗号或中文逗号分隔"
      />
    </div>
  );
}
