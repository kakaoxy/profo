'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Tooltip, Popover } from '@douyinfe/semi-ui';
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
  IconSearch,
  IconHome
} from './Icons';

export default function Sidebar() {
  const router = useRouter();
  const [expandedProperty, setExpandedProperty] = useState(true);
  const [expandedUser, setExpandedUser] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const menuItemClass = "flex items-center px-4 py-2.5 text-sm font-medium rounded-lg cursor-pointer transition-colors";
  const activeClass = "bg-blue-50 text-blue-600";
  const inactiveClass = "text-gray-600 hover:bg-gray-100";
  const subMenuClass = "flex items-center px-4 py-2 text-sm transition-colors rounded-lg cursor-pointer";
  const subMenuActive = "text-blue-600 bg-blue-50 font-medium";
  const subMenuInactive = "text-gray-500 hover:text-gray-800 hover:bg-gray-50";

  return (
    <div className={`${isCollapsed ? 'w-16' : 'w-64'} bg-white border-r border-gray-100 flex flex-col h-full shrink-0 transition-all duration-300`}>
      {/* Header */}
      <div className="h-16 flex items-center px-4 border-b border-gray-50">
        <LogoSemi />
        {!isCollapsed && (
          <span className="ml-3 font-bold text-gray-800 text-lg tracking-tight">RealEstate</span>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="ml-auto p-1 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <IconChevronRight className={`w-4 h-4 text-gray-400 transition-transform duration-300 ${isCollapsed ? 'rotate-180' : ''}`} />
        </button>
      </div>


      {/* Scrollable Menu */}
      <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-2">
        
        {/* Workbench - 工作台 */}
        {isCollapsed ? (
          <Tooltip content="工作台" position="right">
            <div
              className={`${menuItemClass} ${inactiveClass} justify-center`}
              onClick={() => router.push('/dashboard')}
            >
              <IconHome className="w-5 h-5 text-green-600" />
            </div>
          </Tooltip>
        ) : (
          <div
            className={`${menuItemClass} ${inactiveClass}`}
            onClick={() => router.push('/dashboard')}
          >
            <div className="w-3.5 mr-3"></div>
            <IconHome className="w-5 h-5 mr-3 text-green-600" />
            <span>工作台</span>
          </div>
        )}

        {/* Group 1: Property Management */}
        {isCollapsed ? (
          <Popover
            content={
              <div className="py-2">
                <div
                  className={`${subMenuClass} ${subMenuActive} px-4`}
                  onClick={() => router.push('/properties')}
                  style={{ cursor: 'pointer' }}
                >
                  房源列表
                </div>
                <div className={`${subMenuClass} ${subMenuInactive} px-4`}>
                  数据治理
                </div>
                <div className={`${subMenuClass} ${subMenuInactive} px-4`}>
                  房源上传
                </div>
              </div>
            }
            position="rightTop"
            trigger="click"
          >
            <div className={`flex items-center justify-center px-4 py-2.5 text-sm font-medium rounded-lg cursor-pointer transition-colors text-gray-600 hover:bg-gray-100`}>
              <IconBuilding className="w-5 h-5 text-blue-600" />
            </div>
          </Popover>
        ) : (
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
                <div
                  className={`${subMenuClass} ${subMenuActive}`}
                  onClick={() => router.push('/properties')}
                  style={{ cursor: 'pointer' }}
                >
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
        )}

        {/* Group 2: Project Management */}
        {isCollapsed ? (
          <Tooltip content="项目管理" position="right">
            <div className={`${menuItemClass} ${inactiveClass} justify-center`}>
              <IconBriefcase className="w-5 h-5 text-teal-600" />
            </div>
          </Tooltip>
        ) : (
          <div className={`${menuItemClass} ${inactiveClass}`}>
            <div className="w-3.5 mr-3"></div>
            <IconBriefcase className="w-5 h-5 mr-3 text-teal-600" />
            <span>项目管理</span>
          </div>
        )}

        {/* Group 3: User Management */}
        {isCollapsed ? (
          <Popover
            content={
              <div className="py-2">
                <div className={`${subMenuClass} ${subMenuInactive} px-4`}>
                  用户列表
                </div>
                <div className={`${subMenuClass} ${subMenuInactive} px-4`}>
                  权限管理
                </div>
              </div>
            }
            position="rightTop"
            trigger="click"
          >
            <div className={`flex items-center justify-center px-4 py-2.5 text-sm font-medium rounded-lg cursor-pointer transition-colors text-gray-600 hover:bg-gray-100`}>
              <IconUsers className="w-5 h-5 text-purple-600" />
            </div>
          </Popover>
        ) : (
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
        )}
      </div>
      
      {/* Footer Info */}
      <div className="p-4 border-t border-gray-100 text-xs text-gray-400 text-center">
        {!isCollapsed && <span>v2.4.0 System</span>}
      </div>
    </div>
  );
}