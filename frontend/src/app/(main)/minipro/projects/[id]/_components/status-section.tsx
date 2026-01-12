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
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { FormValues } from "./schema";

export function StatusSection({ form }: { form: UseFormReturn<FormValues> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>状态控制</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between border p-4 rounded-lg">
          <div className="space-y-0.5">
            <div className="text-sm font-medium">对外发布</div>
            <div className="text-xs text-muted-foreground">发布后将在小程序中可见</div>
          </div>
          <FormField
            control={form.control}
            name="is_published"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Switch checked={!!field.value} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="sort_order"
          render={({ field }) => (
            <FormItem>
              <FormLabel>排序权重 (越大越靠前)</FormLabel>
              <FormControl>
                <Input 
                  type="number" 
                  {...field} 
                  value={field.value ?? 0} 
                  onChange={e => field.onChange(parseInt(e.target.value) || 0)} 
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </CardContent>
    </Card>
  );
}
