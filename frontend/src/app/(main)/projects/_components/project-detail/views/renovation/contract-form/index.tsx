"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Building2, Loader2, Save, Edit2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { renovationContractSchema, RenovationContractFormValues } from "./schema";
import {
  getRenovationContractAction,
  updateRenovationContractAction,
} from "../../../../../actions/renovation";
import {
  CompanySection,
  ContractTimeSection,
  ActualTimeSection,
  HardDecorationSection,
  PaymentNodesSection,
  SoftDecorationSection,
  OtherFeesSection,
} from "./contract-sections";

interface RenovationContractFormProps {
  projectId: string;
}

export function RenovationContractForm({ projectId }: RenovationContractFormProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  const form = useForm<RenovationContractFormValues>({
    resolver: zodResolver(renovationContractSchema),
    defaultValues: {
      renovation_company: "",
      contract_start_date: undefined,
      contract_end_date: undefined,
      actual_start_date: undefined,
      actual_end_date: undefined,
      hard_contract_amount: undefined,
      payment_node_1: "",
      payment_ratio_1: undefined,
      payment_node_2: "",
      payment_ratio_2: undefined,
      payment_node_3: "",
      payment_ratio_3: undefined,
      payment_node_4: "",
      payment_ratio_4: undefined,
      soft_budget: undefined,
      soft_actual_cost: undefined,
      soft_detail_attachment: "",
      design_fee: undefined,
      demolition_fee: undefined,
      garbage_fee: undefined,
      other_extra_fee: undefined,
      other_fee_reason: "",
    },
  });

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    async function loadContractData() {
      try {
        setIsLoading(true);
        setError(null);
        const result = await getRenovationContractAction(projectId);

        if (result.success && result.data) {
          const data = result.data as Record<string, unknown>;
          form.reset({
            renovation_company: (data.renovation_company as string) || "",
            contract_start_date: data.contract_start_date
              ? new Date(data.contract_start_date as string)
              : undefined,
            contract_end_date: data.contract_end_date
              ? new Date(data.contract_end_date as string)
              : undefined,
            actual_start_date: data.actual_start_date
              ? new Date(data.actual_start_date as string)
              : undefined,
            actual_end_date: data.actual_end_date
              ? new Date(data.actual_end_date as string)
              : undefined,
            hard_contract_amount: data.hard_contract_amount as number | undefined,
            payment_node_1: (data.payment_node_1 as string) || "",
            payment_ratio_1: data.payment_ratio_1 as number | undefined,
            payment_node_2: (data.payment_node_2 as string) || "",
            payment_ratio_2: data.payment_ratio_2 as number | undefined,
            payment_node_3: (data.payment_node_3 as string) || "",
            payment_ratio_3: data.payment_ratio_3 as number | undefined,
            payment_node_4: (data.payment_node_4 as string) || "",
            payment_ratio_4: data.payment_ratio_4 as number | undefined,
            soft_budget: data.soft_budget as number | undefined,
            soft_actual_cost: data.soft_actual_cost as number | undefined,
            soft_detail_attachment: (data.soft_detail_attachment as string) || "",
            design_fee: data.design_fee as number | undefined,
            demolition_fee: data.demolition_fee as number | undefined,
            garbage_fee: data.garbage_fee as number | undefined,
            other_extra_fee: data.other_extra_fee as number | undefined,
            other_fee_reason: (data.other_fee_reason as string) || "",
          });
        } else {
          setError(result.message || "加载数据失败");
        }
      } catch (err) {
        setError("加载数据时发生错误");
        console.error("加载装修合同数据失败:", err);
      } finally {
        setIsLoading(false);
      }
    }

    loadContractData();
  }, [projectId, form]);

  const handleSave = async () => {
    const values = form.getValues();

    try {
      setIsSaving(true);

      const payload = {
        ...values,
        contract_start_date: values.contract_start_date?.toISOString(),
        contract_end_date: values.contract_end_date?.toISOString(),
        actual_start_date: values.actual_start_date?.toISOString(),
        actual_end_date: values.actual_end_date?.toISOString(),
      };

      const result = await updateRenovationContractAction(projectId, payload);

      if (result.success) {
        toast.success("装修合同信息已保存");
        setIsEditing(false);
      } else {
        toast.error(result.message || "保存失败");
      }
    } catch (err) {
      toast.error("保存时发生错误");
      console.error("保存装修合同数据失败:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    window.location.reload();
  };

  if (!isMounted || isLoading) {
    return (
      <Card className="border-slate-200">
        <CardContent className="p-8">
          <div className="flex items-center justify-center text-slate-400">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            <span className="text-sm">加载中...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-slate-200">
        <CardContent className="p-8">
          <div className="text-center text-red-500 text-sm">{error}</div>
        </CardContent>
      </Card>
    );
  }

  const { watch, setValue } = form;
  const values = watch();

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Building2 className="h-4 w-4 text-blue-500" />
            装修合同信息
          </CardTitle>
          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCancel}
                  disabled={isSaving}
                  className="h-8 text-xs"
                >
                  <X className="mr-1 h-3.5 w-3.5" />
                  取消
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="h-8 text-xs"
                >
                  {isSaving ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="mr-1 h-3.5 w-3.5" />
                  )}
                  保存
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(true)}
                className="h-8 text-xs"
              >
                <Edit2 className="mr-1 h-3.5 w-3.5" />
                编辑
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <CompanySection values={values} setValue={setValue} isEditing={isEditing} />
        <ContractTimeSection values={values} setValue={setValue} isEditing={isEditing} />
        <ActualTimeSection values={values} setValue={setValue} isEditing={isEditing} />
        <HardDecorationSection values={values} setValue={setValue} isEditing={isEditing} />
        <PaymentNodesSection values={values} setValue={setValue} isEditing={isEditing} />
        <SoftDecorationSection values={values} setValue={setValue} isEditing={isEditing} />
        <OtherFeesSection values={values} setValue={setValue} isEditing={isEditing} />
      </CardContent>
    </Card>
  );
}
