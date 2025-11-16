# Services Layer

This directory contains the core business logic services for the Profo Real Estate Data Center.

## Available Services

### 1. FloorParser (`parser.py`)

Parses floor information from various string formats.

**Key Methods:**
- `parse_floor(floor_original: str) -> FloorInfo`: Parses floor strings like "15/28", "高楼层/18", etc.
- `calculate_floor_level(floor_number: int, total_floors: int) -> str`: Calculates floor level (低/中/高楼层)

**Supported Formats:**
- Standard: "15/28" → floor_number=15, total_floors=28, level="中楼层"
- Chinese level: "高楼层/18" → total_floors=18, level="高楼层"
- With 共: "中楼层/共28层" → total_floors=28, level="中楼层"
- With parentheses: "低楼层(共18层)" → total_floors=18, level="低楼层"

### 2. PropertyImporter (`importer.py`)

Handles property data import, update, and history tracking.

**Key Methods:**

#### `find_or_create_community(name: str, db: Session, ...) -> int`
Finds or creates a community record.

**Logic:**
1. Search in `communities` table by exact name match
2. If not found, search in `community_aliases` table
3. If still not found, create new community record
4. Returns `community_id`

**Example:**
```python
importer = PropertyImporter()
community_id = importer.find_or_create_community("测试小区", db)
```

#### `create_history_snapshot(property_obj: PropertyCurrent, change_type: ChangeType, db: Session)`
Creates a historical snapshot of the current property state.

**Purpose:**
- Tracks price changes
- Tracks status changes (在售 → 成交)
- Tracks other information changes

**Example:**
```python
importer.create_history_snapshot(
    property_obj=existing_property,
    change_type=ChangeType.PRICE_CHANGE,
    db=db
)
```

#### `import_property(data: PropertyIngestionModel, db: Session) -> ImportResult`
Core import logic for a single property.

**Workflow:**
1. Find or create community using `find_or_create_community()`
2. Check if property exists by `(data_source, source_property_id)`
3. **If exists:**
   - Determine change type (price/status/info change)
   - Create history snapshot
   - Update current record
4. **If new:**
   - Parse floor information using `FloorParser`
   - Create new property record

**Returns:**
- `ImportResult(success=True, property_id=123)` on success
- `ImportResult(success=False, error="...")` on failure

**Example:**
```python
from schemas import PropertyIngestionModel
from services.importer import PropertyImporter

# Prepare data
data = PropertyIngestionModel(
    数据源="链家",
    房源ID="LJ001",
    状态="在售",
    小区名="万科城市花园",
    室=3,
    厅=2,
    朝向="南",
    楼层="15/28",
    面积=120.5,
    挂牌价=800.0,
    上架时间=datetime.now()
)

# Import
importer = PropertyImporter()
result = importer.import_property(data, db)

if result.success:
    print(f"导入成功: property_id={result.property_id}")
else:
    print(f"导入失败: {result.error}")
```

## Change Type Detection

The importer automatically detects the type of change when updating existing properties:

- **PRICE_CHANGE**: Listed price or sold price changed
- **STATUS_CHANGE**: Status changed (在售 ↔ 成交)
- **INFO_CHANGE**: Other information changed (area, orientation, etc.)

## Error Handling

All services include comprehensive error handling:

- **IntegrityError**: Database constraint violations (duplicate keys, etc.)
- **ValidationError**: Data validation failures (handled by Pydantic before reaching services)
- **General Exceptions**: Logged and returned as ImportResult with error message

## Testing

Run manual tests:
```bash
cd backend
python test_importer_manual.py
```

Run unit tests:
```bash
cd backend
pytest tests/test_parser.py -v
```

## Integration with Other Components

### With Schemas (`schemas.py`)
- Receives validated `PropertyIngestionModel` data
- Returns `ImportResult` objects

### With Models (`models.py`)
- Creates/updates `PropertyCurrent` records
- Creates `PropertyHistory` snapshots
- Creates/finds `Community` records

### With Database (`db.py`)
- Uses SQLAlchemy Session for all database operations
- Handles transactions (commit/rollback)

## Future Enhancements

- Batch import optimization (bulk operations)
- Async import for large datasets
- Import progress tracking
- Duplicate detection improvements
- Community merge service integration
