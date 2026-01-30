"use client";

import { useFormContext } from "react-hook-form";
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { getFileUrl } from "@/lib/config";
import { FormValues } from "../schema";
import { Consultant } from "../../types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Image as ImageIcon, UploadCloud } from "lucide-react";

interface RightColumnProps {
  consultants: Consultant[];
}

export function RightColumn({ consultants }: RightColumnProps) {
  const form = useFormContext<FormValues>();

  return (
    <div className="space-y-6">
      <Card className="py-0 gap-0">
        <CardHeader className="border-b py-4">
          <CardTitle className="text-sm">基础配置</CardTitle>
        </CardHeader>
        <CardContent className="py-6 space-y-6">
          <FormField
            control={form.control}
            name="cover_image"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium">
                  项目封面图
                </FormLabel>
                <div className="relative group rounded-lg aspect-3/2 border overflow-hidden bg-muted/20">
                  {field.value ? (
                    <div
                      className="absolute inset-0 bg-cover bg-center"
                      style={{
                        backgroundImage: `url(${getFileUrl(field.value)})`,
                      }}
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                      <ImageIcon className="size-10 opacity-70" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        const url = prompt("请输入封面图 URL");
                        if (url) field.onChange(url);
                      }}
                    >
                      <UploadCloud />
                      更换封面
                    </Button>
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  建议尺寸：1200×800px
                </p>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="pt-6 border-t">
            <FormField
              control={form.control}
              name="consultant_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">
                    关联顾问
                  </FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value || undefined}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="选择顾问" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">无顾问</SelectItem>
                      {consultants.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name} - {c.role || "顾问"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
