// SHARED FOOTPRINT CONSTRUCTORS — the one place a fixture footprint is DERIVED.
//
// These lived inline in ci/oracle-crosscheck.mjs (its M1 shape matrix). They
// are extracted here verbatim so a second matrix cannot hand-type the same
// shapes into a second definition that drifts (repo rule: "NO handrolled math
// when a derivation exists"; don't reinvent).
//
// A footprint is a list of [x, z] cells (network-lab coords: x east, z depth,
// y up). Callers extrude it to solids at whatever stack height they need.
//
// Consumers: ci/oracle-crosscheck.mjs (M1/M2), ci/box-vs-shape-matrix.mjs.

/** Solid w x d rectangle at the origin. */
export const box = (w, d) => { const c = []; for (let x=0;x<w;x++) for (let z=0;z<d;z++) c.push([x,z]); return c; };
/** L: rectangle minus a cw x cd bite at the max-x/max-z corner. */
export const L   = (w,d,cw,cd) => box(w,d).filter(([x,z]) => !(x>=w-cw && z>=d-cd));
/** U: rectangle minus a centered nw x nd notch cut in from the max-z edge. */
export const U   = (w,d,nw,nd) => { const x0=Math.floor((w-nw)/2); return box(w,d).filter(([x,z]) => !(x>=x0 && x<x0+nw && z>=d-nd)); };
/** Courtyard: rectangle minus a centered hw x hd interior hole (ring). */
export const court = (w,d,hw,hd) => { const x0=Math.floor((w-hw)/2), z0=Math.floor((d-hd)/2); return box(w,d).filter(([x,z]) => !(x>=x0&&x<x0+hw&&z>=z0&&z<z0+hd)); };
/** T: a w x 2 bar with a centered stem of width stemW running back. */
export const Tsh = (w,stemW) => { const x0=Math.floor((w-stemW)/2); return [...box(w,2), ...box(stemW,w).map(([x,z])=>[x+x0,z+2])]; };
/** Plus/cross with arms `arm` cells wide. */
export const plus = (arm) => { const c=[]; const m=arm; for(let x=0;x<3*m;x++)for(let z=0;z<3*m;z++){const inArmX=x>=m&&x<2*m,inArmZ=z>=m&&z<2*m; if(inArmX||inArmZ)c.push([x,z]);} return c; };
/** Two 3x3 rectangles with a gap — disconnected, so TWO flood-fill clusters. */
export const twoBoxes = () => [...box(3,3), ...box(3,3).map(([x,z])=>[x+5,z])];  // disconnected -> 2 clusters
