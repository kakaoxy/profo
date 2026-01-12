import sys
import os
import uuid
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Ensure backend root is in sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from db import SessionLocal
from models.user import User, Role

def reproduce_relationship_error():
    db = SessionLocal()
    try:
        # 1. Find a user
        user = db.query(User).first()
        if not user:
            print("No user found.")
            return
        
        print(f"User: {user.username}, role_id: {user.role_id}, type: {type(user.role_id)}")
        
        # 2. Expire the user to force relationship reload
        db.expire(user)
        
        # 3. Manually set role_id to a UUID object
        role_id_uuid = uuid.UUID(user.role_id)
        user.role_id = role_id_uuid
        print(f"Set user.role_id to UUID object: {role_id_uuid}, type: {type(user.role_id)}")
        
        # 4. Access user.role to trigger the query
        print("Accessing user.role...")
        try:
            role = user.role
            print(f"Role loaded: {role.name}")
        except Exception as e:
            print(f"CAUGHT ERROR accessing user.role: {e}")
            import traceback
            traceback.print_exc()
            
    finally:
        db.close()

if __name__ == "__main__":
    reproduce_relationship_error()
