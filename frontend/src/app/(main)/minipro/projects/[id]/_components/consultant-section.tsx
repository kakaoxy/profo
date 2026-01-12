"use client";

import { UseFormReturn } from "react-hook-form";
import { 
  FormField, 
  FormItem, 
  FormLabel, 
  FormControl, 
  FormMessage 
} from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Consultant } from "@/app/(main)/minipro/projects/types";
import { FormValues } from "./schema";

export function ConsultantSection({ 
  form, 
  consultants 
}: { 
  form: UseFormReturn<FormValues>, 
  consultants: Consultant[] 
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>置业顾问</CardTitle>
      </CardHeader>
      <CardContent>
        <FormField
          control={form.control}
          name="consultant_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>负责顾问</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value || undefined} value={field.value || undefined}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="选择一位置业顾问" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="none">暂不分配</SelectItem>
                  {consultants.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} ({c.phone})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      </CardContent>
    </Card>
  );
}
