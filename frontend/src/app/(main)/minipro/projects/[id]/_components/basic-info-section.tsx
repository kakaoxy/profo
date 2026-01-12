"use client";

import { useState } from "react";
import { UseFormReturn } from "react-hook-form";
import { 
  FormField, 
  FormItem, 
  FormLabel, 
  FormControl, 
  FormMessage 
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getFileUrl } from "@/lib/config";
import { FormValues } from "./schema";

export function BasicInfoSection({ form }: { form: UseFormReturn<FormValues> }) {
  const [tagInput, setTagInput] = useState("");

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const val = tagInput.trim().replace(/,$/, "");
      const currentTags = form.getValues("marketing_tags") || [];
      if (val && !currentTags.includes(val)) {
        form.setValue("marketing_tags", [...currentTags, val], { shouldDirty: true });
      }
      setTagInput("");
    }
  };

  const removeTag = (tag: string) => {
    const currentTags = form.getValues("marketing_tags") || [];
    form.setValue("marketing_tags", currentTags.filter(t => t !== tag), { shouldDirty: true });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>基本信息</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>营销标题</FormLabel>
              <FormControl>
                <Input placeholder="例如：现代简约风优质三居" {...field} value={field.value || ""} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="style"
            render={({ field }) => (
              <FormItem>
                <FormLabel>装修风格</FormLabel>
                <FormControl>
                  <Input placeholder="例如：现代、中式" {...field} value={field.value || ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="cover_image"
            render={({ field }) => (
              <FormItem>
                <FormLabel>封面图片 URL</FormLabel>
                <div className="flex gap-2">
                  <FormControl>
                    <Input placeholder="/static/uploads/..." {...field} value={field.value || ""} />
                  </FormControl>
                  {field.value && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={getFileUrl(field.value)} alt="cover" className="h-10 w-16 object-cover rounded bg-slate-100" />
                  )}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>项目描述</FormLabel>
              <FormControl>
                <Textarea className="h-24" placeholder="向客户展示的详细介绍" {...field} value={field.value || ""} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="marketing_tags"
          render={({ field }) => (
            <FormItem>
              <FormLabel>营销标签</FormLabel>
              <div className="space-y-2">
                <Input 
                  placeholder="按回车或逗号添加" 
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleAddTag}
                />
                <div className="flex flex-wrap gap-2">
                  {field.value?.map((tag: string) => (
                    <Badge key={tag} variant="secondary" className="gap-1">
                      {tag}
                      <button type="button" onClick={() => removeTag(tag)} className="hover:text-destructive">×</button>
                    </Badge>
                  ))}
                </div>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
      </CardContent>
    </Card>
  );
}
