"use client";

import { format } from "date-fns";
import { Calendar } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

// 日期选择器组件
export function DatePickerField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: Date | undefined;
  onChange: (date: Date | undefined) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs font-medium text-slate-600">{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "w-full justify-start text-left font-normal h-9 text-sm",
              !value && "text-muted-foreground"
            )}
            disabled={disabled}
          >
            <Calendar className="mr-2 h-3.5 w-3.5" />
            {value ? format(value, "yyyy-MM-dd") : <span>选择日期</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <CalendarComponent
            mode="single"
            selected={value}
            onSelect={onChange}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

// 数字输入框组件
export function NumberInputField({
  label,
  value,
  onChange,
  placeholder,
  disabled,
  suffix,
}: {
  label: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  suffix?: string;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs font-medium text-slate-600">{label}</Label>
      <div className="relative">
        <Input
          type="number"
          step="0.01"
          placeholder={placeholder}
          value={value ?? ""}
          onChange={(e) => {
            const val = e.target.value;
            onChange(val === "" ? undefined : parseFloat(val));
          }}
          disabled={disabled}
          className="h-9 text-sm"
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

// 文本输入框组件
export function TextInputField({
  label,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  label: string;
  value: string | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs font-medium text-slate-600">{label}</Label>
      <Input
        type="text"
        placeholder={placeholder}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="h-9 text-sm"
      />
    </div>
  );
}
