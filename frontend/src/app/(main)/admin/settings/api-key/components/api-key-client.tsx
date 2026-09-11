"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
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
        <div className="flex items-start gap-2.5 rounded-inputs bg-apricot-wash/50 px-4 py-3 text-sm text-rust">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-medium">请立即复制您的 API Key</p>
            <p className="mt-1">
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
        <div className="flex items-start gap-3 rounded-cards bg-white px-6 py-5 shadow-steep">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-rust" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-ink">API Key 已激活</p>
            <p className="mt-1 text-sm text-graphite">
              您的 API Key 正在使用中。如需更换，请先删除当前 Key 后重新生成。
            </p>
          </div>
        </div>
        <ApiKeyCard apiKeyInfo={apiKeyInfo} onDelete={() => setShowDeleteDialog(true)} />
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
