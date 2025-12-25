"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { UserTable } from "./user-table";
import { UserDialog } from "./user-dialog";
import { ResetPasswordDialog } from "./reset-password-dialog";
import type { UserListResponse, UserResponse, RoleResponse } from "../actions";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

interface UsersClientProps {
  initialData: UserListResponse;
  roles: RoleResponse[];
}

export function UsersClient({ initialData, roles }: UsersClientProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserResponse | null>(null);
  
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Search state
  const [searchQuery, setSearchQuery] = useState(searchParams.get("username") || searchParams.get("nickname") || "");
  const [roleFilter, setRoleFilter] = useState(searchParams.get("role_id") || "all");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams);
    
    // Simple logic: if query matches username or nickname
    // actually API supports username OR nickname. 
    // For simplicity, let's just search 'username' for now or 'nickname' if user typed chinese?
    // Let's just set 'username' parameter for now, or maybe 'nickname'.
    // Or we can add a selector.
    // Let's assume standard behavior: text search hits both if backend supported "q", but backend has distinct fields.
    // I'll set 'nickname' if it looks like a name, or 'username' otherwise, or just set 'username' as primary search.
    // Actually backend router logic: `username: Optional[str]`, `nickname: Optional[str]`. 
    // I'll just use 'nickname' for search input for now as it's more human friendly, or create a combined search?
    // Let's use 'username' for now as it is unique ID.
    if (searchQuery) {
        params.set("username", searchQuery); // Search by username primarily
    } else {
        params.delete("username");
    }

    if (roleFilter && roleFilter !== "all") {
      params.set("role_id", roleFilter);
    } else {
      params.delete("role_id");
    }

    params.set("page", "1");
    router.replace(`${pathname}?${params.toString()}`);
  };

  const handleRoleChange = (value: string) => {
    setRoleFilter(value);
    // Auto submit
    const params = new URLSearchParams(searchParams);
    if (value && value !== "all") {
        params.set("role_id", value);
    } else {
        params.delete("role_id");
    }
    params.set("page", "1");
    router.replace(`${pathname}?${params.toString()}`);
  }

  const handleCreate = () => {
    setEditingUser(null);
    setDialogOpen(true);
  };

  const handleEdit = (user: UserResponse) => {
    setEditingUser(user);
    setDialogOpen(true);
  };

  const handleResetPassword = (user: UserResponse) => {
    setEditingUser(user);
    setResetDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
            <form onSubmit={handleSearch} className="flex items-center gap-2">
            <Input
                placeholder="搜索用户名..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-[200px]"
            />
            </form>
            <Select value={roleFilter} onValueChange={handleRoleChange}>
                <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="所有角色" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">所有角色</SelectItem>
                    {roles.map(role => (
                        <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <Button variant="secondary" onClick={handleSearch}>搜索</Button>
        </div>
        
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" />
          新建用户
        </Button>
      </div>

      <UserTable 
        data={initialData.items} 
        onEdit={handleEdit} 
        onResetPassword={handleResetPassword}
      />

      <UserDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditingUser(null);
        }}
        user={editingUser}
        roles={roles}
      />

      <ResetPasswordDialog
        open={resetDialogOpen}
        onOpenChange={(open) => {
            setResetDialogOpen(open);
            if (!open) setEditingUser(null);
        }}
        user={editingUser}
      />
    </div>
  );
}
