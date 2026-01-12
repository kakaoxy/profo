import * as z from "zod";

export const formSchema = z.object({
  title: z.string().min(1, "标题必填"),
  cover_image: z.string().nullable(),
  style: z.string().nullable(),
  description: z.string().nullable(),
  marketing_tags: z.array(z.string()),
  share_title: z.string().nullable(),
  share_image: z.string().nullable(),
  consultant_id: z.string().nullable(),
  is_published: z.boolean(),
  sort_order: z.number(),
});

export type FormValues = z.infer<typeof formSchema>;
