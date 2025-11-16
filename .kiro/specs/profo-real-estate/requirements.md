# Requirements Document

## Introduction

Profo 房产数据中心是一个轻量级、本地化、高性能的房产数据仓库系统。该系统允许用户通过标准化的 CSV 文件或 API 接口，将来自不同渠道的房源数据（包括在售与成交）汇集到统一的本地 SQLite 数据库中。系统提供数据清洗、校验、查询、筛选、导出和数据治理的全流程功能。

## Glossary

- **System**: Profo 房产数据中心系统
- **User**: 使用系统的房产数据分析人员或管理员
- **Property**: 房源，包含在售和成交两种状态的房产信息
- **Community**: 小区，房源所属的住宅小区
- **Data Source**: 数据来源平台（如链家、贝壳等）
- **CSV Upload**: 通过 CSV 文件批量导入房源数据的功能
- **API Push**: 通过 JSON API 接口推送房源数据的功能
- **Failed Record**: 校验失败的数据记录，存储在隔离表中
- **Virtual Scrolling**: 虚拟滚动技术，用于高效渲染大量数据列表
- **Community Merge**: 小区合并功能，用于数据治理

## Requirements

### Requirement 1: 快速部署与启动

**User Story:** 作为工程师，我希望能够在 10 分钟内完成本地环境搭建与一键启动，以便快速开始使用系统。

#### Acceptance Criteria

1. WHEN the User executes the installation commands, THE System SHALL complete all dependency installations within 5 minutes
2. WHEN the User runs the startup script (start.bat or start.sh), THE System SHALL start both backend and frontend services simultaneously
3. THE System SHALL display the backend service URL (http://localhost:8000) and frontend service URL (http://localhost:3000) in the console
4. WHEN both services are running, THE System SHALL respond to health check requests within 2 seconds
5. WHERE the User presses Ctrl+C, THE System SHALL gracefully terminate all background processes

### Requirement 2: CSV 文件数据导入

**User Story:** 作为用户，我希望能够上传 CSV 文件批量导入房源数据，以便将外部数据快速导入系统。

#### Acceptance Criteria

1. WHEN the User uploads a CSV file via the upload interface, THE System SHALL validate the file format before processing
2. WHEN the CSV file contains valid data rows, THE System SHALL parse each row using the PropertyIngestionModel schema
3. IF a data row fails Pydantic validation, THEN THE System SHALL store the original row and error message in the failed_records table
4. WHEN a data row passes validation, THE System SHALL check if the Community exists by community_name
5. IF the Community does not exist, THEN THE System SHALL create a new Community record and obtain the community_id
6. WHEN the System processes a validated Property, THE System SHALL check for existing records using (data_source, source_property_id) as the unique key
7. IF the Property already exists, THEN THE System SHALL copy the current record to property_history table and update the property_current table with new data
8. IF the Property does not exist, THEN THE System SHALL parse the floor_original field, calculate the floor_level, and create a new record in property_current table
9. WHEN the upload completes, THE System SHALL return a summary with total count, success count, and failure count
10. WHERE upload failures occur, THE System SHALL provide a downloadable CSV file containing all failed records with error reasons

### Requirement 3: JSON API 数据推送

**User Story:** 作为外部系统，我希望能够通过 JSON API 推送房源数据，以便实现自动化数据集成。

#### Acceptance Criteria

1. WHEN an external system sends a POST request to /api/push with a JSON array, THE System SHALL validate each property object using PropertyIngestionModel
2. THE System SHALL apply the same validation and processing logic as CSV upload for each property in the array
3. WHEN validation fails for any property, THE System SHALL store the failed record in the failed_records table without interrupting the processing of other properties
4. WHEN the push completes, THE System SHALL return a JSON response with processing statistics including total, success, and failure counts
5. THE System SHALL complete the processing of 1000 property records within 30 seconds

### Requirement 4: 房源数据查询与筛选

**User Story:** 作为用户，我希望能够通过多维度条件筛选房源数据，以便快速找到符合条件的房源。

#### Acceptance Criteria

1. THE System SHALL provide filter options for property status (全部/在售/成交)
2. THE System SHALL provide a text input filter for community_name with partial matching support
3. THE System SHALL provide a dual-slider range filter for total price (listed_price_wan or sold_price_wan) from 0 to 20000 万
4. THE System SHALL provide a dual-slider range filter for build_area from 0 to 300 square meters
5. THE System SHALL provide a multi-select dropdown filter for room types (rooms field)
6. WHEN the User changes any filter condition, THE System SHALL automatically trigger a new API request to fetch filtered results
7. THE System SHALL support sorting by any column in ascending or descending order
8. THE System SHALL implement pagination with configurable page size
9. WHEN the query returns more than 100 records, THE System SHALL use virtual scrolling to render the list efficiently
10. THE System SHALL display calculated fields including unit_price (total_price / build_area) and transaction_duration_days for sold properties

### Requirement 5: 房源数据导出

**User Story:** 作为用户，我希望能够导出当前筛选视图的数据为 CSV 文件，以便进行离线分析。

#### Acceptance Criteria

1. WHEN the User clicks the export button, THE System SHALL use the same filter and sort parameters as the current list view
2. THE System SHALL generate a CSV file containing all matching records without pagination limits
3. THE System SHALL include all property fields in the exported CSV file
4. THE System SHALL trigger a browser download with a filename containing the export timestamp
5. THE System SHALL complete the export of 10000 records within 10 seconds

### Requirement 6: 房源详情查看

**User Story:** 作为用户，我希望能够查看单个房源的完整详细信息，以便了解房源的所有属性。

#### Acceptance Criteria

1. WHEN the User clicks the "查看" button in the property list, THE System SHALL open a modal dialog
2. THE System SHALL display all non-null fields of the selected property in the modal
3. THE System SHALL organize the information into logical sections (基础信息, 价格与时间, etc.)
4. THE System SHALL display the data_source and source_property_id for traceability
5. WHEN the User clicks the close button or presses ESC, THE System SHALL close the modal dialog

### Requirement 7: 小区数据治理

**User Story:** 作为管理员，我希望能够合并重复的小区记录，以便提升数据质量和统计准确性。

#### Acceptance Criteria

1. THE System SHALL provide a search interface to find communities by name with partial matching
2. WHEN the User searches for a community name, THE System SHALL display matching communities with their IDs and property counts
3. THE System SHALL allow the User to select multiple communities (minimum 2) for merging
4. WHEN communities are selected, THE System SHALL require the User to designate one as the primary record
5. WHEN the User confirms the merge operation, THE System SHALL display a warning dialog showing the number of properties that will be affected
6. IF the User confirms the merge, THEN THE System SHALL store the merged community names as aliases in the community_aliases table
7. THE System SHALL update all properties associated with merged communities to reference the primary community_id
8. THE System SHALL soft-delete the merged community records by setting appropriate flags
9. THE System SHALL complete the merge operation within 5 seconds for up to 1000 affected properties
10. WHEN the merge completes, THE System SHALL display a success message with the number of properties updated

### Requirement 8: 数据完整性与校验

**User Story:** 作为系统管理员，我希望系统能够严格校验所有输入数据，以便确保数据库中的数据质量。

#### Acceptance Criteria

1. THE System SHALL enforce that all properties have required fields: data_source, source_property_id, status, community_name, rooms, orientation, floor_original, and build_area
2. WHEN the status is "在售", THE System SHALL require listed_price_wan and listed_date to be non-null
3. WHEN the status is "成交", THE System SHALL require sold_price_wan and sold_date to be non-null
4. THE System SHALL validate that numeric fields (prices, areas) are greater than zero
5. THE System SHALL automatically trim whitespace from all string fields before validation
6. IF any validation rule fails, THEN THE System SHALL reject the record and store it in failed_records with a descriptive error message
7. THE System SHALL enforce uniqueness constraint on (data_source, source_property_id) in the property_current table
8. THE System SHALL prevent duplicate community names in the communities table

### Requirement 9: 楼层智能解析

**User Story:** 作为用户，我希望系统能够自动解析楼层信息并计算楼层级别，以便更好地筛选和分析房源。

#### Acceptance Criteria

1. WHEN the System receives a floor_original value (e.g., "高楼层/18", "15/28"), THE System SHALL extract the floor_number and total_floors
2. THE System SHALL calculate floor_level as "低楼层" when floor_number / total_floors <= 0.33
3. THE System SHALL calculate floor_level as "中楼层" when 0.33 < floor_number / total_floors <= 0.67
4. THE System SHALL calculate floor_level as "高楼层" when floor_number / total_floors > 0.67
5. IF the floor_original cannot be parsed, THEN THE System SHALL leave floor_number, total_floors, and floor_level as null without failing the entire record

### Requirement 10: 历史数据追踪

**User Story:** 作为数据分析师，我希望系统能够保留房源的历史变更记录，以便分析价格变化趋势。

#### Acceptance Criteria

1. WHEN an existing property is updated, THE System SHALL create a snapshot of the current state in the property_history table before applying updates
2. THE System SHALL record the change_type (price_change, status_change, or info_change) in the history record
3. THE System SHALL store the captured_at timestamp with second-level precision
4. THE System SHALL preserve the original listed_price_wan and sold_price_wan values in the history record
5. THE System SHALL maintain an index on (data_source, source_property_id, captured_at) for efficient history queries

### Requirement 11: 前端响应式设计

**User Story:** 作为用户，我希望界面能够快速响应我的操作，以便流畅地浏览和筛选数据。

#### Acceptance Criteria

1. WHEN the User changes a filter condition, THE System SHALL debounce the API request by 300 milliseconds to avoid excessive requests
2. THE System SHALL display a loading indicator when fetching data from the API
3. WHEN the API returns data, THE System SHALL update the list view within 100 milliseconds
4. THE System SHALL use virtual scrolling to render only visible rows plus a buffer zone
5. WHEN the User scrolls the list, THE System SHALL maintain smooth 60 FPS rendering performance
6. THE System SHALL store filter and sort preferences in Pinia store for state management
7. THE System SHALL persist the current page number when navigating between views

### Requirement 12: 错误处理与用户反馈

**User Story:** 作为用户，我希望在操作失败时能够看到清晰的错误提示，以便了解问题并采取相应措施。

#### Acceptance Criteria

1. WHEN a file upload fails due to invalid format, THE System SHALL display an error message indicating the expected format
2. WHEN the API returns an error response, THE System SHALL display the error message in a toast notification
3. WHEN the database connection fails, THE System SHALL log the error and return a 503 Service Unavailable response
4. THE System SHALL provide user-friendly error messages in Chinese without exposing technical stack traces
5. WHEN validation errors occur during data import, THE System SHALL include the row number and field name in the error message
