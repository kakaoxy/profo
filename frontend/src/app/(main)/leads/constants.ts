
import { Lead, LeadStatus } from './types';

export const MOCK_LEADS: Lead[] = [
  {
    id: '1',
    communityName: '康平小区',
    layout: '2室1厅1卫',
    orientation: '南',
    floorInfo: '13/24层',
    area: 55.2,
    totalPrice: 210,
    unitPrice: 3.8,
    status: LeadStatus.PENDING_ASSESSMENT,
    images: ['https://picsum.photos/seed/house1/400/300', 'https://picsum.photos/seed/house2/400/300'],
    district: '静安',
    businessArea: '曹家渡',
    remarks: '业主急售，看房方便',
    creatorName: '张三',
    createdAt: '2023-10-25 10:00:00',
  },
  {
    id: '2',
    communityName: '远洋万和城',
    layout: '3室2厅2卫',
    orientation: '南北',
    floorInfo: '8/18层',
    area: 120.5,
    totalPrice: 500,
    unitPrice: 4.15,
    status: LeadStatus.PENDING_VISIT,
    evalPrice: 480,
    auditReason: '户型方正，低于市价，值得实勘',
    images: ['https://picsum.photos/seed/house3/400/300'],
    district: '朝阳',
    businessArea: '望京',
    remarks: '带车位，满五唯一',
    creatorName: '李四',
    createdAt: '2023-10-24 15:30:00',
    lastFollowUpAt: '2023-10-24 16:00:00'
  },
  {
    id: '3',
    communityName: '老破小一村',
    layout: '1室0厅1卫',
    orientation: '北',
    floorInfo: '6/6层',
    area: 30.0,
    totalPrice: 150,
    unitPrice: 5.0,
    status: LeadStatus.REJECTED,
    auditReason: '价格虚高，顶层漏水风险大，流转率低',
    images: ['https://picsum.photos/seed/house4/400/300'],
    district: '普陀',
    businessArea: '长寿路',
    remarks: '租客在住，需预约',
    creatorName: '王五',
    createdAt: '2023-10-22 09:15:00',
  }
];

export const DISTRICTS = ['静安', '朝阳', '普陀', '徐汇', '浦东'];

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
