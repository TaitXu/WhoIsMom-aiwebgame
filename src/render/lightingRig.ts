import * as THREE from "three";

export function createLightingRig(scene: THREE.Scene): THREE.Group {
  const rig = new THREE.Group();
  rig.name = "soft-daylight-rig";

  const hemisphere = new THREE.HemisphereLight(0xf0f2ff, 0xd68a68, 1.45);
  hemisphere.position.set(0, 30, 0);
  rig.add(hemisphere);

  const sun = new THREE.DirectionalLight(0xffefd0, 2.25);
  sun.position.set(-18, 28, 14);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = false;
  rig.add(sun, sun.target);

  scene.add(rig);
  return rig;
}
