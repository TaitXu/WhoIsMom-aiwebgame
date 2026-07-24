import * as THREE from "three";

export const worldColors = {
  sky: 0xdcd9ea,
  water: 0x45bfd0,
  waterDeep: 0x218aa4,
  bank: 0xd9825b,
  bankLight: 0xeda370,
  grass: 0x74be57,
  leaf: 0x318c68,
  canopy: 0xf1c94b,
  ink: 0x173b45,
  tadpole: 0x263f49,
  player: 0x4fbd79,
  cream: 0xfff3c4,
  accent: 0xfff3a6,
} as const;

export interface MaterialPalette {
  toon(color: number): THREE.MeshToonMaterial;
  basic(
    color: number,
    options?: { transparent?: boolean; opacity?: number; depthWrite?: boolean },
  ): THREE.MeshBasicMaterial;
  dispose(): void;
}

export function createMaterialPalette(): MaterialPalette {
  const gradientMap = new THREE.DataTexture(
    new Uint8Array([72, 164, 255]),
    3,
    1,
    THREE.RedFormat,
  );
  gradientMap.minFilter = THREE.NearestFilter;
  gradientMap.magFilter = THREE.NearestFilter;
  gradientMap.generateMipmaps = false;
  gradientMap.needsUpdate = true;

  const toonCache = new Map<number, THREE.MeshToonMaterial>();
  const basicCache = new Map<string, THREE.MeshBasicMaterial>();

  return {
    toon(color) {
      let material = toonCache.get(color);
      if (!material) {
        material = new THREE.MeshToonMaterial({
          color,
          gradientMap,
        });
        toonCache.set(color, material);
      }
      return material;
    },
    basic(color, options = {}) {
      const transparent = options.transparent ?? false;
      const opacity = options.opacity ?? 1;
      const depthWrite = options.depthWrite ?? true;
      const key = `${color}:${transparent}:${opacity}:${depthWrite}`;
      let material = basicCache.get(key);
      if (!material) {
        material = new THREE.MeshBasicMaterial({
          color,
          transparent,
          opacity,
          depthWrite,
        });
        basicCache.set(key, material);
      }
      return material;
    },
    dispose() {
      toonCache.forEach((material) => material.dispose());
      basicCache.forEach((material) => material.dispose());
      gradientMap.dispose();
    },
  };
}
