#!/usr/bin/env python3
"""Quick verification of FloorParser"""

import sys
import os

# Add backend to path
sys.path.insert(0, os.path.dirname(__file__))

from services.parser import FloorParser

# Test cases from requirements
tests = [
    ("高楼层/18", None, 18, "高楼层"),
    ("15/28", 15, 28, "中楼层"),
    ("中楼层/共28层", None, 28, "中楼层"),
]

print("FloorParser Verification")
print("-" * 50)

all_pass = True
for input_str, exp_floor, exp_total, exp_level in tests:
    result = FloorParser.parse_floor(input_str)
    passed = (result.floor_number == exp_floor and 
              result.total_floors == exp_total and 
              result.floor_level == exp_level)
    
    status = "PASS" if passed else "FAIL"
    print(f"{status}: '{input_str}' -> floor={result.floor_number}, total={result.total_floors}, level={result.floor_level}")
    
    if not passed:
        all_pass = False

print("-" * 50)
print("Result:", "ALL TESTS PASSED" if all_pass else "SOME TESTS FAILED")
