import type { TerrainCollider } from './environmentBuilder';

export const TERRAIN_SIZE = 96;
export const TERRAIN_RESOLUTION = 512;
export const WATER_LEVEL = -0.03;

function hash(x: number, z: number): number {
  const value = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
  return value - Math.floor(value);
}
export function terrainNoise(x: number, z: number): number {
  const ix = Math.floor(x), iz = Math.floor(z);
  let u = x - ix, v = z - iz;
  u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}
function smoothMin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

/** A single continuous elevation function, shared by the mesh and water depth map. */
export function createTerrainField(banks: readonly TerrainCollider[]): (x: number, z: number) => number {
  const prepared = banks.map((b, i) => {
    const lobes = [{x:0,z:0,rx:.56+(i%4)*.075,rz:.44+((i*3)%5)*.055}];
    for(let j=0;j<3+(i%3);j++) {
      const angle=j*2.399+i*.91,reach=.36+(j%2)*.12;
      const radius=.30+((i+j*3)%5)*.043;
      lobes.push({x:Math.cos(angle)*reach,z:Math.sin(angle)*reach,rx:radius,rz:radius*(.78+(j%3)*.13)});
    }
    return {...b,i,lobes,c:Math.cos(b.rotation),s:Math.sin(b.rotation)};
  });
  return (x, z) => {
    let distance = 100;
    for (const b of prepared) {
      const dx = x - b.centerX, dz = z - b.centerZ;
      const rx = b.radiusX - 0.32, rz = b.radiusZ - 0.32;
      const baseX = (dx * b.c + dz * b.s) / rx, baseZ = (-dx * b.s + dz * b.c) / rz;
      // Low-frequency domain warping makes composite contours flow into one another.
      const qx = baseX + Math.sin(baseZ * 3.1 + b.i * .73) * .045;
      const qz = baseZ + Math.sin(baseX * 3.7 - b.i * .57) * .035;
      let local=100;
      for(const lobe of b.lobes) {
        const ld=(Math.hypot((qx-lobe.x)/lobe.rx,(qz-lobe.z)/lobe.rz)-1)*Math.min(lobe.rx,lobe.rz);
        local=smoothMin(local,ld,.14);
      }
      // A broad, smoothly weighted indentation replaces the former circular subtraction.
      const bendAngle=b.i*1.73,c=Math.cos(bendAngle),s=Math.sin(bendAngle);
      const across=-qx*s+qz*c,along=qx*c+qz*s;
      const bend=Math.max(0,Math.min(1,(along-.10)/.65));
      local+=.12*Math.exp(-across*across/.22)*bend*bend*(3-2*bend);
      // Smoothly limit the extent inside the original collision envelope.
      const limit=Math.hypot(baseX,baseZ)-(.94+Math.sin(baseX*3.0+baseZ*2.0+b.i)*.015);
      local=-smoothMin(-local,-limit,.10);
      const d=local*Math.min(rx,rz);
      distance = smoothMin(distance, d, 0.8);
    }
    distance += (terrainNoise(x * 0.7, z * 0.7) - 0.5) * 0.17;
    // A smooth bank profile: raised turf -> dry sand -> wet sand -> submerged shelf -> riverbed.
    const h = 0.65 - 4.0 * (0.5 + 0.5 * Math.tanh((distance - 1.3) * 0.8));
    const detail = (terrainNoise(x * 1.7, z * 1.7) - 0.5) * 0.035;
    const riverbed = (terrainNoise(x * 0.19, z * 0.19) - 0.5) * 0.18;
    return h + detail + riverbed * Math.max(0, Math.min(1, distance / 2));
  };
}
