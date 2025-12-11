'use client';

import React from 'react';
import { Lead, StatItem, TaskSummary } from '@/types';
import { IconChevronDown, IconChart, IconShield } from './Icons';

// Mock Data
const stats: StatItem[] = [
  { label: '房源总数', value: '48,213' },
  { label: '新增线索', value: '543', trend: { value: '12.5%', isUp: true } },
  { label: '本月签约', value: '125' },
  { label: '待处理任务', value: '42', trend: { value: '5', isUp: false }, highlight: true },
];

const leads: Lead[] = [
  {
    id: '1',
    community: '万科金域蓝湾',
    layout: '3室2厅',
    orientation: '南北',
    floor: '12/32层',
    area: '128㎡',
    totalPrice: '580万',
    unitPrice: '45,312元/㎡',
    time: '2023-10-24 10:30',
    floorPlanUrl: 'https://images.unsplash.com/photo-1580587771525-78b9dba3b91d?auto=format&fit=crop&w=100&q=80'
  },
  {
    id: '2',
    community: '中海寰宇天下',
    layout: '2室1厅',
    orientation: '南',
    floor: '5/18层',
    area: '89㎡',
    totalPrice: '320万',
    unitPrice: '35,955元/㎡',
    time: '2023-10-24 09:15',
    floorPlanUrl: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=100&q=80'
  },
  {
    id: '3',
    community: '保利天悦',
    layout: '4室2厅',
    orientation: '南北',
    floor: '22/45层',
    area: '186㎡',
    totalPrice: '1250万',
    unitPrice: '67,204元/㎡',
    time: '2023-10-23 18:20',
    floorPlanUrl: 'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=100&q=80'
  },
  {
    id: '4',
    community: '华润城润府',
    layout: '3室2厅',
    orientation: '东南',
    floor: '8/30层',
    area: '110㎡',
    totalPrice: '980万',
    unitPrice: '89,090元/㎡',
    time: '2023-10-23 16:45',
    floorPlanUrl: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=100&q=80'
  }
];

const tasks: TaskSummary[] = [
  { 
    title: '房源评估', 
    pending: 17, 
    processed: 22, 
    iconBg: 'bg-blue-100',
    icon: <IconShield className="w-6 h-6 text-blue-600" />
  },
  { 
    title: '数据监控', 
    pending: 5, 
    processed: 102, 
    iconBg: 'bg-purple-100',
    icon: <IconChart className="w-6 h-6 text-purple-600" />
  }
];

// Helper Components
const StatCard: React.FC<{ item: StatItem }> = ({ item }) => (
  <div className="flex flex-col">
    <span className="text-gray-500 text-sm mb-1">{item.label}</span>
    <div className="flex items-baseline">
      <span className="text-2xl font-bold text-gray-900 mr-2">{item.value}</span>
      {item.trend && (
        <span className={`text-xs font-semibold flex items-center ${item.trend.isUp ? 'text-green-500' : 'text-red-500'}`}>
           <span className="mr-0.5">{item.trend.isUp ? '▲' : '▼'}</span>
           {item.trend.value}
        </span>
      )}
    </div>
  </div>
);

const TaskCard: React.FC<{ task: TaskSummary }> = ({ task }) => (
  <div className="bg-white border border-gray-200 rounded-lg p-5 hover:shadow-md transition-shadow cursor-pointer flex flex-col justify-between h-36">
    <div className="flex items-center mb-4">
      <div className={`p-2 rounded-lg ${task.iconBg} mr-3`}>
        {task.icon}
      </div>
      <span className="font-bold text-gray-900">{task.title}</span>
    </div>
    <div className="flex items-center justify-between px-2">
      <div className="flex flex-col">
        <span className="text-xs text-gray-500 mb-1">待处理</span>
        <span className="text-xl font-bold text-gray-900">{task.pending}</span>
      </div>
      <div className="h-8 w-px bg-gray-200 mx-4"></div>
      <div className="flex flex-col">
        <span className="text-xs text-gray-500 mb-1">已处理</span>
        <span className="text-xl font-bold text-gray-900">{task.processed}</span>
      </div>
    </div>
  </div>
);

export default function DashboardContent() {
  return (
    <div className="flex-1 bg-white p-8 overflow-y-auto shrink">
      <div className="max-w-6xl w-full">
        {/* Header Greeting */}
        <div className="flex items-center mb-8">
          <span className="text-2xl mr-2">☀️</span>
          <h1 className="text-2xl font-bold text-gray-900">你好, 管理员</h1>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-4 gap-8 mb-10">
          {stats.map((stat, idx) => (
            <StatCard key={idx} item={stat} />
          ))}
        </div>

        {/* Middle Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
          {tasks.map((task, idx) => (
            <TaskCard key={idx} task={task} />
          ))}
        </div>

        {/* File List Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-gray-900">待处理线索</h2>
          <div className="flex items-center space-x-3">
             <button className="flex items-center px-3 py-1.5 bg-gray-50 rounded text-sm text-gray-600 hover:bg-gray-100 transition-colors border border-transparent hover:border-gray-200">
              <span className="mr-1">筛选</span>
              <IconChevronDown className="w-3 h-3 ml-2 text-gray-400" />
            </button>
          </div>
        </div>

        {/* Lead Table */}
        <div className="border-t border-gray-100">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="py-3 pl-2 w-8">
                  <input type="checkbox" className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                </th>
                <th className="py-3 text-xs font-medium text-gray-400">户型图</th>
                <th className="py-3 text-xs font-medium text-gray-400">小区</th>
                <th className="py-3 text-xs font-medium text-gray-400">户型</th>
                <th className="py-3 text-xs font-medium text-gray-400">朝向</th>
                <th className="py-3 text-xs font-medium text-gray-400">楼层</th>
                <th className="py-3 text-xs font-medium text-gray-400">面积</th>
                <th className="py-3 text-xs font-medium text-gray-400">总价</th>
                <th className="py-3 text-xs font-medium text-gray-400">单价</th>
                <th className="py-3 text-xs font-medium text-gray-400">时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {leads.map((lead) => (
                <tr key={lead.id} className="group hover:bg-gray-50 transition-colors cursor-pointer text-sm">
                   <td className="py-4 pl-2">
                      <input type="checkbox" className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                   </td>
                   <td className="py-3">
                      <div className="w-12 h-12 rounded bg-gray-100 overflow-hidden border border-gray-200">
                        <img src={lead.floorPlanUrl} alt="Plan" className="w-full h-full object-cover" />
                      </div>
                   </td>
                   <td className="py-3 font-medium text-gray-800">{lead.community}</td>
                   <td className="py-3 text-gray-600">{lead.layout}</td>
                   <td className="py-3 text-gray-600">{lead.orientation}</td>
                   <td className="py-3 text-gray-600">{lead.floor}</td>
                   <td className="py-3 text-gray-600">{lead.area}</td>
                   <td className="py-3 font-semibold text-orange-600">{lead.totalPrice}</td>
                   <td className="py-3 text-gray-400 text-xs">{lead.unitPrice}</td>
                   <td className="py-3 text-gray-400 text-xs">{lead.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}