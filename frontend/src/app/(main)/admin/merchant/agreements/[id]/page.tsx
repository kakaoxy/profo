"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { PageContainer } from "@/app/(main)/admin/_components/page-container";
import { PageHeader } from "@/app/(main)/admin/_components/page-header";
import { Field } from "@/app/(main)/admin/_components/field";
import { StatusBadge } from "@/app/(main)/admin/_components/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { components } from "@/lib/api-types";
import { merchantApi } from "../../_components/merchant-api";

type Agreement = components["schemas"]["AgreementResponse"];

const STATUS_LABELS: Record<string, string> = {
  not_initiated: "未发起",
  pending_sign: "待签署",
  signed: "已签署",
  expired: "已过期",
  voided: "已作废",
};
const REVIEW_LABELS: Record<string, string> = { pending: "待审核", approved: "审核通过", rejected: "审核驳回" };

function formatTime(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString("zh-CN") : "—";
}

/** 协议详情：系统通知「合作协议即将到期」的跳转目标（V09）。 */
export default function MerchantAgreementDetailPage() {
  const params = useParams<{ id: string }>();
  const agreementId = params?.id ?? "";
  const [agreement, setAgreement] = useState<Agreement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [scanOpen, setScanOpen] = useState(false);
  const [scanFileUrl, setScanFileUrl] = useState("");
  const [scanFileName, setScanFileName] = useState("");
  const [scanSignerName, setScanSignerName] = useState("");
  const [scanSignerPhone, setScanSignerPhone] = useState("");
  const [scanReason, setScanReason] = useState("");
  const [scanSignedDate, setScanSignedDate] = useState("");
  const [uploading, setUploading] = useState(false);
  const [savingScan, setSavingScan] = useState(false);
  const [supplementOpen, setSupplementOpen] = useState(false);
  const [supplementRemark, setSupplementRemark] = useState("");
  const [supplementFileUrl, setSupplementFileUrl] = useState("");
  const [supplementFileName, setSupplementFileName] = useState("");
  const [uploadingSupplement, setUploadingSupplement] = useState(false);
  const [savingSupplement, setSavingSupplement] = useState(false);

  const load = async () => {
    if (!agreementId) return;
    setLoading(true);
    setError("");
    try {
      const result = await merchantApi<Agreement>(`/admin/merchant/agreements/${agreementId}`);
      setAgreement(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agreementId]);

  const openScan = () => {
    setScanFileUrl("");
    setScanFileName("");
    setScanSignerName(agreement?.signer_name || "");
    setScanSignerPhone("");
    setScanSignedDate("");
    setScanOpen(true);
  };

  const MAX_SCAN_FILE_BYTES = 10 * 1024 * 1024;

  const openSupplement = () => {
    setSupplementRemark("");
    setSupplementFileUrl("");
    setSupplementFileName("");
    setSupplementOpen(true);
  };

  const uploadSupplementFile = async (file: File) => {
    const extOk = /\.(pdf|jpe?g|png)$/i.test(file.name);
    if (!extOk) {
      setError("补充协议仅支持 PDF、JPG、PNG 格式");
      return;
    }
    if (file.size > MAX_SCAN_FILE_BYTES) {
      setError("补充协议文件大小不能超过 10MB");
      return;
    }
    setUploadingSupplement(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/v1/files/upload", {
        method: "POST",
        headers: { "X-Requested-With": "XMLHttpRequest" },
        credentials: "include",
        body: form,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.message ?? "文件上传失败");
        return;
      }
      setSupplementFileUrl(body.url);
      setSupplementFileName(file.name);
    } catch {
      setError("文件上传失败，请重试");
    } finally {
      setUploadingSupplement(false);
    }
  };

  const submitSupplement = async () => {
    if (!supplementRemark.trim()) {
      setError("请填写补充说明");
      return;
    }
    setSavingSupplement(true);
    setError("");
    try {
      await merchantApi(`/admin/merchant/agreements/${agreementId}/supplements`, {
        method: "POST",
        body: JSON.stringify({
          remark: supplementRemark.trim(),
          file_url: supplementFileUrl || null,
        }),
      });
      setSupplementOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "新增补充协议失败");
    } finally {
      setSavingSupplement(false);
    }
  };

  const uploadScanFile = async (file: File) => {
    // 扫描件仅允许 PDF/JPG/PNG，且不超过 10MB（REQ-M04-004 分支 1）
    const extOk = /\.(pdf|jpe?g|png)$/i.test(file.name);
    const mimeOk = ["application/pdf", "image/jpeg", "image/png"].includes(file.type);
    if (!extOk && !mimeOk) {
      setError("扫描件仅支持 PDF、JPG、PNG 格式");
      return;
    }
    if (file.size > MAX_SCAN_FILE_BYTES) {
      setError("扫描件大小不能超过 10MB");
      return;
    }
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/v1/files/upload", {
        method: "POST",
        headers: { "X-Requested-With": "XMLHttpRequest" },
        credentials: "include",
        body: form,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.message ?? "文件上传失败");
        return;
      }
      setScanFileUrl(body.url);
      setScanFileName(file.name);
    } catch {
      setError("文件上传失败，请重试");
    } finally {
      setUploading(false);
    }
  };

  const submitScan = async () => {
    if (!agreement) return;
    if (!scanFileUrl || !scanSignerName.trim() || !scanSignerPhone.trim()) {
      setError("请上传扫描件并填写签署人姓名与手机号");
      return;
    }
    setSavingScan(true);
    setError("");
    try {
      await merchantApi(`/admin/merchant/agreements/${agreement.id}/scan`, {
        method: "POST",
        body: JSON.stringify({
          file_url: scanFileUrl,
          signer_name: scanSignerName.trim(),
          signer_phone: scanSignerPhone.trim(),
          reason: scanReason.trim() || null,
          signed_at: scanSignedDate ? new Date(`${scanSignedDate}T12:00:00+08:00`).toISOString() : null,
        }),
      });
      setScanOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "扫描件归档失败");
    } finally {
      setSavingScan(false);
    }
  };

  return (
    <div className="min-h-screen bg-fog">
      <PageContainer className="flex flex-col gap-6">
        <PageHeader
          title={agreement?.agreement_no || "协议详情"}
          description={
            <Link href="/admin/merchant/agreements" className="text-graphite underline-offset-4 hover:underline">
              返回协议列表
            </Link>
          }
        />

        {error ? <Card className="rounded-cards border-0 shadow-steep-sm p-5 text-sm text-error">{error}</Card> : null}
        {loading ? <Card className="rounded-cards border-0 shadow-steep-sm p-6 text-sm text-muted-foreground">加载中...</Card> : null}
        {!loading && !error && !agreement ? (
          <Card className="rounded-cards border-0 shadow-steep-sm p-10 text-center text-sm text-graphite">协议不存在或无权查看</Card>
        ) : null}

        {agreement ? (
          <>
            <Card className="rounded-cards border-0 shadow-steep-sm p-5">
              <div className="grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-2">
                <Info label="签约主体">
                  {agreement.subject_name || "—"}
                  <span className="ml-2 text-xs text-graphite">
                    {agreement.subject_type === "store" ? "门店" : "公司"}
                  </span>
                </Info>
                <Info label="协议模板">{agreement.template_name || "—"}</Info>
                <Info label="协议状态">
                  <StatusBadge
                    tone={
                      agreement.status === "signed"
                        ? "positive"
                        : agreement.status === "pending_sign" || agreement.status === "not_initiated"
                          ? "attention"
                          : "neutral"
                    }
                  >
                    {STATUS_LABELS[agreement.status] || agreement.status}
                  </StatusBadge>
                </Info>
                <Info label="审核状态">{REVIEW_LABELS[agreement.review_status] || agreement.review_status}</Info>
                <Info label="签署人">
                  {agreement.signer_name}
                  <span className="ml-2 text-xs text-graphite">{agreement.signer_phone_masked || "—"}</span>
                </Info>
                <Info label="签署时间">{formatTime(agreement.signed_at)}</Info>
                <Info label="到期时间">{formatTime(agreement.expire_at)}</Info>
                <Info label="创建时间">{formatTime(agreement.created_at)}</Info>
                <Info label="审核意见">{agreement.review_remark || "—"}</Info>
                <Info label="备注">{agreement.remark || "—"}</Info>
              </div>

              <div className="mt-5 flex flex-wrap gap-3 border-t border-dove pt-4 text-sm">
                {agreement.store_id ? (
                  <Link
                    href={`/admin/merchant/stores/${agreement.store_id}`}
                    className="text-ink underline-offset-4 hover:underline"
                  >
                    查看门店详情
                  </Link>
                ) : null}
                {agreement.file_url ? (
                  <a
                    href={agreement.file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-ink underline-offset-4 hover:underline"
                  >
                    下载协议文件
                  </a>
                ) : (
                  <span className="text-graphite">尚未生成协议文件</span>
                )}
                {agreement.status !== "signed" &&
                agreement.status !== "voided" &&
                agreement.status !== "expired" ? (
                  <Button size="sm" variant="outline" onClick={openScan}>
                    上传盖章扫描件
                  </Button>
                ) : null}
              </div>
            </Card>

            <Card className="rounded-cards border-0 shadow-steep-sm p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-ink">补充协议与附件</p>
                  <p className="mt-1 text-[13px] text-graphite">补充协议独立归档并关联原协议；支持 PDF/JPG/PNG。</p>
                </div>
                <Button size="sm" variant="outline" onClick={openSupplement}>
                  新增补充协议
                </Button>
              </div>
            </Card>

            {agreement.attachment_urls.length || agreement.supplement_agreement_ids.length ? (
              <Card className="rounded-cards border-0 shadow-steep-sm p-5">
                {agreement.attachment_urls.length ? (
                  <div>
                    <p className="text-sm font-medium text-ink">附件</p>
                    <ul className="mt-2 space-y-1 text-sm">
                      {agreement.attachment_urls.map((url) => (
                        <li key={url}>
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-ink underline-offset-4 hover:underline"
                          >
                            {url}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {agreement.supplement_agreement_ids.length ? (
                  <div className={agreement.attachment_urls.length ? "mt-5" : ""}>
                    <p className="text-sm font-medium text-ink">补充协议</p>
                    <ul className="mt-2 space-y-1 text-sm">
                      {agreement.supplement_agreement_ids.map((id) => (
                        <li key={id}>
                          <Link
                            href={`/admin/merchant/agreements/${id}`}
                            className="text-ink underline-offset-4 hover:underline"
                          >
                            {id}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </Card>
            ) : null}
          </>
        ) : null}

        {scanOpen ? (
          <Card className="rounded-cards border-0 shadow-steep-sm fixed inset-0 z-50 m-auto flex h-fit max-h-[85vh] w-[min(560px,92vw)] flex-col gap-3 overflow-y-auto p-5">
            <div className="text-sm font-medium">上传盖章扫描件</div>
            <p className="text-xs text-graphite">支持 PDF/JPG/PNG，提交后协议状态变为已签署。</p>
            <Field label="盖章扫描件" hint="支持 PDF/JPG/PNG">
              <Input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                disabled={uploading}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadScanFile(file);
                }}
              />
            </Field>
            {scanFileName ? <p className="text-xs text-graphite">已上传：{scanFileName}</p> : null}
            <Field label="签署人姓名" required>
              <Input
                value={scanSignerName}
                onChange={(event) => setScanSignerName(event.target.value)}
              />
            </Field>
            <Field label="签署人手机号" required>
              <Input
                value={scanSignerPhone}
                onChange={(event) => setScanSignerPhone(event.target.value)}
                inputMode="tel"
              />
            </Field>
            <Field label="代签原因" hint="签署人与门店/公司联系人信息不一致时必填">
              <Input value={scanReason} onChange={(event) => setScanReason(event.target.value)} />
            </Field>
            <Field label="签署日期">
              <Input
                type="date"
                value={scanSignedDate}
                onChange={(event) => setScanSignedDate(event.target.value)}
              />
            </Field>
            <div className="flex gap-2">
              <Button onClick={() => void submitScan()} disabled={savingScan || uploading}>
                {savingScan ? "提交中…" : "提交归档"}
              </Button>
              <Button variant="outline" onClick={() => setScanOpen(false)}>
                取消
              </Button>
            </div>
          </Card>
        ) : null}

        {supplementOpen ? (
          <Card className="rounded-cards border-0 shadow-steep-sm fixed inset-0 z-50 m-auto flex h-fit max-h-[85vh] w-[min(560px,92vw)] flex-col gap-3 overflow-y-auto p-5">
            <div className="text-sm font-medium">新增补充协议</div>
            <Field label="补充说明" required>
              <Input
                value={supplementRemark}
                onChange={(event) => setSupplementRemark(event.target.value)}
                placeholder="例如：延长租期至 2027-12-31"
              />
            </Field>
            <Field label="补充协议文件" hint="PDF/JPG/PNG，不超过 10MB，可留空">
              <Input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                disabled={uploadingSupplement}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadSupplementFile(file);
                }}
              />
            </Field>
            {supplementFileName ? <p className="text-xs text-graphite">已上传：{supplementFileName}</p> : null}
            <div className="flex gap-2">
              <Button onClick={() => void submitSupplement()} disabled={savingSupplement || uploadingSupplement}>
                {savingSupplement ? "提交中…" : "保存补充协议"}
              </Button>
              <Button variant="outline" onClick={() => setSupplementOpen(false)}>
                取消
              </Button>
            </div>
          </Card>
        ) : null}
      </PageContainer>
    </div>
  );
}

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs text-graphite">{label}</p>
      <p className="mt-1 text-sm text-ink">{children}</p>
    </div>
  );
}
