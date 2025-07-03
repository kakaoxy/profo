"""
经纪人管理API端点
"""
from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_current_user
from app.models.agent import Agent
from app.models.agency import Agency
from app.models.user import User
from app.schemas.agent import AgentCreate, AgentUpdate, AgentResponse

router = APIRouter()


@router.get("/", response_model=List[AgentResponse])
def get_agents(
    agency_id: int = Query(None, description="按中介公司筛选"),
    page: int = Query(1, ge=1, description="页码"),
    limit: int = Query(20, ge=1, le=100, description="每页数量"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """获取经纪人列表"""
    query = db.query(Agent)
    
    if agency_id:
        query = query.filter(Agent.agency_id == agency_id)
    
    offset = (page - 1) * limit
    agents = query.offset(offset).limit(limit).all()
    return agents


@router.post("/", response_model=AgentResponse)
def create_agent(
    agent_data: AgentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """创建经纪人"""
    # 验证中介公司是否存在
    agency = db.query(Agency).filter(Agency.id == agent_data.agency_id).first()
    if not agency:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="指定的中介公司不存在"
        )
    
    agent = Agent(**agent_data.dict())
    db.add(agent)
    db.commit()
    db.refresh(agent)
    return agent


@router.get("/{agent_id}", response_model=AgentResponse)
def get_agent(
    agent_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """获取单个经纪人"""
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="经纪人不存在"
        )
    return agent


@router.put("/{agent_id}", response_model=AgentResponse)
def update_agent(
    agent_id: int,
    agent_data: AgentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """更新经纪人"""
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="经纪人不存在"
        )
    
    # 如果更新中介公司，验证是否存在
    if agent_data.agency_id and agent_data.agency_id != agent.agency_id:
        agency = db.query(Agency).filter(Agency.id == agent_data.agency_id).first()
        if not agency:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="指定的中介公司不存在"
            )
    
    for field, value in agent_data.dict(exclude_unset=True).items():
        setattr(agent, field, value)
    
    from datetime import datetime
    agent.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(agent)
    return agent


@router.delete("/{agent_id}")
def delete_agent(
    agent_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """删除经纪人"""
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="经纪人不存在"
        )
    
    db.delete(agent)
    db.commit()
    return {"message": "经纪人删除成功"}


@router.get("/search/by-name")
def search_agents_by_name(
    name: str = Query(..., description="经纪人姓名关键词"),
    limit: int = Query(10, ge=1, le=50, description="返回数量"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """按姓名搜索经纪人（用于下拉选择）"""
    agents = db.query(Agent).filter(
        Agent.name.contains(name)
    ).limit(limit).all()
    
    return [
        {
            "id": agent.id,
            "name": agent.name,
            "agency_id": agent.agency_id,
            "phone": agent.phone
        }
        for agent in agents
    ]
