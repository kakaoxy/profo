import requests
import json

BASE_URL = "http://127.0.0.1:8000/api/v1"
PROJECT_ID = "cf73ed47-2303-4dd7-9c59-219a13c1f109"

def call_api(name, payload=None):
    url = f"{BASE_URL}/admin/mini/projects/{PROJECT_ID}/photos"
    headers = {"Content-Type": "application/json"}
    print(f"--- Case: {name} ---")
    try:
        if payload is None:
            # Test completely missing body
            response = requests.post(url, headers=headers)
        else:
            response = requests.post(url, json=payload, headers=headers)
        
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.json()}")
    except Exception as e:
        print(f"Error: {e}")
    print()

if __name__ == "__main__":
    # Case 1: Valid payload (we expect 401 if unauth, but let's see validation)
    call_api("Valid Payload", {
        "image_url": "http://example.com/test.jpg",
        "renovation_stage": "other",
        "sort_order": 0
    })

    # Case 2: Empty object
    call_api("Empty Object", {})

    # Case 3: Missing body
    call_api("Missing Body", None)

    # Case 4: Null body (explicit null in JSON)
    url = f"{BASE_URL}/admin/mini/projects/{PROJECT_ID}/photos"
    headers = {"Content-Type": "application/json"}
    print("--- Case: Explicit Null Body ---")
    response = requests.post(url, data="null", headers=headers)
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.json()}")
