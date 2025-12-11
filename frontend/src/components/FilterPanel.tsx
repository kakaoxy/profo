'use client';

import React, { useState, useEffect } from 'react';
import { Input, Button, Tag, AutoComplete } from '@douyinfe/semi-ui';
import { FilterState } from '@/types/property';

interface FilterPanelProps {
  filters: FilterState;
  onFilterChange: (filters: Partial<FilterState>) => void;
}

export default function FilterPanel({ filters, onFilterChange }: FilterPanelProps) {
  const [communitySearch, setCommunitySearch] = useState('');
  const [districtSearch, setDistrictSearch] = useState('');
  const [businessCircleSearch, setBusinessCircleSearch] = useState('');
  const [districtSuggestions, setDistrictSuggestions] = useState<string[]>([]);
  const [businessCircleSuggestions, setBusinessCircleSuggestions] = useState<string[]>([]);

  // 模拟区域和商圈建议数据
  useEffect(() => {
    const mockDistricts = ['朝阳', '海淀', '东城', '西城', '丰台', '石景山', '通州', '昌平'];
    const mockBusinessCircles = ['望京', '中关村', '国贸', '三里屯', '亚运村', 'CBD', '金融街', '王府井'];

    if (districtSearch) {
      const filtered = mockDistricts.filter(d => d.includes(districtSearch));
      setDistrictSuggestions(filtered);
    } else {
      setDistrictSuggestions([]);
    }

    if (businessCircleSearch) {
      const filtered = mockBusinessCircles.filter(b => b.includes(businessCircleSearch));
      setBusinessCircleSuggestions(filtered);
    } else {
      setBusinessCircleSuggestions([]);
    }
  }, [districtSearch, businessCircleSearch]);

  const handleStatusChange = (status: string) => {
    onFilterChange({ status: filters.status === status ? '' : status });
  };

  const handleRoomsChange = (room: number) => {
    const newRooms = filters.rooms.includes(room)
      ? filters.rooms.filter(r => r !== room)
      : [...filters.rooms, room];
    onFilterChange({ rooms: newRooms });
  };

  const handleFloorTypeChange = (floorType: string) => {
    const newFloorTypes = filters.floor_type.includes(floorType)
      ? filters.floor_type.filter(f => f !== floorType)
      : [...filters.floor_type, floorType];
    onFilterChange({ floor_type: newFloorTypes });
  };

  const handleDistrictSelect = (value: string) => {
    if (value && !filters.district.includes(value)) {
      onFilterChange({ district: [...filters.district, value] });
      setDistrictSearch('');
    }
  };

  const handleBusinessCircleSelect = (value: string) => {
    if (value && !filters.business_circle.includes(value)) {
      onFilterChange({ business_circle: [...filters.business_circle, value] });
      setBusinessCircleSearch('');
    }
  };

  const removeTag = (type: 'district' | 'business_circle', value: string) => {
    if (type === 'district') {
      onFilterChange({ district: filters.district.filter(d => d !== value) });
    } else {
      onFilterChange({ business_circle: filters.business_circle.filter(b => b !== value) });
    }
  };

  const clearAllFilters = () => {
    onFilterChange({
      status: '',
      community_name: '',
      rooms: [],
      floor_type: [],
      min_price: null,
      max_price: null,
      min_area: null,
      max_area: null,
      district: [],
      business_circle: []
    });
    setCommunitySearch('');
    setDistrictSearch('');
    setBusinessCircleSearch('');
  };

  const roomOptions = [1, 2, 3, 4, 5];
  const floorTypeOptions = ['低楼层', '中楼层', '高楼层'];

  return (
    <div className="space-y-6">
      {/* 状态筛选 */}
      <div>
        <h3 className="text-sm font-medium text-gray-900 mb-3">状态</h3>
        <div className="flex gap-2">
          {['', '在售', '成交'].map(status => (
            <Button
              key={status}
              size="small"
              type={filters.status === status ? 'primary' : 'secondary'}
              onClick={() => handleStatusChange(status)}
            >
              {status === '' ? '全部' : status}
            </Button>
          ))}
        </div>
      </div>

      {/* 小区名搜索 */}
      <div>
        <h3 className="text-sm font-medium text-gray-900 mb-3">小区名</h3>
        <Input
          placeholder="输入小区名称"
          value={communitySearch}
          onChange={setCommunitySearch}
          onBlur={() => onFilterChange({ community_name: communitySearch })}
          onEnterPress={() => onFilterChange({ community_name: communitySearch })}
        />
      </div>

      {/* 户型筛选 */}
      <div>
        <h3 className="text-sm font-medium text-gray-900 mb-3">户型(室)</h3>
        <div className="flex flex-wrap gap-2">
          {roomOptions.map(room => (
            <Button
              key={room}
              size="small"
              type={filters.rooms.includes(room) ? 'primary' : 'secondary'}
              onClick={() => handleRoomsChange(room)}
            >
              {room}室
            </Button>
          ))}
          <Button
            size="small"
            type={filters.rooms.includes(6) ? 'primary' : 'secondary'}
            onClick={() => handleRoomsChange(6)}
          >
            5室+
          </Button>
        </div>
      </div>

      {/* 楼层筛选 */}
      <div>
        <h3 className="text-sm font-medium text-gray-900 mb-3">楼层</h3>
        <div className="flex flex-wrap gap-2">
          {floorTypeOptions.map(floorType => (
            <Button
              key={floorType}
              size="small"
              type={filters.floor_type.includes(floorType) ? 'primary' : 'secondary'}
              onClick={() => handleFloorTypeChange(floorType)}
            >
              {floorType}
            </Button>
          ))}
        </div>
      </div>

      {/* 价格范围 */}
      <div>
        <h3 className="text-sm font-medium text-gray-900 mb-3">价格范围(万)</h3>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            placeholder="最低价"
            value={filters.min_price?.toString() || ''}
            onChange={(value) => onFilterChange({ min_price: value ? parseFloat(value) : null })}
            style={{ width: '45%' }}
          />
          <span className="text-gray-400">-</span>
          <Input
            type="number"
            placeholder="最高价"
            value={filters.max_price?.toString() || ''}
            onChange={(value) => onFilterChange({ max_price: value ? parseFloat(value) : null })}
            style={{ width: '45%' }}
          />
        </div>
      </div>

      {/* 面积范围 */}
      <div>
        <h3 className="text-sm font-medium text-gray-900 mb-3">面积范围(㎡)</h3>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            placeholder="最小面积"
            value={filters.min_area?.toString() || ''}
            onChange={(value) => onFilterChange({ min_area: value ? parseFloat(value) : null })}
            style={{ width: '45%' }}
          />
          <span className="text-gray-400">-</span>
          <Input
            type="number"
            placeholder="最大面积"
            value={filters.max_area?.toString() || ''}
            onChange={(value) => onFilterChange({ max_area: value ? parseFloat(value) : null })}
            style={{ width: '45%' }}
          />
        </div>
      </div>

      {/* 区域/商圈 */}
      <div>
        <h3 className="text-sm font-medium text-gray-900 mb-3">区域/商圈</h3>
        <div className="space-y-3">
          <AutoComplete
            placeholder="输入行政区"
            data={districtSuggestions}
            value={districtSearch}
            onChange={(value: any) => setDistrictSearch(value.toString())}
            onSelect={handleDistrictSelect}
            style={{ width: '100%' }}
          />
          <AutoComplete
            placeholder="输入商圈"
            data={businessCircleSuggestions}
            value={businessCircleSearch}
            onChange={(value: any) => setBusinessCircleSearch(value.toString())}
            onSelect={handleBusinessCircleSelect}
            style={{ width: '100%' }}
          />
        </div>
      </div>

      {/* 已选标签 */}
      {(filters.district.length > 0 || filters.business_circle.length > 0) && (
        <div>
          <h3 className="text-sm font-medium text-gray-900 mb-3">已选标签</h3>
          <div className="space-y-2">
            {filters.district.length > 0 && (
              <div>
                <div className="text-xs text-gray-500 mb-1">行政区:</div>
                <div className="flex flex-wrap gap-1">
                  {filters.district.map(district => (
                    <Tag
                      key={district}
                      closable
                      onClose={() => removeTag('district', district)}
                    >
                      {district}
                    </Tag>
                  ))}
                </div>
              </div>
            )}
            {filters.business_circle.length > 0 && (
              <div>
                <div className="text-xs text-gray-500 mb-1">商圈:</div>
                <div className="flex flex-wrap gap-1">
                  {filters.business_circle.map(circle => (
                    <Tag
                      key={circle}
                      closable
                      onClose={() => removeTag('business_circle', circle)}
                    >
                      {circle}
                    </Tag>
                  ))}
                </div>
              </div>
            )}
            <Button
              size="small"
              type="tertiary"
              onClick={() => {
                onFilterChange({ district: [], business_circle: [] });
                setDistrictSearch('');
                setBusinessCircleSearch('');
              }}
            >
              清除全部
            </Button>
          </div>
        </div>
      )}

      {/* 重置筛选 */}
      <div className="pt-4 border-t border-gray-100">
        <Button
          type="tertiary"
          block
          onClick={clearAllFilters}
        >
          重置筛选
        </Button>
      </div>
    </div>
  );
}