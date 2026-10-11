import hashlib
import json
from .config import ZONE_WIDTH, ZONE_DEPTH, INSET_SIZE, SpaceType
from enum import Enum
from .geometry_utils import (
    fingerprint_hash_for_space_with_kinds,
    to_world_space,
    to_world_voxel,
)

class SubInstance:
    """
    A labeled logical area within a Space (e.g., 'Kitchen').
    Defined by Partition Walls.
    """
    def __init__(self, name, voxels):
        self.name = name
        self.voxels = voxels # The floor tiles belonging to this room

class Space:
    """
    Compiled Architecture + Interior Design Data.
    """
    def __init__(self, id, voxels, type=SpaceType.PUBLIC):
        self.id = id
        self.type = type
        self.voxels = voxels          # Structural Geometry
        # --- NEW EDITOR DATA ---
        self.components = {}          # {voxel_coord: ComponentObj}
        self.sub_instances = []       # List of SubInstance objects
        # The Manual Partitioning Map
        # Key: Voxel Coordinate (x,y,z) -> Value: "Instance_Name"
        # e.g. {(0,0,10,10,0): "Kitchen", (0,0,10,11,0): "Kitchen"}
        self.tile_assignments = {}
        # Metadata for the Sub-Instances (Style, Name)
        # { "Kitchen": {"style": "Modern_Dark", "perms": "OPEN"} }
        self.sub_instance_meta = {}
        self.shell_voxels = set()
        self.bounding_box = None
        self.stats = {}
        self._optimize()

    def _optimize(self):
        """Standard Shell Extraction (Hidden Surface Removal)"""
        if not self.voxels: return
        xs = [v[2] for v in self.voxels]
        ys = [v[3] for v in self.voxels]
        zs = [v[4] for v in self.voxels]
        r_x, r_y = list(self.voxels)[0][0], list(self.voxels)[0][1]
        self.bounding_box = ((r_x, r_y, min(xs), min(ys), min(zs)),
                             (r_x, r_y, max(xs), max(ys), max(zs)))
        # Use handshake-based shell extraction for shell_voxels
        from .geometry_utils import faces_for_space
        shell = set()
        world_map = {to_world_voxel(v): v for v in self.voxels}
        for v, d in faces_for_space(set(world_map.keys())):
            shell.add(world_map[v])
        self.shell_voxels = shell

    def to_dict(self):
        return {
            "id": self.id,
            "type": self.type.value,
            "bounds": self.bounding_box,
            "stats": self.stats,
            "geometry": list(self.shell_voxels),
            # EDITOR DATA EXPORT
            "components": {str(k): v.to_dict() for k,v in self.components.items()},
            "partitioning": {str(k): v for k,v in self.tile_assignments.items()},
            "sub_instances": self.sub_instance_meta
        }

class Zone:
    """Master Container: Storage, Merging, Hashing."""
    def __init__(self, x, y, district="CENTRAL", config=None):
        self.id = f"{x}_{y}"
        self.district_type = district
        self.config = config
        self.is_published = False
        self.included_regions = set([(x, y)])
        self.voxels = {}
        self.user_labels = {}
        self.compiled_spaces = []
        self.merge_flags = []
        self._hash_dirty = False
        self.current_hash = self.generate_fingerprint_hash()
        self._region_fp_cache = {}

    @property
    def max_blocks(self):
        return self.config["DISTRICTS"][self.district_type]["allocation"] * len(self.included_regions)

    def add_voxel(self, coord: tuple[int, int, int, int, int], label=None):
        if self.is_published: return False
        r_x, r_y, x, y, z = coord
        if not self._check_inset(r_x, r_y, x, y): return False
        self.voxels[coord] = 1
        if label: self.user_labels[coord] = label
        self._hash_dirty = True
        return True

    def _check_inset(self, r_x, r_y, x, y):
        # Sidewalk Rule - use config values if available, fall back to globals
        inset = self.config.get("INSET_SIZE", INSET_SIZE) if self.config else INSET_SIZE
        width = self.config.get("ZONE_WIDTH", ZONE_WIDTH) if self.config else ZONE_WIDTH
        depth = self.config.get("ZONE_DEPTH", ZONE_DEPTH) if self.config else ZONE_DEPTH
        if x < inset and (r_x-1, r_y) not in self.included_regions: return False
        if x >= width-inset and (r_x+1, r_y) not in self.included_regions: return False
        if y < inset and (r_x, r_y-1) not in self.included_regions: return False
        if y >= depth-inset and (r_x, r_y+1) not in self.included_regions: return False
        return True

    def absorb_zone(self, other_zone, direction):
        self.included_regions.update(other_zone.included_regions)
        self.voxels.update(other_zone.voxels)
        self.user_labels.update(other_zone.user_labels)
        symbol_map = {"N": "MN", "E": "ME", "S": "MS", "W": "MW"}
        if symbol_map[direction] not in self.merge_flags:
            self.merge_flags.append(symbol_map[direction])
        self._hash_dirty = True
        self._region_fp_cache = {}

    def generate_fingerprint_hash(self):
        """
        Generates the On-Chain Fingerprint using the Handshake Rule.
        Logic: Sorts voxels -> Calculates Handshakes (Neighbors) -> Hashes string.
        """
        sorted_keys = sorted(self.voxels.keys())
        handshake_stream = ""

        # Directions: N, E, S, W, U, D
        # We perform a handshake check for every single block.
        # This ensures the Geometry is cryptographically proven.

        for v in sorted_keys:
            rx, ry, cx, cy, cz = v
            neighbors = []

            # Check 6 neighbors to build the handshake signature
            if (rx, ry, cx+1, cy, cz) in self.voxels: neighbors.append("E")
            if (rx, ry, cx-1, cy, cz) in self.voxels: neighbors.append("W")
            if (rx, ry, cx, cy+1, cz) in self.voxels: neighbors.append("N")
            if (rx, ry, cx, cy-1, cz) in self.voxels: neighbors.append("S")
            if (rx, ry, cx, cy, cz+1) in self.voxels: neighbors.append("U")
            if (rx, ry, cx, cy, cz-1) in self.voxels: neighbors.append("D")

            # Format: "RX_RY_X_Y_Z:Handshakes|"
            handshake_stream += f"{rx}_{ry}_{cx}_{cy}_{cz}:{''.join(neighbors)}|"

        # Add Metadata (ID, Published Status, Merge Flags)
        meta = f"{self.id}-{self.is_published}-{sorted(list(self.included_regions))}-"

        # Final Payload
        final_payload = meta + handshake_stream

        return hashlib.sha256(final_payload.encode()).hexdigest()

    def refresh_hash(self):
        """Recompute and store the current hash if geometry changed."""
        self.current_hash = self.generate_fingerprint_hash()
        self._hash_dirty = False

    # ------------------------------------------------------------------
    # Incremental zone fingerprint (two-level construction).
    #
    # The flat generate_fingerprint_hash above is kept untouched as the
    # reference. This construction commits to exactly the same facts
    # (voxel handshake letters per region, plus zone id / published flag /
    # included regions in the preimage) but factors the hash by region, so
    # an edit recomputes one region instead of re-walking every voxel.
    # Regions are independent under the current letter computation, which
    # tests neighbors with (rx, ry) fixed: an edit in region r can never
    # change handshake letters in another region.
    # ------------------------------------------------------------------

    def _handshake_letters(self, v):
        """Handshake letters for one 5-tuple voxel, current semantics."""
        rx, ry, cx, cy, cz = v
        vox = self.voxels
        letters = []
        if (rx, ry, cx + 1, cy, cz) in vox: letters.append("E")
        if (rx, ry, cx - 1, cy, cz) in vox: letters.append("W")
        if (rx, ry, cx, cy + 1, cz) in vox: letters.append("N")
        if (rx, ry, cx, cy - 1, cz) in vox: letters.append("S")
        if (rx, ry, cx, cy, cz + 1) in vox: letters.append("U")
        if (rx, ry, cx, cy, cz - 1) in vox: letters.append("D")
        return "".join(letters)

    def _region_stream_hash(self, rx, ry, sorted_keys):
        """SHA-256 over the (cx, cy, cz, letters) stream for pre-sorted
        keys of one region. Neighbor checks are inlined (same as
        generate_fingerprint_hash) so the per-voxel cost matches the
        reference."""
        vox = self.voxels
        parts = []
        for k in sorted_keys:
            cx, cy, cz = k[2], k[3], k[4]
            n = []
            if (rx, ry, cx + 1, cy, cz) in vox: n.append("E")
            if (rx, ry, cx - 1, cy, cz) in vox: n.append("W")
            if (rx, ry, cx, cy + 1, cz) in vox: n.append("N")
            if (rx, ry, cx, cy - 1, cz) in vox: n.append("S")
            if (rx, ry, cx, cy, cz + 1) in vox: n.append("U")
            if (rx, ry, cx, cy, cz - 1) in vox: n.append("D")
            parts.append(f"{cx}_{cy}_{cz}:{''.join(n)}|")
        return hashlib.sha256("".join(parts).encode()).hexdigest()

    def region_fingerprint(self, rx, ry):
        """SHA-256 over the sorted (cx, cy, cz, letters) stream of one
        region's voxels. Pure function of the current voxel set."""
        keys = sorted(k for k in self.voxels if k[0] == rx and k[1] == ry)
        return self._region_stream_hash(rx, ry, keys)

    def incremental_zone_fingerprint(self):
        """Zone fingerprint as a function of per-region fingerprints.
        Reference recomputation: O(V) via a single partition pass.
        Deterministic."""
        by_region = {}
        for k in self.voxels:
            by_region.setdefault((k[0], k[1]), []).append(k)
        pairs = sorted(
            ((rx, ry), self._region_stream_hash(rx, ry, sorted(by_region.get((rx, ry), []))))
            for (rx, ry) in self.included_regions
        )
        meta = f"{self.id}-{self.is_published}-{sorted(list(self.included_regions))}-"
        payload = meta + "".join(f"{rx}_{ry}:{fp}|" for (rx, ry), fp in pairs)
        return hashlib.sha256(payload.encode()).hexdigest()

    def refresh_region_fingerprint(self, rx, ry):
        """Incremental update: recompute one region's fingerprint and refresh
        the zone hash from the region cache. O(V_r + #regions). Returns the
        new zone fingerprint."""
        self._region_fp_cache[(rx, ry)] = self.region_fingerprint(rx, ry)
        for reg in self.included_regions:
            if reg not in self._region_fp_cache:
                self._region_fp_cache[reg] = self.region_fingerprint(*reg)
        return self.cached_zone_fingerprint()

    def cached_zone_fingerprint(self):
        """Zone fingerprint from the region cache. O(#regions)."""
        pairs = sorted(self._region_fp_cache.items())
        meta = f"{self.id}-{self.is_published}-{sorted(list(self.included_regions))}-"
        payload = meta + "".join(f"{rx}_{ry}:{fp}|" for (rx, ry), fp in pairs)
        return hashlib.sha256(payload.encode()).hexdigest()

    def get_manifest(self):
        """Sorted Bottom-Up JSON for Rendering."""
        sorted_spaces = sorted(self.compiled_spaces, key=lambda s: s.bounding_box[0][4])
        return json.dumps({
            "zone_id": self.id,
            "hash": self.current_hash,
            "spaces": [s.to_dict() for s in sorted_spaces]
        }, indent=2)
