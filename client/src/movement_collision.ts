/** Test a move in a box's local frame, with body radius included in its extents. */
export function boxBlocksMove(ox: number, oz: number, nx: number, nz: number, hx: number, hz: number): boolean {
  const px = hx - Math.abs(ox), pz = hz - Math.abs(oz);
  if (px > 0 && pz > 0) {
    // A floor change can activate a railing around an existing position.
    // Let the body slide toward its nearest exit, never farther through it.
    // Other obstacles still get their own test, including the outer wall.
    return px < pz ? (nx - ox) * ox < -1e-10 : (nz - oz) * oz < -1e-10;
  }
  return Math.abs(nx) < hx && Math.abs(nz) < hz;
}
