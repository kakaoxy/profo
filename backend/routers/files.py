from fastapi import APIRouter, UploadFile, File, HTTPException, status
import os
import shutil
import uuid
import filetype
from datetime import datetime
from settings import settings

router = APIRouter()

# Ensure upload directory exists
if not os.path.exists(settings.upload_dir):
    os.makedirs(settings.upload_dir)

@router.post("/upload", summary="上传文件")
def upload_file(file: UploadFile = File(...)):
    """
    Handle file upload (Sync - Run in threadpool by FastAPI)
    Optimized to read only first 2KB for MIME check.
    """
    try:
        # 1. Validate Extension
        ext = os.path.splitext(file.filename)[1].lower()
        if ext not in settings.allowed_extensions:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, 
                detail=f"不支持的文件扩展名。允许的扩展名: {', '.join(settings.allowed_extensions)}"
            )
        
        # 2. Validate MIME Type (Read only Header)
        # Use file.file which is the underlying SpooledTemporaryFile
        header = file.file.read(2048)
        file.file.seek(0) # Reset immediately
        
        kind = filetype.guess(header)
        if kind is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="无法识别的文件类型")
        
        if kind.mime not in settings.allowed_mime_types:
             raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, 
                detail=f"不支持的文件类型。检测到的MIME类型: {kind.mime}"
            )
        
        # 3. Generate unique filename
        filename = f"{datetime.now().strftime('%Y%m%d')}_{uuid.uuid4().hex[:8]}{ext}"
        file_path = os.path.join(settings.upload_dir, filename)
        
        # 4. Save File (Blocking I/O - Safe in 'def')
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # 5. Return URL
        # Construct URL relative to api prefix or root? 
        # History suggests "/static/uploads/..."
        url = f"/{settings.upload_dir.replace(os.sep, '/')}/{filename}"
        
        return {"code": 200, "msg": "success", "data": {"url": url, "filename": filename}}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"文件上传失败: {str(e)}")
