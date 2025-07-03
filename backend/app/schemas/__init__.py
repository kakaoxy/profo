"""
Pydantic模式模块
"""
from .user import UserCreate, UserUpdate, UserResponse, UserLogin, Token
from .city import CityCreate, CityUpdate, CityResponse
from .agency import AgencyCreate, AgencyUpdate, AgencyResponse
from .agent import AgentCreate, AgentUpdate, AgentResponse
from .community import CommunityCreate, CommunityUpdate, CommunityResponse
from .daily_city_stats import DailyCityStatsCreate, DailyCityStatsUpdate, DailyCityStatsResponse
from .community_stats import CommunityStatsCreate, CommunityStatsUpdate, CommunityStatsResponse
from .property import PropertyCreate, PropertyUpdate, PropertyResponse, PropertyFilter
from .my_viewing import MyViewingCreate, MyViewingUpdate, MyViewingResponse

__all__ = [
    # User schemas
    "UserCreate", "UserUpdate", "UserResponse", "UserLogin", "Token",
    # City schemas
    "CityCreate", "CityUpdate", "CityResponse",
    # Agency schemas
    "AgencyCreate", "AgencyUpdate", "AgencyResponse",
    # Agent schemas
    "AgentCreate", "AgentUpdate", "AgentResponse",
    # Community schemas
    "CommunityCreate", "CommunityUpdate", "CommunityResponse",
    # Daily city stats schemas
    "DailyCityStatsCreate", "DailyCityStatsUpdate", "DailyCityStatsResponse",
    # Community stats schemas
    "CommunityStatsCreate", "CommunityStatsUpdate", "CommunityStatsResponse",
    # Property schemas
    "PropertyCreate", "PropertyUpdate", "PropertyResponse", "PropertyFilter",
    # My viewing schemas
    "MyViewingCreate", "MyViewingUpdate", "MyViewingResponse",
]
