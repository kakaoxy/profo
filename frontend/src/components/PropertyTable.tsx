'use client';

import React, { useState } from 'react';
import { Table, Button, Modal, Image } from '@douyinfe/semi-ui';
import { Property, SortState } from '@/types/property';

interface PropertyTableProps {
  data: Property[];
  loading: boolean;
  onSort: (sort: SortState) => void;
}

export default function PropertyTable({ data, loading, onSort }: PropertyTableProps) {
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  const handleViewDetail = (property: Property) => {
    setSelectedProperty(property);
    setDetailModalVisible(true);
  };

  const handleSort = (field: string) => {
    onSort({ field, order: 'asc' }); // 简化处理，实际应该切换asc/desc
  };

  const columns = [
    {
      title: '房源ID',
      dataIndex: 'source_property_id',
      width: 120,
      sorter: true,
      onHeaderCell: () => ({
        onClick: () => handleSort('source_property_id')
      })
    },
    {
      title: '户型图',
      dataIndex: 'images',
      width: 80,
      render: (images: string[]) => {
        if (images && images.length > 0) {
          return (
            <div className="w-12 h-12 rounded bg-gray-100 overflow-hidden border border-gray-200">
              <Image 
                src={images[0]} 
                alt="户型图"
                width={48}
                height={48}
                className="object-cover"
              />
            </div>
          );
        }
        return <div className="w-12 h-12 rounded bg-gray-100 border border-gray-200" />;
      }
    },
    {
      title: '小区',
      dataIndex: 'community_name',
      width: 150,
      ellipsis: true,
      sorter: true,
      onHeaderCell: () => ({
        onClick: () => handleSort('community_name')
      })
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 80,
      render: (status: string) => (
        <span className={`text-xs px-2 py-1 rounded ${
          status === '在售' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
        }`}>
          {status}
        </span>
      )
    },
    {
      title: '区域',
      dataIndex: 'district',
      width: 100,
      render: (district: string) => district || '-'
    },
    {
      title: '商圈',
      dataIndex: 'business_circle',
      width: 100,
      render: (circle: string) => circle || '-'
    },
    {
      title: '户型',
      dataIndex: 'rooms',
      width: 80,
      render: (rooms: number, record: Property) => {
        const halls = record.halls || 0;
        const bathrooms = record.bathrooms || 0;
        return `${rooms}室${halls}厅${bathrooms}卫`;
      }
    },
    {
      title: '朝向',
      dataIndex: 'orientation',
      width: 80
    },
    {
      title: '楼层',
      dataIndex: 'floor_info',
      width: 100,
      render: (floorInfo: string) => floorInfo || '-'
    },
    {
      title: '面积(㎡)',
      dataIndex: 'area',
      width: 100,
      sorter: true,
      onHeaderCell: () => ({
        onClick: () => handleSort('area')
      })
    },
    {
      title: '总价(万)',
      dataIndex: 'list_price',
      width: 100,
      render: (price: number, record: Property) => {
        const displayPrice = record.status === '在售' ? price : record.sold_price;
        return displayPrice ? `${displayPrice}万` : '-';
      },
      sorter: true,
      onHeaderCell: () => ({
        onClick: () => handleSort('list_price')
      })
    },
    {
      title: '单价(元/㎡)',
      dataIndex: 'unit_price',
      width: 120,
      render: (_: any, record: Property) => {
        const price = record.status === '在售' ? record.list_price : record.sold_price;
        if (price && record.area) {
          const unitPrice = (price * 10000) / record.area;
          return `${Math.round(unitPrice).toLocaleString()}元/㎡`;
        }
        return '-';
      }
    },
    {
      title: '挂牌/成交时间',
      dataIndex: 'list_date',
      width: 150,
      render: (date: string, record: Property) => {
        const displayDate = record.status === '在售' ? record.list_date : record.sold_date;
        return displayDate ? new Date(displayDate).toLocaleDateString() : '-';
      },
      sorter: true,
      onHeaderCell: () => ({
        onClick: () => handleSort('list_date')
      })
    },
    {
      title: '数据源',
      dataIndex: 'data_source',
      width: 100
    },
    {
      title: '操作',
      dataIndex: 'operate',
      width: 80,
      fixed: 'right' as const,
      render: (_: any, record: Property) => (
        <Button
          size="small"
          type="primary"
          onClick={() => handleViewDetail(record)}
        >
          查看
        </Button>
      )
    }
  ];

  return (
    <>
      <Table
        columns={columns}
        dataSource={data}
        loading={loading}
        pagination={false}
        virtualized
        scroll={{ y: 600 }}
        rowKey="id"
        size="small"
      />

      {/* 详情模态框 */}
      <Modal
        title="房源详情"
        visible={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={null}
        width={800}
      >
        {selectedProperty && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-gray-500">房源ID:</span>
                <span className="ml-2">{selectedProperty.source_property_id}</span>
              </div>
              <div>
                <span className="text-gray-500">状态:</span>
                <span className="ml-2">{selectedProperty.status}</span>
              </div>
              <div>
                <span className="text-gray-500">小区:</span>
                <span className="ml-2">{selectedProperty.community_name}</span>
              </div>
              <div>
                <span className="text-gray-500">区域:</span>
                <span className="ml-2">{selectedProperty.district || '-'}</span>
              </div>
              <div>
                <span className="text-gray-500">商圈:</span>
                <span className="ml-2">{selectedProperty.business_circle || '-'}</span>
              </div>
              <div>
                <span className="text-gray-500">户型:</span>
                <span className="ml-2">
                  {selectedProperty.rooms}室{selectedProperty.halls || 0}厅{selectedProperty.bathrooms || 0}卫
                </span>
              </div>
              <div>
                <span className="text-gray-500">朝向:</span>
                <span className="ml-2">{selectedProperty.orientation}</span>
              </div>
              <div>
                <span className="text-gray-500">楼层:</span>
                <span className="ml-2">{selectedProperty.floor_info}</span>
              </div>
              <div>
                <span className="text-gray-500">面积:</span>
                <span className="ml-2">{selectedProperty.area}㎡</span>
              </div>
              <div>
                <span className="text-gray-500">总价:</span>
                <span className="ml-2">
                  {selectedProperty.status === '在售' 
                    ? `${selectedProperty.list_price}万` 
                    : `${selectedProperty.sold_price}万`}
                </span>
              </div>
            </div>
            
            {selectedProperty.images && selectedProperty.images.length > 0 && (
              <div>
                <h4 className="font-medium mb-2">房源图片</h4>
                <div className="grid grid-cols-4 gap-2">
                  {selectedProperty.images.map((img, index) => (
                    <Image
                      key={index}
                      src={img}
                      alt={`房源图片${index + 1}`}
                      width={150}
                      height={150}
                      className="rounded object-cover"
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}