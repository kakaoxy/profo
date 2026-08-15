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
  required?: boolean;
}

/* Steep-consistent input classes */
const steepInput =
  "rounded-inputs h-10 border-dove/50 bg-pure-white placeholder:text-dove focus-visible:border-ink/30 focus-visible:ring-ink/10 text-[14px]";

const steepLabel = "text-[14px] font-medium text-foreground tracking-tight";

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
  required,
}: SimpleInputProps) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel className={description ? steepLabel : `${steepLabel} mb-2`}>
            {label}
            {required && <span className="text-error ml-0.5">*</span>}
          </FormLabel>
          <FormControl>
            <Input
              type={type}
              step={step}
              placeholder={placeholder}
              className={steepInput}
              {...field}
              value={
                typeof field.value === "string" || typeof field.value === "number"
                  ? field.value
                  : ""
              }
            />
          </FormControl>
          {description && (
            <FormDescription className="text-graphite">{description}</FormDescription>
          )}
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
  required,
}: BaseFieldProps) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel className={steepLabel}>
            {label}
            {required && <span className="text-error ml-0.5">*</span>}
          </FormLabel>
          <FormControl>
            <Textarea
              placeholder={placeholder}
              className="rounded-inputs resize-none min-h-[80px] border-dove/50 bg-pure-white placeholder:text-dove focus-visible:border-ink/30 focus-visible:ring-ink/10 text-[14px]"
              {...field}
              value={
                typeof field.value === "string" || typeof field.value === "number"
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
