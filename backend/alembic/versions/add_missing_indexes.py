"""添加缺失的数据库索引

Revision ID: 20231208_add_missing_indexes
Revises: 
Create Date: 2023-12-08 10:48:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '20231208_add_missing_indexes'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # PropertyCurrent 表索引
    op.create_index('idx_price_range', 'property_current', ['listed_price_wan', 'sold_price_wan'])
    op.create_index('idx_area_range', 'property_current', ['build_area'])
    op.create_index('idx_rooms', 'property_current', ['rooms'])
    op.create_index('idx_floor_info', 'property_current', ['floor_level', 'floor_number'])
    op.create_index('idx_dates', 'property_current', ['listed_date', 'sold_date', 'updated_at'])
    op.create_index('idx_build_year', 'property_current', ['build_year'])
    op.create_index('idx_property_type', 'property_current', ['property_type'])
    op.create_index('idx_orientation', 'property_current', ['orientation'])
    
    # Community 表索引
    op.create_index('idx_community_location', 'communities', ['district', 'business_circle'])
    op.create_index('idx_community_price_avg', 'communities', ['avg_price_wan'])
    op.create_index('idx_community_active', 'communities', ['is_active'])
    
    # Project 表索引
    op.create_index('idx_project_status', 'projects', ['status'])
    op.create_index('idx_project_dates', 'projects', ['signing_date', 'sold_at', 'status_changed_at'])
    op.create_index('idx_project_price', 'projects', ['signing_price', 'sale_price'])
    op.create_index('idx_project_manager', 'projects', ['manager'])
    
    # User 表索引
    op.create_index('idx_user_status', 'users', ['status'])
    op.create_index('idx_user_phone', 'users', ['phone'])
    op.create_index('idx_user_wechat', 'users', ['wechat_openid', 'wechat_unionid'])
    
    # CashFlowRecord 表索引
    op.create_index('idx_cashflow_project_date', 'cashflow_records', ['project_id', 'date'])
    op.create_index('idx_cashflow_type_category', 'cashflow_records', ['type', 'category'])
    
    # SalesRecord 表索引
    op.create_index('idx_sales_project_date', 'sales_records', ['project_id', 'record_date'])
    op.create_index('idx_sales_type', 'sales_records', ['record_type'])


def downgrade() -> None:
    # PropertyCurrent 表索引
    op.drop_index('idx_price_range', 'property_current')
    op.drop_index('idx_area_range', 'property_current')
    op.drop_index('idx_rooms', 'property_current')
    op.drop_index('idx_floor_info', 'property_current')
    op.drop_index('idx_dates', 'property_current')
    op.drop_index('idx_build_year', 'property_current')
    op.drop_index('idx_property_type', 'property_current')
    op.drop_index('idx_orientation', 'property_current')
    
    # Community 表索引
    op.drop_index('idx_community_location', 'communities')
    op.drop_index('idx_community_price_avg', 'communities')
    op.drop_index('idx_community_active', 'communities')
    
    # Project 表索引
    op.drop_index('idx_project_status', 'projects')
    op.drop_index('idx_project_dates', 'projects')
    op.drop_index('idx_project_price', 'projects')
    op.drop_index('idx_project_manager', 'projects')
    
    # User 表索引
    op.drop_index('idx_user_status', 'users')
    op.drop_index('idx_user_phone', 'users')
    op.drop_index('idx_user_wechat', 'users')
    
    # CashFlowRecord 表索引
    op.drop_index('idx_cashflow_project_date', 'cashflow_records')
    op.drop_index('idx_cashflow_type_category', 'cashflow_records')
    
    # SalesRecord 表索引
    op.drop_index('idx_sales_project_date', 'sales_records')
    op.drop_index('idx_sales_type', 'sales_records')