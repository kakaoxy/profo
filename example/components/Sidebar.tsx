
import React, { useState } from 'react';
import { 
  IconChevronDown, 
  IconChevronRight, 
  LogoSemi,
  IconBuilding,
  IconUsers,
  IconBriefcase,
  IconList,
  IconChart,
  IconShield,
  IconSearch
} from './Icons';

export default function Sidebar() {
  const [expandedProperty, setExpandedProperty] = useState(true);
  const [expandedUser, setExpandedUser] = useState(false);

  const menuItemClass = "flex items-center px-4 py-2.5 text-sm font-medium rounded-lg cursor-pointer transition-colors";
  const activeClass = "bg-blue-50 text-blue-600";
  const inactiveClass = "text-gray-600 hover:bg-gray-100";
  const subMenuClass = "flex items-center px-4 py-2 text-sm transition-colors rounded-lg cursor-pointer";
  const subMenuActive = "text-blue-600 bg-blue-50 font-medium";
  const subMenuInactive = "text-gray-500 hover:text-gray-800 hover:bg-gray-50";

  return (
    <div className="w-64 bg-white border-r border-gray-100 flex flex-col h-full flex-shrink-0">
      {/* Header */}
      <div className="h-16 flex items-center px-6 border-b border-gray-50">
        <LogoSemi />
        <span className="ml-3 font-bold text-gray-800 text-lg tracking-tight">RealEstate</span>
      </div>

      {/* Search */}
      <div className="px-5 py-4">
        <div className="relative">
          <IconSearch className="absolute left-3 top-2.5 text-gray-400 w-4 h-4" />
          <input 
            type="text" 
            placeholder="搜索功能或房源" 
            className="w-full pl-9 pr-4 py-1.5 bg-gray-50 border border-transparent focus:bg-white focus:border-blue-500 rounded-md text-sm outline-none transition-all placeholder-gray-400"
          />
        </div>
      </div>

      {/* Scrollable Menu */}
      <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-2">
        
        {/* Group 1: Property Management */}
        <div>
          <div 
            className={`flex items-center px-4 py-2.5 text-sm font-medium rounded-lg cursor-pointer transition-colors ${expandedProperty ? 'text-gray-900' : 'text-gray-600 hover:bg-gray-100'}`}
            onClick={() => setExpandedProperty(!expandedProperty)}
          >
            {expandedProperty ? <IconChevronDown className="w-3.5 h-3.5 mr-3 text-gray-400" /> : <IconChevronRight className="w-3.5 h-3.5 mr-3 text-gray-400" />}
            <IconBuilding className="w-5 h-5 mr-3 text-blue-600" />
            <span>房源管理</span>
          </div>

          {expandedProperty && (
            <div className="pl-6 mt-1 space-y-1">
              <div className={`${subMenuClass} ${subMenuActive}`}>
                <div className="w-1.5 h-1.5 rounded-full bg-blue-600 mr-3"></div>
                房源列表
              </div>
              <div className={`${subMenuClass} ${subMenuInactive}`}>
                <div className="w-1.5 h-1.5 rounded-full bg-transparent mr-3"></div>
                数据治理
              </div>
              <div className={`${subMenuClass} ${subMenuInactive}`}>
                <div className="w-1.5 h-1.5 rounded-full bg-transparent mr-3"></div>
                房源上传
              </div>
            </div>
          )}
        </div>

        {/* Group 2: Project Management */}
        <div className={`${menuItemClass} ${inactiveClass}`}>
          <div className="w-3.5 mr-3"></div> {/* Spacer for alignment */}
          <IconBriefcase className="w-5 h-5 mr-3 text-teal-600" />
          <span>项目管理</span>
        </div>

        {/* Group 3: User Management */}
        <div>
          <div 
            className={`flex items-center px-4 py-2.5 text-sm font-medium rounded-lg cursor-pointer transition-colors ${expandedUser ? 'text-gray-900' : 'text-gray-600 hover:bg-gray-100'}`}
            onClick={() => setExpandedUser(!expandedUser)}
          >
            {expandedUser ? <IconChevronDown className="w-3.5 h-3.5 mr-3 text-gray-400" /> : <IconChevronRight className="w-3.5 h-3.5 mr-3 text-gray-400" />}
            <IconUsers className="w-5 h-5 mr-3 text-purple-600" />
            <span>用户管理</span>
          </div>

          {expandedUser && (
            <div className="pl-6 mt-1 space-y-1">
              <div className={`${subMenuClass} ${subMenuInactive}`}>
                 <div className="w-1.5 h-1.5 rounded-full bg-transparent mr-3"></div>
                用户列表
              </div>
              <div className={`${subMenuClass} ${subMenuInactive}`}>
                 <div className="w-1.5 h-1.5 rounded-full bg-transparent mr-3"></div>
                权限管理
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Footer Info */}
      <div className="p-4 border-t border-gray-100 text-xs text-gray-400 text-center">
        v2.4.0 System
      </div>
    </div>
  );
}