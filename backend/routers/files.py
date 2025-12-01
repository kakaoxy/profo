from fastapi import APIRouter, UploadFile, File, HTTPException
import os
import shutil
from datetime import datetime
import uuid

router = APIRouter()

UPLOAD_DIR = "static/uploads"
# Ensure upload directory exists
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)

@router.post("/upload", summary="上传文件")
async def upload_file(file: UploadFile = File(...)):
    try:
        # Generate unique filename
        ext = os.path.splitext(file.filename)[1]
        filename = f"{datetime.now().strftime('%Y%m%d')}_{uuid.uuid4().hex[:8]}{ext}"
        file_path = os.path.join(UPLOAD_DIR, filename)
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # Return URL (assuming mounted at /static)
        # Note: This URL is relative to the server root. Frontend should prepend server URL if needed,
        # but since we use proxy, /static should work.
        url = f"/static/uploads/{filename}"
        return {"code": 200, "msg": "success", "data": {"url": url, "filename": filename}}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"File upload failed: {str(e)}")
