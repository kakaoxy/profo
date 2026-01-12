import sys
import os
import uuid
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Ensure backend root is in sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from db import SessionLocal
from models.user import User, Role

def reproduce_error():
    db = SessionLocal()
    try:
        # Get a role ID as a string first
        role = db.query(Role).first()
        if not role:
            print("No role found to test with.")
            return
        
        role_id_str = role.id
        print(f"Testing with role ID string: {role_id_str}")
        role_by_str = db.query(Role).filter(Role.id == role_id_str).first()
        print(f"Role by string: {role_by_str.name}")
        
        # Now try with a UUID object
        role_id_uuid = uuid.UUID(role_id_str)
        print(f"Testing with role ID UUID object: {role_id_uuid}, type: {type(role_id_uuid)}")
        try:
            role_by_uuid = db.query(Role).filter(Role.id == role_id_uuid).first()
            print(f"Role by UUID: {role_by_uuid.name}")
        except Exception as e:
            print(f"CAUGHT ERROR with UUID object: {e}")
            
    finally:
        db.close()

if __name__ == "__main__":
    reproduce_error()
