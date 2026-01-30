"use client";

import { useFormContext } from "react-hook-form";
import { FormField, FormItem, FormControl } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { FormValues } from "../schema";
import { MiniProject } from "../../types";
import { ArrowLeft, Eye } from "lucide-react";

interface FormHeaderProps {
  project: MiniProject;
  onSaveDraft: () => void;
  onGoBack: () => void;
}

export function FormHeader({
  project,
  onSaveDraft,
  onGoBack,
}: FormHeaderProps) {
  const form = useFormContext<FormValues>();

  return (
    <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur supports-backdrop-filter:bg-background/60">
      <div className="w-full max-w-[1600px] mx-auto flex items-center justify-between gap-4 px-4 sm:px-6 lg:px-8 h-14">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onGoBack}
            aria-label="返回"
          >
            <ArrowLeft />
          </Button>
          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-semibold tracking-tight text-foreground">
              编辑小程序项目
            </h1>
            <p className="text-xs text-muted-foreground truncate">
              {project.title || `ID: ${project.id}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-1.5 text-sm text-muted-foreground">
            <Eye className="size-4" />
            <span>浏览量 {project.view_count || 0}</span>
          </div>
          <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              发布
            </span>
            <FormField
              control={form.control}
              name="is_published"
              render={({ field }) => (
                <FormItem className="flex items-center space-y-0">
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
          <Button type="button" variant="outline" onClick={onSaveDraft}>
            保存草稿
          </Button>
          <Button type="submit">发布更改</Button>
        </div>
      </div>
    </header>
  );
}
