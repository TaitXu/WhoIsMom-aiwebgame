import { describe, expect, it } from 'vitest';
import { createTerrainField, WATER_LEVEL } from '../src/render/terrainField';

const banks = [
  {centerX:-6.4,centerZ:-5.8,radiusX:6.26,radiusZ:5.16,rotation:0},
  {centerX:6.1,centerZ:5.7,radiusX:5.60,radiusZ:6.48,rotation:1},
];
describe('continuous wetland elevation',()=>{
  const sample=createTerrainField(banks);
  it('keeps the spawn channel submerged and bank centers dry',()=>{
    expect(sample(0,0)).toBeLessThan(WATER_LEVEL-0.3);
    for(const b of banks)expect(sample(b.centerX,b.centerZ)).toBeGreaterThan(WATER_LEVEL+0.3);
  });
  it('has no height jumps at old bank boundaries or joins',()=>{
    // Traverse both shorelines and the central channel at sub-mesh spacing.
    let previous=sample(-15,-5.8);
    for(let x=-14.975;x<=15;x+=.025){
      const h=sample(x,-5.8);
      expect(Number.isFinite(h)).toBe(true);
      expect(Math.abs(h-previous)).toBeLessThan(.06);
      previous=h;
    }
  });
  it('merges overlapping banks into one continuous raised surface',()=>{
    const overlapping=createTerrainField([
      {centerX:-1,centerZ:0,radiusX:4,radiusZ:4,rotation:0},
      {centerX:1,centerZ:0,radiusX:4,radiusZ:4,rotation:0},
    ]);
    for(let x=-1;x<=1;x+=.1)expect(overlapping(x,0)).toBeGreaterThan(.5);
  });
});

describe('reshaped bank layout safety',()=>{
  const regions=[[-18,-18],[0,-18],[18,-18],[-18,0],[0,0],[18,0],[-18,18],[0,18],[18,18]];
  const layoutBanks=regions.flatMap(([x,z],index)=>[
    {centerX:x!-6.4,centerZ:z!-5.8,radiusX:6.26,radiusZ:5.16,rotation:(index*.47)%Math.PI},
    {centerX:x!+6.1,centerZ:z!+5.7,radiusX:5.60,radiusZ:6.48,rotation:(index*.47+1)%Math.PI},
  ]);
  const height=createTerrainField(layoutBanks);
  it('does not introduce dry land in the original navigable corridors',()=>{
    for(let x=-29;x<=29;x+=1)for(let z=-29;z<=29;z+=1){
      const wasWater=layoutBanks.every(b=>{
        const dx=x-b.centerX,dz=z-b.centerZ,c=Math.cos(b.rotation),s=Math.sin(b.rotation);
        return ((dx*c+dz*s)/b.radiusX)**2+((-dx*s+dz*c)/b.radiusZ)**2>=1;
      });
      if(wasWater)expect(height(x,z)).toBeLessThan(WATER_LEVEL);
    }
  });
  it('keeps all nine region centers underwater',()=>{
    for(const [x,z] of regions)expect(height(x!,z!)).toBeLessThan(WATER_LEVEL-.1);
  });
});
