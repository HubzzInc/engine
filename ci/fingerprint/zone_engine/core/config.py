"""
Configuration and Profiles

This module defines the physical constants, spatial types, and rule profiles
that govern how the Metaverse Zone Engine validates and structures virtual plots.

Key Concepts:
- **Block Budget**: Controlled by "DISTRICTS" allocation. A 'CENTRAL' zone has
  50,000 blocks, while 'OUTER' has 30,000. This creates economic scarcity (analogous
  to urban density). A user MUST use exactly 100% of their allocation during publish.
- **Zone edge reserve**: `INSET_SIZE` = `ROAD_WIDTH` + `SIDEWALK_WIDTH` = 4 prevents
  building within 4 tiles of a zone's edge (2 road + 2 sidewalk), leaving a 56x56
  buildable core and guaranteeing the shared street and pedestrian path between
  unmerged neighboring zones.
"""
from enum import Enum

# ==========================================
# 1. GRID & WORLD SETTINGS
# ==========================================
ZONE_WIDTH = 64
ZONE_DEPTH = 64
# The zone edge reserve: 2 road + 2 sidewalk = 4 tiles on every edge, so a
# 64x64 zone has a 56x56 buildable core. Documented in
# network-lab/docs/SPEC-ZONE-ARCHITECTURE.md ("the 56x56-in-64x64 buildable
# margin"). Two abutting zones each contribute their road tiles, so the shared
# street is a symmetric 4 wide and a landmark merge releases the interior seam
# without re-deriving geometry.
#
# Both parts are named so the total cannot be misread as one of them. This file
# previously said INSET_SIZE = 2 with the comment "Sidewalk width", which is the
# sidewalk part alone and contradicted the spec above.
ROAD_WIDTH = 2             # street lane, shared with the neighbouring zone
SIDEWALK_WIDTH = 2         # pedestrian path inside the road
INSET_SIZE = ROAD_WIDTH + SIDEWALK_WIDTH   # = 4, the FULL per-edge reserve
MAX_REGIONS_PER_ZONE = 4   # Max merged size
CHAR_HEIGHT = 1.5          # For vertical traversal

# ==========================================
# 2. ARCHITECTURAL CODES
# ==========================================
ALLOWED_HEIGHTS = {2, 4, 6, 8} 
MIN_FLOOR_AREA = 16            
MIN_CORRIDOR_WIDTH = 3         

# ==========================================
# 3. SPACE TYPES
# ==========================================
class SpaceType(Enum):
    UNDEFINED = "UNDEFINED" 
    PUBLIC    = "PUBLIC"    
    PRIVATE   = "PRIVATE"   # 1 Door Rule
    FLEX      = "FLEX"      # Traversal Trap
    COLUMN    = "COLUMN"    # Teleportal

# ==========================================
# 4. CONFIGURATION PROFILES
# ==========================================

# Production Rules: Standard block budgets, rigid architectural heights, strict ground connections.
DEFAULT_RULES = {
    "ZONE_WIDTH": 64,
    "ZONE_DEPTH": 64,
    "INSET_SIZE": INSET_SIZE,   # 4 = road + sidewalk; never re-hardcode
    "MAX_REGIONS": 4,
    "ALLOWED_HEIGHTS": {2, 4, 6, 8},
    "MIN_FLOOR_AREA": 16,
    "DISTRICTS": {
        "CENTRAL": {"allocation": 50000, "color": [1, 0, 0]}, 
        "MID":     {"allocation": 40000, "color": [0, 1, 0]},
        "OUTER":   {"allocation": 30000, "color": [0, 0, 1]} 
    },
    "STRICT_MODE": True
}

# Testing Rules: Minimal block budgets for rapid iteration (100 blocks instead of 50k).
TEST_PROFILE = {
    "DISTRICTS": {
        "CENTRAL": {"allocation": 100} 
    },
    "STRICT_MODE": False
}

# ==========================================
# TESTING PROFILES (For Dev/QA)
# ==========================================
TEST_PROFILE_LOOSE = {
    "ZONE_WIDTH": 64,
    "ZONE_DEPTH": 64,
    "INSET_SIZE": 0,             # No sidewalk requirements
    "MAX_REGIONS": 10,           # Allow massive merges
    "ALLOWED_HEIGHTS": {1, 2, 3, 4, 5}, # Allow odd heights
    "MIN_FLOOR_AREA": 4,         # Allow tiny closets
    "DISTRICTS": {
        "CENTRAL": {"allocation": 100} # Tiny budget for quick tests
    },
    "STRICT_MODE": False
}
