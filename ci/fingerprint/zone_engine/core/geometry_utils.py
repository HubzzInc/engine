"""
Geometry and Fingerprinting Utilities for Voxel Spaces
- Handshake-based face detection
- Inner/outer face classification
- Canonical fingerprinting (geometry and topology)
- Mesh generation for Open3D
"""
from typing import Set, List, Tuple, Dict, Any
try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False
    np = None


import json
import hashlib
from collections import deque
from .config import ZONE_WIDTH, ZONE_DEPTH


Vec3 = Tuple[int, int, int]
SpaceSet = Set[Vec3]
Face = Tuple[Vec3, str]
ClassifiedFace = Tuple[Vec3, str, str]


DIRS: Dict[str, Vec3] = {
    "px": (1, 0, 0),
    "nx": (-1, 0, 0),
    "py": (0, 1, 0),
    "ny": (0, -1, 0),
    "pz": (0, 0, 1),
    "nz": (0, 0, -1),
}


if HAS_NUMPY:
    FACE_COLORS = {
        "outer": np.array([0.8, 0.8, 0.8]),
        "inner": np.array([1.0, 0.2, 0.2]),
    }
else:
    FACE_COLORS = {
        "outer": [0.8, 0.8, 0.8],
        "inner": [1.0, 0.2, 0.2],
    }


def to_world_voxel(voxel: Tuple[int, ...]) -> Vec3:
    """Convert (rx, ry, x, y, z) or (x, y, z) to world-space Vec3."""
    if len(voxel) == 3:
        return voxel  # Already world/local Vec3
    if len(voxel) == 5:
        rx, ry, x, y, z = voxel
        return (rx * ZONE_WIDTH + x, ry * ZONE_DEPTH + y, z)
    raise ValueError(f"Unsupported voxel format: {voxel}")


def to_world_space(voxels: Set[Tuple[int, ...]]) -> SpaceSet:
    return {to_world_voxel(v) for v in voxels}


def classify_faces(voxels: SpaceSet) -> List[ClassifiedFace]:
    if not voxels:
        return []
    faces_with_void: List[Tuple[Vec3, str, Vec3]] = []
    for v in voxels:
        for direction, offset in DIRS.items():
            u = (v[0] + offset[0], v[1] + offset[1], v[2] + offset[2])
            if u not in voxels:
                faces_with_void.append((v, direction, u))
    if not faces_with_void:
        return []
    xs = [v[0] for v in voxels]
    ys = [v[1] for v in voxels]
    zs = [v[2] for v in voxels]
    xmin, xmax = min(xs), max(xs)
    ymin, ymax = min(ys), max(ys)
    zmin, zmax = min(zs), max(zs)
    exmin, exmax = xmin - 1, xmax + 1
    eymin, eymax = ymin - 1, ymax + 1
    ezmin, ezmax = zmin - 1, zmax + 1
    void_cells = set()
    for x in range(exmin, exmax + 1):
        for y in range(eymin, eymax + 1):
            for z in range(ezmin, ezmax + 1):
                if (x, y, z) not in voxels:
                    void_cells.add((x, y, z))
    outer_void = set()
    queue = deque()
    for cell in void_cells:
        x, y, z = cell
        if x == exmin or x == exmax or y == eymin or y == eymax or z == ezmin or z == ezmax:
            queue.append(cell)
            outer_void.add(cell)
    while queue:
        current = queue.popleft()
        for offset in DIRS.values():
            neighbor = (current[0] + offset[0], current[1] + offset[1], current[2] + offset[2])
            if neighbor in void_cells and neighbor not in outer_void:
                outer_void.add(neighbor)
                queue.append(neighbor)
    inner_void = void_cells - outer_void
    classified: List[ClassifiedFace] = []
    for v, direction, u in faces_with_void:
        if u in outer_void:
            kind = "outer"
        elif u in inner_void:
            kind = "inner"
        else:
            kind = "outer"
        classified.append((v, direction, kind))
    return classified


def face_vertices(voxel: Vec3, direction: str) -> List[Tuple[float, float, float]]:
    x, y, z = voxel
    if direction == "px":
        return [(x + 1, y, z), (x + 1, y + 1, z), (x + 1, y + 1, z + 1), (x + 1, y, z + 1)]
    elif direction == "nx":
        return [(x, y, z + 1), (x, y + 1, z + 1), (x, y + 1, z), (x, y, z)]
    elif direction == "py":
        return [(x, y + 1, z), (x, y + 1, z + 1), (x + 1, y + 1, z + 1), (x + 1, y + 1, z)]
    elif direction == "ny":
        return [(x + 1, y, z), (x + 1, y, z + 1), (x, y, z + 1), (x, y, z)]
    elif direction == "pz":
        return [(x, y, z + 1), (x + 1, y, z + 1), (x + 1, y + 1, z + 1), (x, y + 1, z + 1)]
    elif direction == "nz":
        return [(x, y, z), (x, y + 1, z), (x + 1, y + 1, z), (x, y, z)]
    else:
        raise ValueError(f"Unknown direction: {direction}")


def faces_for_space(space: SpaceSet) -> List[Face]:
    faces: List[Face] = []
    for v in space:
        for d_name, offset in DIRS.items():
            u = (v[0] + offset[0], v[1] + offset[1], v[2] + offset[2])
            if u not in space:
                faces.append((v, d_name))
    return faces


def fingerprint_dict_for_space(space: SpaceSet) -> Dict[str, Any]:
    faces = faces_for_space(space)
    faces_sorted = sorted(faces, key=lambda item: (item[0][0], item[0][1], item[0][2], item[1]))
    return {
        "version": 1,
        "grid_unit": 1.0,
        "faces": [
            {"v": [vx, vy, vz], "d": d_name} for ((vx, vy, vz), d_name) in faces_sorted
        ],
    }


def fingerprint_hash_for_space(space: SpaceSet) -> str:
    fp = fingerprint_dict_for_space(space)
    s = json.dumps(fp, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def fingerprint_dict_for_space_with_kinds(space: SpaceSet) -> Dict[str, Any]:
    faces = classify_faces(space)
    faces_sorted = sorted(faces, key=lambda item: (item[0][0], item[0][1], item[0][2], item[1]))
    return {
        "version": 1,
        "grid_unit": 1.0,
        "faces": [
            {"v": [vx, vy, vz], "d": d_name, "k": kind} for ((vx, vy, vz), d_name, kind) in faces_sorted
        ],
    }


def fingerprint_hash_for_space_with_kinds(space: SpaceSet) -> str:
    fp = fingerprint_dict_for_space_with_kinds(space)
    s = json.dumps(fp, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def mesh_from_classified_faces(faces: List[ClassifiedFace]):
    import open3d as o3d
    mesh = o3d.geometry.TriangleMesh()
    vertices = []
    triangles = []
    vertex_colors = []
    for v, direction, kind in faces:
        corners = face_vertices(v, direction)
        color = FACE_COLORS[kind]
        base_index = len(vertices)
        for corner in corners:
            vertices.append(corner)
            vertex_colors.append(color)
        triangles.append([base_index, base_index + 1, base_index + 2])
        triangles.append([base_index, base_index + 2, base_index + 3])
    mesh.vertices = o3d.utility.Vector3dVector(np.array(vertices, dtype=np.float64))
    mesh.triangles = o3d.utility.Vector3iVector(np.array(triangles, dtype=np.int32))
    mesh.vertex_colors = o3d.utility.Vector3dVector(np.array(vertex_colors, dtype=np.float64))
    mesh.compute_vertex_normals()
    return mesh
