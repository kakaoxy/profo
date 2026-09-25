"""钥匙管理服务依赖注入."""

from typing import Annotated

from fastapi import Depends
from sqlalchemy.orm import Session

from db import get_db
from services.projects.key_share_public import KeySharePublicService
from services.projects.key_shares import KeyShareService
from services.projects.keys import KeyService


def get_key_service(db: Annotated[Session, Depends(get_db)]) -> KeyService:
    """后台钥匙管理服务."""
    return KeyService(db)


def get_key_share_service(db: Annotated[Session, Depends(get_db)]) -> KeyShareService:
    """员工端分享服务."""
    return KeyShareService(db)


def get_key_share_public_service(db: Annotated[Session, Depends(get_db)]) -> KeySharePublicService:
    """经纪人端公开分享服务."""
    return KeySharePublicService(db)


KeyServiceDep = Annotated[KeyService, Depends(get_key_service)]
KeyShareServiceDep = Annotated[KeyShareService, Depends(get_key_share_service)]
KeySharePublicServiceDep = Annotated[KeySharePublicService, Depends(get_key_share_public_service)]
