"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import Link from "next/link";

import type { Consultant, MiniProject, MiniProjectPhoto } from "../types";
import type { MiniProjectCreate, MiniProjectUpdate } from "../types";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { createMiniProjectAction, updateMiniProjectAction } from "../actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { getFileUrl } from "@/lib/config";
import { PhotoManager } from "../[id]/_components/photo-manager";

export type MiniProjectFormMode = "create" | "edit" | "view";

export interface MiniProjectFormActions {
  createMiniProject: (
    body: MiniProjectCreate,
  ) => Promise<{ success: boolean; data?: MiniProject; error?: string }>;
  updateMiniProject: (
    id: string,
    body: MiniProjectUpdate,
  ) => Promise<{ success: boolean; data?: MiniProject; error?: string }>;
}

export interface MiniProjectFormProps {
  mode: MiniProjectFormMode;
  consultants: Consultant[];
  initialProject?: MiniProject;
  initialPhotos?: MiniProjectPhoto[];
  actions?: MiniProjectFormActions;
}

const imagePathSchema = z
  .string()
  .trim()
  .min(1, "图片地址不能为空")
  .refine(
    (val) =>
      val.startsWith("http://") ||
      val.startsWith("https://") ||
      val.startsWith("/"),
    "请输入 http(s) URL 或以 / 开头的路径",
  );

const tagsSchema = z
  .array(z.string().trim().min(1, "标签不能为空"))
  .max(20, "最多 20 个标签")
  .superRefine((tags, ctx) => {
    const seen = new Set<string>();
    for (const tag of tags) {
      const key = tag.toLowerCase();
      if (seen.has(key)) {
        ctx.addIssue({ code: "custom", message: "标签不能重复" });
        break;
      }
      seen.add(key);
    }
  });

const createSchema = z.object({
  title: z.string().trim().min(1, "标题必填"),
  cover_image: imagePathSchema.nullable(),
  style: z.string().trim().min(1, "风格不能为空").nullable(),
  description: z.string().trim().min(1, "描述不能为空").nullable(),
  marketing_tags: tagsSchema,
  share_title: z.string().trim().min(1, "分享标题不能为空").nullable(),
  share_image: imagePathSchema.nullable(),
  consultant_id: z.string().trim().min(1, "顾问不能为空").nullable(),
  sort_order: z.number().int().min(0, "排序权重不能小于 0"),
  is_published: z.boolean(),
});

const updateSchema = z.object({
  title: z.string().trim().min(1, "标题必填").optional(),
  cover_image: imagePathSchema.nullable().optional(),
  style: z.string().trim().min(1, "风格不能为空").nullable().optional(),
  description: z.string().trim().min(1, "描述不能为空").nullable().optional(),
  marketing_tags: tagsSchema.optional(),
  share_title: z
    .string()
    .trim()
    .min(1, "分享标题不能为空")
    .nullable()
    .optional(),
  share_image: imagePathSchema.nullable().optional(),
  consultant_id: z.string().trim().min(1, "顾问不能为空").nullable().optional(),
  sort_order: z.number().int().min(0, "排序权重不能小于 0").optional(),
  is_published: z.boolean().optional(),
});

type CreateValues = z.infer<typeof createSchema>;
type UpdateValues = z.infer<typeof updateSchema>;

function DisplayRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-1">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="text-sm text-foreground">{value}</div>
    </div>
  );
}

export function MiniProjectForm({
  mode,
  consultants,
  initialProject,
  initialPhotos = [],
  actions,
}: MiniProjectFormProps) {
  const router = useRouter();
  const resolvedActions: MiniProjectFormActions = actions ?? {
    createMiniProject: createMiniProjectAction,
    updateMiniProject: updateMiniProjectAction,
  };

  const consultantName =
    initialProject?.consultant?.name ??
    consultants.find((c) => c.id === initialProject?.consultant_id)?.name ??
    "-";

  const viewNode = (
    <div className="w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm text-muted-foreground">小程序项目详情</div>
          <div className="text-xl font-semibold text-foreground truncate">
            {initialProject?.title ?? "-"}
          </div>
        </div>
        {initialProject ? (
          <Button asChild>
            <Link href={`/minipro/projects/${initialProject.id}/edit`}>
              编辑
            </Link>
          </Button>
        ) : null}
      </div>

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-7 space-y-6">
          <Card className="py-0 gap-0">
            <CardHeader className="border-b py-4">
              <CardTitle className="text-sm">营销信息</CardTitle>
            </CardHeader>
            <CardContent className="py-6 space-y-4">
              <DisplayRow
                label="营销标题"
                value={initialProject?.title ?? "-"}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <DisplayRow
                  label="物业风格"
                  value={initialProject?.style ?? "-"}
                />
                <DisplayRow
                  label="排序权重"
                  value={initialProject?.sort_order ?? 0}
                />
              </div>
              <DisplayRow
                label="营销标签"
                value={
                  Array.isArray(initialProject?.marketing_tags) &&
                  initialProject?.marketing_tags.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {initialProject.marketing_tags.map((tag) => (
                        <Badge key={tag} variant="secondary">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    "-"
                  )
                }
              />
              <DisplayRow
                label="项目描述"
                value={
                  initialProject?.description ? (
                    <div className="whitespace-pre-wrap">
                      {initialProject.description}
                    </div>
                  ) : (
                    "-"
                  )
                }
              />

              <div className="pt-4 border-t">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <DisplayRow
                    label="分享标题"
                    value={initialProject?.share_title ?? "-"}
                  />
                  <DisplayRow
                    label="分享图"
                    value={
                      initialProject?.share_image ? (
                        <a
                          href={getFileUrl(initialProject.share_image)}
                          className="underline underline-offset-2"
                          target="_blank"
                          rel="noreferrer"
                        >
                          查看
                        </a>
                      ) : (
                        "-"
                      )
                    }
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="py-0 gap-0">
            <CardHeader className="border-b py-4">
              <CardTitle className="text-sm">物理信息（只读）</CardTitle>
            </CardHeader>
            <CardContent className="py-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <DisplayRow
                  label="关联主项目ID"
                  value={initialProject?.project_id ?? "-"}
                />
                <DisplayRow
                  label="物业地址"
                  value={initialProject?.address ?? "-"}
                />
                <DisplayRow label="面积" value={initialProject?.area ?? "-"} />
                <DisplayRow
                  label="预估售价"
                  value={initialProject?.price ?? "-"}
                />
                <DisplayRow
                  label="户型"
                  value={initialProject?.layout ?? "-"}
                />
                <DisplayRow
                  label="朝向"
                  value={initialProject?.orientation ?? "-"}
                />
                <DisplayRow
                  label="楼层信息"
                  value={initialProject?.floor_info ?? "-"}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="col-span-12 lg:col-span-5 space-y-6">
          <Card className="py-0 gap-0">
            <CardHeader className="border-b py-4">
              <CardTitle className="text-sm">基础配置</CardTitle>
            </CardHeader>
            <CardContent className="py-6 space-y-4">
              <DisplayRow
                label="封面图"
                value={
                  initialProject?.cover_image ? (
                    <a
                      href={getFileUrl(initialProject.cover_image)}
                      className="underline underline-offset-2"
                      target="_blank"
                      rel="noreferrer"
                    >
                      查看
                    </a>
                  ) : (
                    "-"
                  )
                }
              />
              <DisplayRow label="顾问" value={consultantName} />
              <DisplayRow
                label="发布状态"
                value={initialProject?.is_published ? "已发布" : "未发布"}
              />
              <DisplayRow
                label="浏览量"
                value={initialProject?.view_count ?? 0}
              />
              <DisplayRow
                label="发布时间"
                value={initialProject?.published_at ?? "-"}
              />
              <DisplayRow
                label="创建时间"
                value={initialProject?.created_at ?? "-"}
              />
              <DisplayRow
                label="更新时间"
                value={initialProject?.updated_at ?? "-"}
              />
            </CardContent>
          </Card>

          <Card className="py-0 gap-0">
            <CardHeader className="border-b py-4">
              <CardTitle className="text-sm">照片</CardTitle>
            </CardHeader>
            <CardContent className="py-6 space-y-4">
              {initialPhotos.length === 0 ? (
                <div className="text-sm text-muted-foreground">暂无照片</div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {initialPhotos
                    .slice()
                    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                    .map((p) => {
                      const url = p.final_url || p.image_url;
                      return (
                        <div
                          key={p.id}
                          className="relative aspect-square rounded-md border bg-muted overflow-hidden"
                        >
                          <div
                            className="absolute inset-0 bg-cover bg-center"
                            style={{
                              backgroundImage: url
                                ? `url(${getFileUrl(url)})`
                                : "none",
                            }}
                          />
                          <div className="absolute bottom-1 left-1 right-1 flex items-center justify-between gap-2">
                            <Badge variant="secondary" className="text-[10px]">
                              {(p.renovation_stage || "other").slice(0, 8)}
                            </Badge>
                            <Badge variant="secondary" className="text-[10px]">
                              #{(p.sort_order ?? 0) + 1}
                            </Badge>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
              <div className="text-xs text-muted-foreground">
                如需管理照片（同步/删除/上传），请进入编辑页。
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );

  const isCreate = mode === "create";
  const [tagInput, setTagInput] = React.useState("");
  const [photos, setPhotos] = React.useState<MiniProjectPhoto[]>(initialPhotos);

  const form = useForm<CreateValues | UpdateValues>({
    resolver: zodResolver(isCreate ? createSchema : updateSchema),
    defaultValues: {
      title: initialProject?.title ?? "",
      cover_image: initialProject?.cover_image ?? null,
      style: initialProject?.style ?? null,
      description: initialProject?.description ?? null,
      marketing_tags: Array.isArray(initialProject?.marketing_tags)
        ? initialProject?.marketing_tags
        : [],
      share_title: initialProject?.share_title ?? null,
      share_image: initialProject?.share_image ?? null,
      consultant_id: initialProject?.consultant_id ?? null,
      sort_order: initialProject?.sort_order ?? 0,
      is_published: initialProject?.is_published ?? false,
    },
  });
  const dirtyFields = form.formState.dirtyFields;
  const isSubmitting = form.formState.isSubmitting;

  const handleAddTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" && e.key !== ",") return;
    e.preventDefault();
    const val = tagInput.trim().replace(/,$/, "");
    const current = (form.getValues("marketing_tags") as string[]) ?? [];
    if (!val) return;
    if (!current.includes(val)) {
      form.setValue("marketing_tags", [...current, val], { shouldDirty: true });
    }
    setTagInput("");
  };

  const handleRemoveTag = (tag: string) => {
    const current = (form.getValues("marketing_tags") as string[]) ?? [];
    form.setValue(
      "marketing_tags",
      current.filter((t) => t !== tag),
      { shouldDirty: true },
    );
  };

  const handleSubmit = async (values: CreateValues | UpdateValues) => {
    try {
      if (mode === "create") {
        const createValues = values as CreateValues;
        // 后端 Create schema 不包含 is_published/sort_order，因此创建时先剥离；
        // 创建成功后如有需要再用 Update 进行二次写回，保证字段与后端契约严格对齐。
        const { is_published, sort_order, ...rest } = createValues;
        const createBody: MiniProjectCreate = rest;

        const result = await resolvedActions.createMiniProject(createBody);
        if (result.success && result.data?.id) {
          if (is_published !== false || sort_order !== 0) {
            await resolvedActions.updateMiniProject(result.data.id, {
              is_published,
              sort_order,
            });
          }

          toast.success("项目创建成功");
          router.replace(`/minipro/projects/${result.data.id}/edit`);
          return;
        }
        toast.error(result.error || "创建失败");
        return;
      }

      if (!initialProject) return;

      // Update 走“部分更新”：仅提交本次用户确实修改过的字段，避免无意覆盖后端默认值/旧值。
      const dirty = dirtyFields as Partial<Record<keyof UpdateValues, boolean>>;
      const allValues = values as UpdateValues;
      const patch: Partial<MiniProjectUpdate> = {};

      (Object.keys(dirty) as (keyof UpdateValues)[]).forEach((key) => {
        if (!dirty[key]) return;
        patch[key] = allValues[key] as never;
      });

      if (Object.keys(patch).length === 0) {
        toast("没有需要保存的变更");
        return;
      }

      const result = await resolvedActions.updateMiniProject(
        initialProject.id,
        patch as MiniProjectUpdate,
      );
      if (result.success) {
        toast.success("项目更新成功");
        router.refresh();
        return;
      }
      toast.error(result.error || "更新失败");
    } catch {
      toast.error(mode === "create" ? "创建失败" : "更新失败");
    }
  };

  const editorNode = (
    <div className="w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm text-muted-foreground">
            {mode === "create" ? "新建独立小程序项目" : "编辑小程序项目"}
          </div>
          <div className="text-xl font-semibold text-foreground truncate">
            {mode === "create" ? "未命名项目" : (initialProject?.title ?? "-")}
          </div>
        </div>
        {mode === "edit" && initialProject ? (
          <Button variant="outline" asChild>
            <Link href={`/minipro/projects/${initialProject.id}`}>
              查看详情
            </Link>
          </Button>
        ) : null}
      </div>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
          <div className="grid grid-cols-12 gap-6">
            <div className="col-span-12 lg:col-span-7 space-y-6">
              <Card className="py-0 gap-0">
                <CardHeader className="border-b py-4">
                  <CardTitle className="text-sm">营销信息</CardTitle>
                </CardHeader>
                <CardContent className="py-6 space-y-5">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium">
                          营销标题
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder="例如：徐汇核心区，尊享园林景观生活"
                            {...field}
                            value={String(field.value ?? "")}
                            onChange={(e) => field.onChange(e.target.value)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="style"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium">
                            物业风格
                          </FormLabel>
                          <FormControl>
                            <Input
                              placeholder="例如：现代简约"
                              value={String(field.value ?? "")}
                              onChange={(e) =>
                                field.onChange(
                                  e.target.value ? e.target.value : null,
                                )
                              }
                            />
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
                          <FormLabel className="text-sm font-medium">
                            排序权重
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              value={String(field.value ?? 0)}
                              onChange={(e) => {
                                const next =
                                  e.target.value === ""
                                    ? 0
                                    : Number(e.target.value);
                                field.onChange(
                                  Number.isFinite(next) ? next : 0,
                                );
                              }}
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
                        <FormLabel className="text-sm font-medium">
                          营销标签
                        </FormLabel>
                        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/20 p-2">
                          {(field.value as string[])?.map((tag) => (
                            <Badge
                              key={tag}
                              variant="secondary"
                              className="pr-1.5"
                            >
                              {tag}
                              <button
                                type="button"
                                className="ml-1 inline-flex size-4 items-center justify-center rounded-sm hover:bg-muted"
                                onClick={() => handleRemoveTag(tag)}
                                aria-label={`移除标签 ${tag}`}
                              >
                                ×
                              </button>
                            </Badge>
                          ))}
                          <input
                            className="h-7 flex-1 min-w-[140px] bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
                            placeholder="添加标签，回车确认"
                            value={tagInput}
                            onChange={(e) => setTagInput(e.target.value)}
                            onKeyDown={handleAddTag}
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
                        <FormLabel className="text-sm font-medium">
                          项目描述
                        </FormLabel>
                        <FormControl>
                          <Textarea
                            rows={4}
                            placeholder="描述项目特色..."
                            value={String(field.value ?? "")}
                            onChange={(e) =>
                              field.onChange(
                                e.target.value ? e.target.value : null,
                              )
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="pt-5 border-t">
                    <h3 className="text-sm font-semibold tracking-tight mb-4">
                      分享配置
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="share_title"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-medium">
                              分享标题
                            </FormLabel>
                            <FormControl>
                              <Input
                                value={String(field.value ?? "")}
                                onChange={(e) =>
                                  field.onChange(
                                    e.target.value ? e.target.value : null,
                                  )
                                }
                              />
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
                            <FormLabel className="text-sm font-medium">
                              分享图
                            </FormLabel>
                            <div className="flex items-center gap-3">
                              <div
                                className="w-12 h-12 rounded-md bg-muted border bg-cover bg-center shrink-0"
                                style={{
                                  backgroundImage: field.value
                                    ? `url(${getFileUrl(String(field.value))})`
                                    : "none",
                                }}
                              />
                              <FormControl>
                                <Input
                                  placeholder="http(s):// 或 /path"
                                  value={String(field.value ?? "")}
                                  onChange={(e) =>
                                    field.onChange(
                                      e.target.value ? e.target.value : null,
                                    )
                                  }
                                />
                              </FormControl>
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {mode === "edit" ? (
                <Card className="py-0 gap-0">
                  <CardHeader className="border-b py-4">
                    <CardTitle className="text-sm">物理信息（只读）</CardTitle>
                  </CardHeader>
                  <CardContent className="py-6 space-y-4 text-sm text-muted-foreground">
                    物理信息来自主项目同步（刷新后覆盖），详情请查看只读详情页。
                  </CardContent>
                </Card>
              ) : null}
            </div>

            <div className="col-span-12 lg:col-span-5 space-y-6">
              <Card className="py-0 gap-0">
                <CardHeader className="border-b py-4">
                  <CardTitle className="text-sm">基础配置</CardTitle>
                </CardHeader>
                <CardContent className="py-6 space-y-5">
                  <FormField
                    control={form.control}
                    name="cover_image"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium">
                          封面图
                        </FormLabel>
                        <div className="flex items-center gap-3">
                          <div
                            className="w-12 h-12 rounded-md bg-muted border bg-cover bg-center shrink-0"
                            style={{
                              backgroundImage: field.value
                                ? `url(${getFileUrl(String(field.value))})`
                                : "none",
                            }}
                          />
                          <FormControl>
                            <Input
                              placeholder="http(s):// 或 /path"
                              value={String(field.value ?? "")}
                              onChange={(e) =>
                                field.onChange(
                                  e.target.value ? e.target.value : null,
                                )
                              }
                            />
                          </FormControl>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="consultant_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium">
                          顾问
                        </FormLabel>
                        <FormControl>
                          <Select
                            value={field.value ? String(field.value) : "none"}
                            onValueChange={(val) =>
                              field.onChange(val === "none" ? null : val)
                            }
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="选择顾问" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">不指定</SelectItem>
                              {consultants.map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                  {c.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="is_published"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between gap-4 rounded-md border bg-muted/20 px-3 py-2">
                        <div className="grid gap-0.5">
                          <div className="text-sm font-medium text-foreground">
                            发布
                          </div>
                          <div className="text-xs text-muted-foreground">
                            关闭则为草稿状态
                          </div>
                        </div>
                        <FormControl>
                          <Switch
                            aria-label="发布"
                            checked={Boolean(field.value)}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              {mode === "edit" && initialProject ? (
                <PhotoManager
                  projectId={initialProject.id}
                  photos={photos}
                  onPhotosChange={setPhotos}
                />
              ) : (
                <Card className="py-0 gap-0">
                  <CardHeader className="border-b py-4">
                    <CardTitle className="text-sm">照片</CardTitle>
                  </CardHeader>
                  <CardContent className="py-6 text-sm text-muted-foreground">
                    创建完成后可在编辑页管理照片。
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? mode === "create"
                  ? "创建中..."
                  : "保存中..."
                : mode === "create"
                  ? "创建项目"
                  : "保存更改"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );

  return mode === "view" ? viewNode : editorNode;
}
