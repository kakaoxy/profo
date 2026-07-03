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
          <FormLabel className="text-[14px] font-medium text-foreground tracking-tight">
            {label}
          </FormLabel>
          <Popover>
            <PopoverTrigger asChild>
              <FormControl>
                <Button
                  variant={"outline"}
                  className={cn(
                    "w-full pl-3 text-left font-normal rounded-inputs h-10 border-dove/50 bg-pure-white text-[14px] hover:bg-fog/50 focus-visible:border-ink/30 focus-visible:ring-ink/10",
                    !field.value && "text-dove"
                  )}
                >
                  {field.value instanceof Date ? (
                    format(field.value, "yyyy-MM-dd")
                  ) : (
                    <span>选择日期</span>
                  )}
                  <CalendarIcon className="ml-auto h-4 w-4 opacity-40" />
                </Button>
              </FormControl>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 rounded-cards border-dove/40" align="start">
              <Calendar
                mode="single"
                selected={field.value instanceof Date ? field.value : undefined}
                onSelect={(date) => field.onChange(date ?? undefined)}
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
