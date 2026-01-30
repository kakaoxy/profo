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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormValues } from "../schema";
import { ShareConfigSection } from "./share-config-section";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Megaphone, X } from "lucide-react";

interface MarketingInfoSectionProps {
  tagInput: string;
  onTagInputChange: (value: string) => void;
  onAddTag: (e: React.KeyboardEvent) => void;
  onRemoveTag: (tag: string) => void;
}

export function MarketingInfoSection({
  tagInput,
  onTagInputChange,
  onAddTag,
  onRemoveTag,
}: MarketingInfoSectionProps) {
  const form = useFormContext<FormValues>();

  return (
    <Card className="py-0 gap-0">
      <CardHeader className="border-b py-4">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Megaphone className="size-4 text-primary" />
          营销信息
        </CardTitle>
      </CardHeader>
      <CardContent className="py-6 space-y-5">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-medium">营销标题</FormLabel>
              <FormControl>
                <Input
                  placeholder="例如：徐汇核心区，尊享园林景观生活"
                  {...field}
                  value={field.value || ""}
                />
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
                <FormLabel className="text-sm font-medium">物业风格</FormLabel>
                <FormControl>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value || undefined}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="选择风格" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="现代奢华">现代奢华</SelectItem>
                      <SelectItem value="欧式经典">欧式经典</SelectItem>
                      <SelectItem value="简约禅意">简约禅意</SelectItem>
                      <SelectItem value="新中式">新中式</SelectItem>
                    </SelectContent>
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="sort_order"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium">排序权重</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    {...field}
                    onChange={(e) =>
                      field.onChange(parseInt(e.target.value) || 0)
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="marketing_tags"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-medium">营销标签</FormLabel>
              <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/20 p-2">
                {field.value?.map((tag: string) => (
                  <Badge key={tag} variant="secondary" className="pr-1.5">
                    {tag}
                    <button
                      type="button"
                      className="ml-1 inline-flex size-4 items-center justify-center rounded-sm hover:bg-muted"
                      onClick={() => onRemoveTag(tag)}
                      aria-label={`移除标签 ${tag}`}
                    >
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))}
                <input
                  className="h-7 flex-1 min-w-[140px] bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
                  placeholder="添加标签，回车确认"
                  value={tagInput}
                  onChange={(e) => onTagInputChange(e.target.value)}
                  onKeyDown={onAddTag}
                />
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-medium">项目描述</FormLabel>
              <FormControl>
                <Textarea
                  rows={4}
                  placeholder="描述项目特色..."
                  {...field}
                  value={field.value || ""}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <ShareConfigSection />
      </CardContent>
    </Card>
  );
}
