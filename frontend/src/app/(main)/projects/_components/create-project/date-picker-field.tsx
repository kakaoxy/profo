"use client";

import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { Control, Path } from "react-hook-form";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { FormValues } from "./schema";

interface DatePickerProps {
  control: Control<FormValues>;
  // 使用 Path<FormValues> 确保 name 必须是表单字段之一，这就不会报错了
  name: Path<FormValues>;
  label: string;
}

export function DatePickerField({ control, name, label }: DatePickerProps) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className="flex flex-col">
          <FormLabel>{label}</FormLabel>
          <Popover>
            <PopoverTrigger asChild>
              <FormControl>
                <Button
                  variant={"outline"}
                  className={cn(
                    "w-full pl-3 text-left font-normal",
                    !field.value && "text-muted-foreground"
                  )}
                >
                  {/* 类型保护：确保是 Date 对象或者是 undefined */}
                  {field.value instanceof Date ? (
                    format(field.value, "yyyy-MM-dd")
                  ) : (
                    <span>选择日期</span>
                  )}
                  <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                </Button>
              </FormControl>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={field.value instanceof Date ? field.value : undefined}
                onSelect={field.onChange}
                disabled={(date) => date < new Date("1900-01-01")}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
