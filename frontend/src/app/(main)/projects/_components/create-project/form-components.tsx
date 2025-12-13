"use client";

import { Control, Path } from "react-hook-form";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormValues } from "./schema";

interface BaseFieldProps {
  control: Control<FormValues>;
  name: Path<FormValues>;
  label: string;
  placeholder?: string;
  description?: string;
}

// 1. 通用文本/数字输入框
interface SimpleInputProps extends BaseFieldProps {
  type?: "text" | "number";
  step?: string;
}

export function SimpleInputField({
  control,
  name,
  label,
  placeholder,
  description,
  type = "text",
  step,
}: SimpleInputProps) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel className={description ? "" : "mb-2"}>{label}</FormLabel>
          <FormControl>
            <Input
              type={type}
              step={step}
              placeholder={placeholder}
              {...field}
              // [修复]：显式处理类型，防止将 Date 对象传给 input
              // 如果是 string 或 number，直接使用；否则（如 Date 或 undefined）转为空字符串
              value={
                typeof field.value === "string" ||
                typeof field.value === "number"
                  ? field.value
                  : ""
              }
            />
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

// 2. 通用多行文本框
export function SimpleTextareaField({
  control,
  name,
  label,
  placeholder,
}: BaseFieldProps) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Textarea
              placeholder={placeholder}
              className="resize-none min-h-[80px]"
              {...field}
              // [修复]：同上，确保 textarea 不会接收到 Date 对象
              value={
                typeof field.value === "string" ||
                typeof field.value === "number"
                  ? field.value
                  : ""
              }
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
