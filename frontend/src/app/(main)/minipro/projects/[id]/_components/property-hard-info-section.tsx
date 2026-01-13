'use client';

import { MiniProject } from '../../types';

interface PropertyHardInfoSectionProps {
  project: MiniProject;
  onRefresh: () => void;
}

export function PropertyHardInfoSection({ project, onRefresh }: PropertyHardInfoSectionProps) {
  return (
    <section className="bg-white rounded-lg border border-[#e5e7eb] shadow-[0_1px_3px_0_rgba(0,0,0,0.05)] overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
        <div className="flex items-center gap-3 text-[#111827]">
          <h2 className="font-bold text-base">房源硬信息</h2>
          <span className="bg-gray-100 text-[#6b7280] text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">主项目同步</span>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="text-[#137fec] text-xs font-bold flex items-center gap-1 hover:underline outline-none"
        >
          <span className="material-symbols-outlined text-lg">sync</span>
          刷新基础信息
        </button>
      </div>
      <div className="p-6 grid grid-cols-2 gap-6 bg-gray-50/30">
        <div className="space-y-1">
          <label className='block text-[11px] font-bold text-[#6b7280] mb-1 uppercase'>地址 (address)</label>
          <div className="flex items-center justify-between px-3 py-2 bg-gray-100/60 border border-[#e5e7eb] rounded-lg text-sm text-[#6b7280]">
            <span>{project.address || '未同步'}</span>
            <span className="material-symbols-outlined text-sm opacity-50">lock</span>
          </div>
        </div>
        <div className="space-y-1">
          <label className='block text-[11px] font-bold text-[#6b7280] mb-1 uppercase'>总面积 (area)</label>
          <div className="flex items-center justify-between px-3 py-2 bg-gray-100/60 border border-[#e5e7eb] rounded-lg text-sm text-[#6b7280]">
            <span>{project.area ? `${project.area} m²` : '未同步'}</span>
            <span className="material-symbols-outlined text-sm opacity-50">lock</span>
          </div>
        </div>
        <div className="space-y-1">
          <label className='block text-[11px] font-bold text-[#6b7280] mb-1 uppercase'>价格 (price)</label>
          <div className="flex items-center justify-between px-3 py-2 bg-gray-100/60 border border-[#e5e7eb] rounded-lg text-sm text-[#6b7280]">
            <span>{project.price ? `¥${project.price.toLocaleString()} 万` : '未同步'}</span>
            <span className="material-symbols-outlined text-sm opacity-50">lock</span>
          </div>
        </div>
        <div className="space-y-1">
          <label className='block text-[11px] font-bold text-[#6b7280] mb-1 uppercase'>户型 (layout)</label>
          <div className="flex items-center justify-between px-3 py-2 bg-gray-100/60 border border-[#e5e7eb] rounded-lg text-sm text-[#6b7280]">
            <span>{project.layout || '未同步'}</span>
            <span className="material-symbols-outlined text-sm opacity-50">lock</span>
          </div>
        </div>
        <div className="space-y-1">
          <label className='block text-[11px] font-bold text-[#6b7280] mb-1 uppercase'>朝向 (orientation)</label>
          <div className="flex items-center justify-between px-3 py-2 bg-gray-100/60 border border-[#e5e7eb] rounded-lg text-sm text-[#6b7280]">
            <span>{project.orientation || '未同步'}</span>
            <span className="material-symbols-outlined text-sm opacity-50">lock</span>
          </div>
        </div>
        <div className="space-y-1">
          <label className='block text-[11px] font-bold text-[#6b7280] mb-1 uppercase'>楼层信息 (floor_info)</label>
          <div className="flex items-center justify-between px-3 py-2 bg-gray-100/60 border border-[#e5e7eb] rounded-lg text-sm text-[#6b7280]">
            <span>{project.floor_info || '未同步'}</span>
            <span className="material-symbols-outlined text-sm opacity-50">lock</span>
          </div>
        </div>
      </div>
    </section>
  );
}
