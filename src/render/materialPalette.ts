import * as THREE from "three";
import { stylizedSurface } from "./stylizedSurface";

export const worldColors = {
  sky: 0xb5b09c,
  water: 0x399f9f,
  waterDeep: 0x146878,
  waterLight: 0xb0d9c0,
  bank: 0xc4aa75,
  bankLight: 0xe4cf99,
  grass: 0x8c9860,
  leaf: 0x4c7045,
  canopy: 0xc7b66d,
  ink: 0x163e46,
  tadpole: 0x29464c,
  player: 0x57bd78,
  cream: 0xfff5cf,
  accent: 0xffe58d,
  pink: 0xee98aa,
  coral: 0xe87866,
} as const;

export interface MaterialPalette {
  toon(color: number): THREE.MeshToonMaterial;
  basic(color: number, options?: { transparent?: boolean; opacity?: number; depthWrite?: boolean }): THREE.MeshBasicMaterial;
  outline(thickness?: number): THREE.ShaderMaterial;
  dispose(): void;
}

export function createMaterialPalette(): MaterialPalette {
  const gradientMap = new THREE.DataTexture(new Uint8Array([96, 176, 255]), 3, 1, THREE.RedFormat);
  gradientMap.minFilter = THREE.NearestFilter;
  gradientMap.magFilter = THREE.NearestFilter;
  gradientMap.generateMipmaps = false;
  gradientMap.needsUpdate = true;

  const toonCache = new Map<number, THREE.MeshToonMaterial>();
  const basicCache = new Map<string, THREE.MeshBasicMaterial>();
  const outlineCache = new Map<number, THREE.ShaderMaterial>();

  return {
    toon(color) {
      let material = toonCache.get(color);
      if (!material) {
        material = stylizedSurface(color);
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
        material = new THREE.MeshBasicMaterial({ color, transparent, opacity, depthWrite });
        basicCache.set(key, material);
      }
      return material;
    },
    outline(thickness = 0.035) {
      let material = outlineCache.get(thickness);
      if (!material) {
        material = new THREE.ShaderMaterial({
          uniforms: { thickness: { value: thickness }, outlineColor: { value: new THREE.Color(worldColors.ink) } },
          vertexShader: `
            uniform float thickness;
            void main() {
              vec3 expanded = position + normal * thickness;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(expanded, 1.0);
            }
          `,
          fragmentShader: `
            uniform vec3 outlineColor;
            void main() { gl_FragColor = vec4(outlineColor, 1.0); }
          `,
          side: THREE.BackSide,
          depthWrite: false,
        });
        outlineCache.set(thickness, material);
      }
      return material;
    },
    dispose() {
      toonCache.forEach((material) => material.dispose());
      basicCache.forEach((material) => material.dispose());
      outlineCache.forEach((material) => material.dispose());
      gradientMap.dispose();
    },
  };
}
