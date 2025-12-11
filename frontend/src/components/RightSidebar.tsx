'use client';

import React, { useState } from 'react';
import { IconBuilding, IconList } from './Icons';

// Mock selected data
const selectedProperty = {
  community: '万科金域蓝湾',
  id: 'HD-20231024-001',
  floorPlan: 'https://images.unsplash.com/photo-1580587771525-78b9dba3b91d?auto=format&fit=crop&w=600&q=80',
  images: [
    'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=100&q=60',
    'https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=100&q=60',
    'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=100&q=60'
  ],
  specs: [
    { label: '户型', value: '3室2厅2卫' },
    { label: '面积', value: '128.5㎡' },
    { label: '朝向', value: '南北通透' },
    { label: '楼层', value: '12/32' },
  ],
  tags: ['近地铁', '学区房', '随时看房'],
  price: '580万'
};

export default function RightSidebar() {
  const [isAssessing, setIsAssessing] = useState(false);
  const [assessPrice, setAssessPrice] = useState('');

  const handleConfirmAssessment = () => {
    // Mock submit logic
    console.log("Assessed price:", assessPrice);
    setIsAssessing(false);
    setAssessPrice('');
  };

  return (
    <div className="w-80 bg-white border-l border-gray-100 flex flex-col h-full shrink-0 overflow-y-auto">
      <div className="p-6">
        <h3 className="text-base font-bold text-gray-800 mb-6 flex items-center">
          <IconList className="w-4 h-4 mr-2 text-gray-500" />
          信息详情
        </h3>
        
        {/* Main Image */}
        <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden mb-4 border border-gray-200">
           <img src={selectedProperty.floorPlan} alt="Floor Plan" className="w-full h-full object-cover" />
        </div>
        
        {/* Gallery Preview */}
        <div className="flex space-x-2 mb-6 overflow-x-auto pb-2">
            {selectedProperty.images.map((img, idx) => (
                <div key={idx} className="w-16 h-12 flex-shrink-0 rounded bg-gray-100 overflow-hidden border border-gray-100">
                    <img src={img} className="w-full h-full object-cover opacity-80 hover:opacity-100 transition-opacity cursor-pointer" />
                </div>
            ))}
        </div>

        {/* Title & Price */}
        <div className="mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-1">{selectedProperty.community}</h2>
            <div className="text-xs text-gray-400 mb-3">ID: {selectedProperty.id}</div>
            <div className="flex items-baseline text-orange-600">
                <span className="text-2xl font-bold">{selectedProperty.price}</span>
                <span className="text-sm ml-1">总价</span>
            </div>
        </div>

        {/* Specs Grid */}
        <div className="grid grid-cols-2 gap-y-4 gap-x-2 mb-6">
            {selectedProperty.specs.map((spec, idx) => (
                <div key={idx} className="flex flex-col">
                    <span className="text-xs text-gray-400 mb-0.5">{spec.label}</span>
                    <span className="text-sm font-medium text-gray-800">{spec.value}</span>
                </div>
            ))}
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-2 mb-6">
            {selectedProperty.tags.map(tag => (
                <span key={tag} className="px-2 py-1 bg-blue-50 text-blue-600 text-xs rounded border border-blue-100">
                    {tag}
                </span>
            ))}
        </div>
        
        {/* Action Buttons */}
        <div className="space-y-3">
             {!isAssessing ? (
                 <button 
                    onClick={() => setIsAssessing(true)}
                    className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 shadow-sm transition-colors"
                 >
                    评估价格
                 </button>
             ) : (
                 <div className="flex space-x-2">
                    <input 
                        type="text" 
                        value={assessPrice}
                        onChange={(e) => setAssessPrice(e.target.value)}
                        placeholder="输入评估价(万)"
                        className="flex-1 px-3 py-2 border border-blue-500 rounded-lg text-sm outline-none shadow-sm"
                        autoFocus
                    />
                    <button 
                        onClick={handleConfirmAssessment}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 shadow-sm transition-colors"
                    >
                        确定
                    </button>
                    <button 
                        onClick={() => setIsAssessing(false)}
                        className="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
                    >
                        取消
                    </button>
                 </div>
             )}
             
             <button className="w-full py-2 bg-white border border-gray-200 text-gray-500 rounded-lg text-sm font-medium hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-colors">
                放弃
             </button>
        </div>

      </div>
      
      {/* Footer / Agent info */}
      <div className="mt-auto p-6 border-t border-gray-50 bg-gray-50/50">
        <div className="flex items-center">
             <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold">
                 Admin
             </div>
             <div className="ml-3">
                 <div className="text-sm font-medium text-gray-900">当前跟进人</div>
                 <div className="text-xs text-gray-500">张经理</div>
             </div>
        </div>
      </div>
    </div>
  );
}