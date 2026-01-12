import sys
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Ensure backend root is in sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from db import SessionLocal
from models.user import User, Role

def check_data_types():
    db = SessionLocal()
    try:
        print("Checking User data types...")
        users = db.query(User).limit(5).all()
        for u in users:
            print(f"User ID: {u.id}, type: {type(u.id)}")
            print(f"User role_id: {u.role_id}, type: {type(u.role_id)}")
            try:
                print(f"User role: {u.role}")
            except Exception as e:
                print(f"Error accessing u.role: {e}")
        
        print("\nChecking Role data types...")
        roles = db.query(Role).limit(5).all()
        for r in roles:
            print(f"Role ID: {r.id}, type: {type(r.id)}")
    finally:
        db.close()

if __name__ == "__main__":
    check_data_types()
