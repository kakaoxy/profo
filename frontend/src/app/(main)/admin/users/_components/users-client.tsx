"use client";

import { useState } from "react";
import {
  Plus,
  Search,
  Users,
  UserCircle,
  Shield,
  X,
} from "lucide-react";

import "./users-redesign.css";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HasPermission } from "@/components/has-permission";
import { Pagination } from "@/components/common";
import { PERMISSION_CODES } from "@/lib/auth/permissions";

import { UserTable } from "./user-table";
import { UserDialog } from "./user-dialog";
import { ResetPasswordDialog } from "./reset-password-dialog";
import { UsersStatCards } from "./users-stat-cards";
import type { UserListResponse, UserResponse, RoleResponse } from "../actions/index";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

// 客户端分页每页条数（后端一次性拉取全量，前端按 tab 过滤后切片）
const CLIENT_PAGE_SIZE = 20;

interface UsersClientProps {
  initialData: UserListResponse;
  roles: RoleResponse[];
}

export function UsersClient({ initialData, roles }: UsersClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Tab state
  const [tab, setTab] = useState<"internal" | "customer">(
    searchParams.get("tab") === "customer" ? "customer" : "internal",
  );

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserResponse | null>(null);

  // Search/filter state
  const [searchQuery, setSearchQuery] = useState(
    searchParams.get("username") || searchParams.get("nickname") || "",
  );
  const [roleFilter, setRoleFilter] = useState(
    searchParams.get("role_id") || "all",
  );
  const [statusFilter, setStatusFilter] = useState(
    searchParams.get("status") || "all",
  );

  // Sort state
  const [sort, setSort] = useState<{ field: string; dir: "asc" | "desc" }>({
    field: searchParams.get("sort") || "last_login_at",
    dir: (searchParams.get("dir") as "asc" | "desc") || "desc",
  });

  // URL persistence helper
  const updateParams = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
    }
    params.set("page", "1");
    router.replace(`${pathname}?${params.toString()}`);
  };

  // 分页导航：仅更新 page 参数，不重置其他筛选
  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams);
    if (newPage <= 1) params.delete("page");
    else params.set("page", String(newPage));
    router.replace(`${pathname}?${params.toString()}`);
  };

  // Data splitting (client-side). initialData is the full list from the API;
  // frontend splits by role.code. Fine for current data volumes.
  const internalItems = initialData.items.filter(
    (u) => u.role?.code !== "customer",
  );
  const customerItems = initialData.items.filter(
    (u) => u.role?.code === "customer",
  );
  const internalTotal = internalItems.length;
  const customerTotal = customerItems.length;
  const currentItems = tab === "internal" ? internalItems : customerItems;

  // 客户端分页：对 currentItems 按 page 切片
  const currentPage = Math.max(1, Number(searchParams.get("page")) || 1);
  const totalPages = Math.max(1, Math.ceil(currentItems.length / CLIENT_PAGE_SIZE));
  // 防止 page 超出范围（如切换 tab 后数据变少）
  const effectivePage = Math.min(currentPage, totalPages);
  const paginatedItems = currentItems.slice(
    (effectivePage - 1) * CLIENT_PAGE_SIZE,
    effectivePage * CLIENT_PAGE_SIZE,
  );

  // Handlers
  const handleTabChange = (newTab: "internal" | "customer") => {
    setTab(newTab);
    setSearchQuery("");
    setRoleFilter("all");
    setStatusFilter("all");
    updateParams({
      tab: newTab,
      username: null,
      nickname: null,
      role_id: null,
      status: null,
    });
  };

  const handleSort = (field: string) => {
    const newDir =
      sort.field === field ? (sort.dir === "asc" ? "desc" : "asc") : "desc";
    setSort({ field, dir: newDir });
    updateParams({ sort: field, dir: newDir });
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    updateParams({ username: searchQuery || null });
  };

  const handleRoleChange = (value: string) => {
    setRoleFilter(value);
    updateParams({ role_id: value === "all" ? null : value });
  };

  const handleStatusChange = (value: string) => {
    setStatusFilter(value);
    updateParams({ status: value === "all" ? null : value });
  };

  const handleClearFilters = () => {
    setSearchQuery("");
    setRoleFilter("all");
    setStatusFilter("all");
    updateParams({
      username: null,
      nickname: null,
      role_id: null,
      status: null,
    });
  };

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
    <div className="users-redesign space-y-4">
      {/* Stat Cards */}
      <UsersStatCards
        internalItems={internalItems}
        customerItems={customerItems}
      />

      {/* Tab Bar */}
      <div className="users-tabs-bar">
        <div className="flex">
          <button
            className={`users-tab-btn ${tab === "internal" ? "active" : ""}`}
            onClick={() => handleTabChange("internal")}
          >
            <Users className="h-3.5 w-3.5 mr-1.5" />
            内部用户
            <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
              {internalTotal}
            </span>
          </button>
          <button
            className={`users-tab-btn ${tab === "customer" ? "active" : ""}`}
            data-tab="customer"
            onClick={() => handleTabChange("customer")}
          >
            <UserCircle className="h-3.5 w-3.5 mr-1.5" />
            C 端用户
            <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
              {customerTotal}
            </span>
          </button>
        </div>
        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Shield className="h-3 w-3" />
          <span>C 端用户不可登录后台</span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="users-toolbar">
        <div className="flex flex-wrap items-center gap-2">
          <form onSubmit={handleSearch} className="users-search-wrap">
            <Search className="users-search-icon h-3.5 w-3.5" />
            <Input
              className="users-search-input"
              placeholder={
                tab === "internal"
                  ? "搜索用户名 / 昵称 / 手机号"
                  : "搜索昵称 / 手机号"
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </form>
          {tab === "internal" && (
            <Select value={roleFilter} onValueChange={handleRoleChange}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="所有角色" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">所有角色</SelectItem>
                {roles
                  .filter((r) => r.code !== "customer")
                  .map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      {role.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          )}
          <Select value={statusFilter} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="所有状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">所有状态</SelectItem>
              <SelectItem value="active">正常</SelectItem>
              <SelectItem value="inactive">停用</SelectItem>
              <SelectItem value="locked">锁定</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" onClick={handleClearFilters}>
            <X className="h-3 w-3 mr-1" />
            清除
          </Button>
        </div>

        <div className="flex items-center gap-2">
          {tab === "internal" && (
            <HasPermission code={PERMISSION_CODES.USER_CREATE}>
              <Button size="sm" onClick={handleCreate}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                新建用户
              </Button>
            </HasPermission>
          )}
        </div>
      </div>

      <UserTable
        data={paginatedItems}
        sort={sort}
        onSort={handleSort}
        onEdit={handleEdit}
        onResetPassword={handleResetPassword}
      />

      <Pagination
        mode="controlled"
        currentPage={effectivePage}
        totalPages={totalPages}
        pageSize={CLIENT_PAGE_SIZE}
        totalItems={currentItems.length}
        onPageChange={handlePageChange}
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
