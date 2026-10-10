/**
 * @hubzz/engine - Main Entry Point
 * NESWUD spatial system: blocks → six handshakes (N/E/S/W/U/D) → boundary faces.
 */

// Core exports
export * from './core/constants';
export * from './core/schemas';
export * from './core/block-node';
export * from './core/space';
export * from './core/validation';
export * from './core/hollow-space-detection';
export * from './core/movement-system';
export * from './core/spawning-system';
export * from './core/space-cache';
export * from './space-shape';
export * from './space-spine';
// shell-view exports a flat `BoundingBox` ({minX..maxZ}) that collides with
// core/schemas' nested `BoundingBox` ({min,max}) under `export *`. Re-export
// the shell-view surface explicitly so both shapes stay available without
// ambiguity (SPEC §7.1 shell view vs. the engine's internal AABB).
export {
  boundingBoxFromBlocks,
  boundingBoxFromIndex,
  boxSize,
  shellViewBox,
  type BoundingBox as ShellViewBox,
} from './shell-view';

// Re-export key classes for convenience
export { BlockNodeGraph, createSimpleRoom } from './core/block-node';
export { SpaceDetectionEngine } from './core/space';
export { ValidationEngine } from './core/validation';
