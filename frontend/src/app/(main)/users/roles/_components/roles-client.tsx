"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { RoleTable } from "./role-table";
import { RoleDialog } from "./role-dialog";
import type { RoleListResponse, RoleResponse } from "@/app/(main)/users/actions";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

interface RolesClientProps {
  initialData: RoleListResponse;
}

export function RolesClient({ initialData }: RolesClientProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleResponse | null>(null);
  
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Search state
  const [searchName, setSearchName] = useState(searchParams.get("name") || "");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams);
    if (searchName) {
      params.set("name", searchName);
    } else {
      params.delete("name");
    }
    params.set("page", "1"); // Reset to page 1
    router.replace(`${pathname}?${params.toString()}`);
  };

  const handleCreate = () => {
    setEditingRole(null);
    setDialogOpen(true);
  };

  const handleEdit = (role: RoleResponse) => {
    setEditingRole(role);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <form onSubmit={handleSearch} className="flex items-center gap-2">
          <Input
            placeholder="搜索角色名称..."
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            className="w-[200px] lg:w-[300px]"
          />
          <Button type="submit" variant="secondary">搜索</Button>
        </form>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" />
          新建角色
        </Button>
      </div>

      <RoleTable data={initialData.items} onEdit={handleEdit} />

      <RoleDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditingRole(null);
        }}
        role={editingRole}
      />
    </div>
  );
}
