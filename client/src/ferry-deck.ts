import config from '@data/ferry.json';

const seaZones = new Set(Object.values(config.ports).map(p => p.sea_zone));
export const isFerryZone = (key: string) => seaZones.has(key);

/** Measured walking surfaces of Ship_Large at 3.9 scale after the loader mirrors X, inset from its rails.
 * The ship is single-level at each x,z; the paired stern stairs own their
 * footprint before the lower deck. The same contract is read by Ruby. */
export function ferryDeckHeight(x: number, z: number): number | null {
  for (const s of config.surfaces) {
    if (x < s.x0 || x > s.x1) continue;
    const t = (x - s.x0) / (s.x1 - s.x0);
    const half = s.half0 + (s.half1 - s.half0) * t;
    if (z < s.z - half || z > s.z + half) continue;
    return s.y0 + (s.y1 - s.y0) * t;
  }
  return null;
}

export function ferryBlockedMove(x: number, z: number, nx: number, nz: number): boolean {
  if (![x,z,nx,nz].every(Number.isFinite)) return true;
  const steps = Math.max(1, Math.ceil(Math.hypot(nx-x, nz-z) / .15));
  let previous = ferryDeckHeight(x,z);
  if (previous === null) return true;
  for (let i=1; i<=steps; i++) {
    const px=x+(nx-x)*i/steps, pz=z+(nz-z)*i/steps, y=ferryDeckHeight(px,pz);
    if (y === null || Math.abs(y-previous) > .45) return true;
    previous=y;
  }
  return config.obstacles.some(r => {
    let lo=0, hi=1;
    for (const [start,delta,min,max] of [[x,nx-x,r.x0-.45,r.x1+.45],[z,nz-z,r.z0-.45,r.z1+.45]]) {
      if (Math.abs(delta)<1e-8) { if(start<min || start>max) hi=-1; }
      else { const a=(min-start)/delta,b=(max-start)/delta;lo=Math.max(lo,Math.min(a,b));hi=Math.min(hi,Math.max(a,b)); }
    }
    return lo<=hi;
  });
}
