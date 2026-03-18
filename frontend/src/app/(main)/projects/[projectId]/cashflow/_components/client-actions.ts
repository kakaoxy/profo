"use server";

// 客户端组件可以使用的 Server Actions
// 每个导出必须是异步函数

import {
  getProjectCashFlowAction as serverGetProjectCashFlowAction,
  createCashFlowRecordAction as serverCreateCashFlowRecordAction,
  deleteCashFlowRecordAction as serverDeleteCashFlowRecordAction
} from "../actions";

// Cashflow actions
export async function getProjectCashFlowAction(projectId: string) {
  return serverGetProjectCashFlowAction(projectId);
}

export async function createCashFlowRecordAction(
  projectId: string,
  payload: {
    type: "income" | "expense";
    category: string;
    amount: number | string;
    date: string;
    notes?: string;
  }
) {
  return serverCreateCashFlowRecordAction(projectId, payload);
}

export async function deleteCashFlowRecordAction(projectId: string, recordId: string) {
  return serverDeleteCashFlowRecordAction(projectId, recordId);
}
