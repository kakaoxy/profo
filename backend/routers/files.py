from fastapi import APIRouter, UploadFile, File, HTTPException
import os
import shutil
from datetime import datetime
import uuid
import filetype

router = APIRouter()

UPLOAD_DIR = "static/uploads"
# Ensure upload directory exists
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)

# 文件类型白名单
ALLOWED_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.pdf', '.xlsx'}
ALLOWED_MIME_TYPES = {'image/jpeg', 'image/png', 'application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}

@router.post("/upload", summary="上传文件")
async def upload_file(file: UploadFile = File(...)):
    try:
        # 验证文件扩展名
        ext = os.path.splitext(file.filename)[1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(status_code=400, detail=f"不支持的文件扩展名。允许的扩展名: {', '.join(ALLOWED_EXTENSIONS)}")
        
        # 验证文件内容（MIME类型）
        file_content = await file.read()
        kind = filetype.guess(file_content)
        
        if kind is None:
            raise HTTPException(status_code=400, detail="无法识别的文件类型")
        
        if kind.mime not in ALLOWED_MIME_TYPES:
            raise HTTPException(status_code=400, detail=f"不支持的文件类型。检测到的MIME类型: {kind.mime}")
        
        # 重置文件指针，以便后续写入
        await file.seek(0)
        
        # Generate unique filename
        filename = f"{datetime.now().strftime('%Y%m%d')}_{uuid.uuid4().hex[:8]}{ext}"
        file_path = os.path.join(UPLOAD_DIR, filename)
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # Return URL (assuming mounted at /static)
        # Note: This URL is relative to the server root. Frontend should prepend server URL if needed,
        # but since we use proxy, /static should work.
        url = f"/static/uploads/{filename}"
        return {"code": 200, "msg": "success", "data": {"url": url, "filename": filename}}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"文件上传失败: {str(e)}")
