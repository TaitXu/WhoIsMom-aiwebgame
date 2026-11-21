import * as THREE from 'three';

// Broad, softly filtered light bands keep all opaque scenery in the same visual language.
const ramp = new THREE.DataTexture(new Uint8Array([112, 152, 194, 226, 255]), 5, 1, THREE.RedFormat);
ramp.minFilter = ramp.magFilter = THREE.LinearFilter;
ramp.generateMipmaps = false;ramp.needsUpdate = true;

export function stylizedSurface(color: THREE.ColorRepresentation, options: {
  side?: THREE.Side; transparent?: boolean; opacity?: number; depthWrite?: boolean;
} = {}): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({ color, gradientMap: ramp, ...options });
}

// Ground and blades share exactly the same world-space palette, inspired by Dylearn's
// noise-based floor/grass matching (https://github.com/DylearnDev/Dylearn-3D-Pixel-Art-Grass-Demo).  These are new Three.js shaders, without copied assets.
export const meadowGLSL = `
float meadowHash(vec2 p) {return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float meadowNoise(vec2 p) {
  vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(meadowHash(i),meadowHash(i+vec2(1,0)),f.x),mix(meadowHash(i+vec2(0,1)),meadowHash(i+vec2(1)),f.x),f.y);
}
vec3 meadowColor(vec2 p) {
  float meadowPatch=meadowNoise(p*.40), accent=meadowNoise(p*.83+17.0);
  vec3 base=mix(vec3(.15,.36,.035),vec3(.22,.46,.055),smoothstep(.42,.62,meadowPatch));
  return mix(base,vec3(.27,.49,.075),smoothstep(.66,.76,accent)*.65);
}
`;
