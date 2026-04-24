"use client";

import { useState } from "react";
import { KeyRound, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiKeyInfoResponse, ApiKeyCreateResponse } from "../actions";
import { ApiKeyEmptyState } from "./api-key-empty-state";
import { ApiKeyDisplay } from "./api-key-display";
import { ApiKeyCard } from "./api-key-card";
import { GenerateDialog } from "./generate-dialog";
import { DeleteDialog } from "./delete-dialog";

interface ApiKeyClientProps {
  initialData: ApiKeyInfoResponse | null;
}

export function ApiKeyClient({ initialData }: ApiKeyClientProps) {
  const [apiKeyInfo, setApiKeyInfo] = useState<ApiKeyInfoResponse | null>(initialData);
  const [newApiKey, setNewApiKey] = useState<ApiKeyCreateResponse | null>(null);
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // 新生成的 API Key 显示状态
  const [showNewKey, setShowNewKey] = useState(false);

  const handleGenerateSuccess = (data: ApiKeyCreateResponse) => {
    setNewApiKey(data);
    setShowNewKey(true);
    setShowGenerateDialog(false);
  };

  const handleDeleteSuccess = () => {
    setApiKeyInfo(null);
    setNewApiKey(null);
    setShowNewKey(false);
    setShowDeleteDialog(false);
  };

  const handleDismissNewKey = () => {
    setShowNewKey(false);
    // 刷新页面以获取新的 API Key 信息（只显示前缀）
    window.location.reload();
  };

  // 如果有新生成的 Key 且正在显示，展示完整 Key
  if (showNewKey && newApiKey) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/20 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
              请立即复制您的 API Key
            </p>
            <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
              这是唯一一次显示完整 Key 的机会，关闭后将无法再次查看。请妥善保管。
            </p>
          </div>
        </div>
        <ApiKeyDisplay
          apiKey={newApiKey.api_key}
          prefix={newApiKey.prefix}
          createdAt={newApiKey.created_at}
          expiresAt={newApiKey.expires_at}
          onDismiss={handleDismissNewKey}
        />
      </div>
    );
  }

  // 如果没有 API Key，显示空状态
  if (!apiKeyInfo) {
    return (
      <>
        <ApiKeyEmptyState onGenerate={() => setShowGenerateDialog(true)} />
        <GenerateDialog
          open={showGenerateDialog}
          onOpenChange={setShowGenerateDialog}
          onSuccess={handleGenerateSuccess}
        />
      </>
    );
  }

  // 显示现有的 API Key 信息
  return (
    <>
      <div className="space-y-4">
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/20 p-4 flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">
              API Key 已激活
            </p>
            <p className="text-sm text-emerald-700 dark:text-emerald-300 mt-1">
              您的 API Key 正在使用中。如需更换，请先删除当前 Key 后重新生成。
            </p>
          </div>
        </div>
        <ApiKeyCard
          apiKeyInfo={apiKeyInfo}
          onDelete={() => setShowDeleteDialog(true)}
        />
      </div>

      <GenerateDialog
        open={showGenerateDialog}
        onOpenChange={setShowGenerateDialog}
        onSuccess={handleGenerateSuccess}
      />

      <DeleteDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        onSuccess={handleDeleteSuccess}
        apiKeyPrefix={apiKeyInfo.prefix}
      />
    </>
  );
}
