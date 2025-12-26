
import { LeadStatus } from './types';



export const STATUS_CONFIG = {
  [LeadStatus.PENDING_ASSESSMENT]: { label: '待评估', color: 'bg-blue-100 text-blue-700 border-blue-200', step: 0 },
  [LeadStatus.PENDING_VISIT]: { label: '待看房', color: 'bg-orange-100 text-orange-700 border-orange-200', step: 1 },
  [LeadStatus.REJECTED]: { label: '已驳回', color: 'bg-gray-100 text-gray-500 border-gray-200', step: 0 },
  [LeadStatus.VISITED]: { label: '已看房', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', step: 2 },
  [LeadStatus.SIGNED]: { label: '已签约', color: 'bg-indigo-100 text-indigo-700 border-indigo-200', step: 3 },
};

export const LIFECYCLE_STEPS = [
  { status: LeadStatus.PENDING_ASSESSMENT, label: '初筛评估' },
  { status: LeadStatus.PENDING_VISIT, label: '上门实勘' },
  { status: LeadStatus.VISITED, label: '商务谈判' },
  { status: LeadStatus.SIGNED, label: '签约收房' }
];
