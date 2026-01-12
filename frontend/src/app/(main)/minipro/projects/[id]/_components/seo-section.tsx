"use client";

import { UseFormReturn } from "react-hook-form";
import { 
  FormField, 
  FormItem, 
  FormLabel, 
  FormControl, 
  FormMessage 
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getFileUrl } from "@/lib/config";
import { FormValues } from "./schema";

export function SEOSection({ form }: { form: UseFormReturn<FormValues> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>SEO 与分享</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <FormField
          control={form.control}
          name="share_title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>分享标题</FormLabel>
              <FormControl>
                <Input placeholder="微信分享时显示的标题" {...field} value={field.value || ""} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="share_image"
          render={({ field }) => (
            <FormItem>
              <FormLabel>分享图片 URL</FormLabel>
              <div className="flex gap-2">
                <FormControl>
                  <Input placeholder="建议 5:4 比例图片" {...field} value={field.value || ""} />
                </FormControl>
                {field.value && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={getFileUrl(field.value)} alt="share" className="h-10 w-16 object-cover rounded bg-slate-100" />
                )}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
      </CardContent>
    </Card>
  );
}
