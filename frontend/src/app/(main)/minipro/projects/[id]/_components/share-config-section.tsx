"use client";

import { useFormContext } from "react-hook-form";
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getFileUrl } from "@/lib/config";
import { FormValues } from "../schema";
import { Share2 } from "lucide-react";

export function ShareConfigSection() {
  const form = useFormContext<FormValues>();

  return (
    <div className="pt-5 border-t">
      <div className="flex items-center gap-2 mb-4">
        <Share2 className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold tracking-tight">分享配置</h3>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="share_title"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-medium">分享标题</FormLabel>
              <FormControl>
                <Input {...field} value={field.value || ""} />
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
              <FormLabel className="text-sm font-medium">分享图</FormLabel>
              <div className="flex items-center gap-3">
                <div
                  className="w-12 h-12 rounded-md bg-muted border bg-cover bg-center shrink-0"
                  style={{
                    backgroundImage: field.value
                      ? `url(${getFileUrl(field.value)})`
                      : "none",
                  }}
                />
                <FormControl>
                  <Input
                    className="hidden"
                    {...field}
                    value={field.value || ""}
                  />
                </FormControl>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const url = prompt("请输入分享图 URL");
                    if (url) field.onChange(url);
                  }}
                >
                  上传图片
                </Button>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  );
}
