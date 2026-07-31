"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DOCUMENT_CATEGORIES,
  type DocumentCategory,
} from "../../../constants";

interface DocumentCreateFormProps {
  name: string;
  category: DocumentCategory;
  onNameChange: (value: string) => void;
  onCategoryChange: (value: DocumentCategory) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

/**
 * 新增文书表单：文书名称 Input + 分类 Select + 取消/新增按钮。
 * 在空状态与顶部内联折叠两处复用。
 */
export function DocumentCreateForm({
  name,
  category,
  onNameChange,
  onCategoryChange,
  onSubmit,
  onCancel,
}: DocumentCreateFormProps) {
  return (
    <>
      <Label>文书名称</Label>
      <div className="flex gap-2">
        <Input
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="如：补充协议"
          autoFocus
          className="flex-1"
        />
        <Select
          value={category}
          onValueChange={(v) => onCategoryChange(v as DocumentCategory)}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="选择分类" />
          </SelectTrigger>
          <SelectContent>
            {DOCUMENT_CATEGORIES.map((cat) => (
              <SelectItem key={cat.value} value={cat.value}>
                {cat.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          取消
        </Button>
        <Button type="button" size="sm" onClick={onSubmit}>
          新增
        </Button>
      </div>
    </>
  );
}
