import * as THREE from "three";

export function createLightingRig(scene: THREE.Scene): THREE.Group {
  const rig = new THREE.Group();
  rig.name = "lighting-rig";

  const hemisphere = new THREE.HemisphereLight(0xf2f1ff, 0x9a5d45, 1.7);
  hemisphere.position.set(0, 24, 0);
  rig.add(hemisphere);

  const sun = new THREE.DirectionalLight(0xfff1ce, 3.1);
  sun.position.set(-10, 16, 7);
  sun.target.position.set(0, 0, -12);
  sun.castShadow = false;
  rig.add(sun, sun.target);

  scene.add(rig);
  return rig;
}
