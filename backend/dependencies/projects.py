from fastapi import Depends
from sqlalchemy.orm import Session
from db import get_db
from services import ProjectService

def get_project_service(db: Session = Depends(get_db)) -> ProjectService:
    return ProjectService(db)
