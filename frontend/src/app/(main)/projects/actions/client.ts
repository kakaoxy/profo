"use server";

// 客户端组件可以使用的 Server Actions
// 每个导出必须是异步函数

import { 
  updateProjectStatusAction as serverUpdateProjectStatusAction 
} from "./core";

import {
  getRenovationPhotosAction as serverGetRenovationPhotosAction
} from "./renovation";

// Project status actions
export async function updateProjectStatusAction(
  projectId: string,
  status: string,
  listingDate?: string,
  listPrice?: number
) {
  return serverUpdateProjectStatusAction(projectId, status, listingDate, listPrice);
}

// Renovation actions
export async function getRenovationPhotosAction(projectId: string) {
  return serverGetRenovationPhotosAction(projectId);
}
