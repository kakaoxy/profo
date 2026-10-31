"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { PageContainer } from "@/app/(main)/admin/_components/page-container";
import { PageHeader } from "@/app/(main)/admin/_components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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

  useEffect(() => {
    if (!agreementId) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    merchantApi<Agreement>(`/admin/merchant/agreements/${agreementId}`)
      .then((result) => {
        if (!cancelled) setAgreement(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [agreementId]);

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

        {error ? <Card className="p-4 text-sm text-error">{error}</Card> : null}
        {loading ? <Card className="p-6 text-sm text-muted-foreground">加载中...</Card> : null}
        {!loading && !error && !agreement ? (
          <Card className="p-10 text-center text-sm text-graphite">协议不存在或无权查看</Card>
        ) : null}

        {agreement ? (
          <>
            <Card className="p-5">
              <div className="grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-2">
                <Info label="签约主体">
                  {agreement.subject_name || "—"}
                  <span className="ml-2 text-xs text-graphite">
                    {agreement.subject_type === "store" ? "门店" : "公司"}
                  </span>
                </Info>
                <Info label="协议模板">{agreement.template_name || "—"}</Info>
                <Info label="协议状态">
                  <Badge variant={agreement.status === "signed" ? "default" : "secondary"}>
                    {STATUS_LABELS[agreement.status] || agreement.status}
                  </Badge>
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

              <div className="mt-5 flex flex-wrap gap-3 border-t border-mist pt-4 text-sm">
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
              </div>
            </Card>

            {agreement.attachment_urls.length || agreement.supplement_agreement_ids.length ? (
              <Card className="p-5">
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
