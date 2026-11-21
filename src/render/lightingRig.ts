import * as THREE from "three";

export function createLightingRig(scene: THREE.Scene): THREE.Group {
  const rig = new THREE.Group();
  rig.name = "soft-daylight-rig";

  const hemisphere = new THREE.HemisphereLight(0xd2edfa, 0x79663d, 0.85);
  hemisphere.position.set(0, 30, 0);
  rig.add(hemisphere);

  const sun = new THREE.DirectionalLight(0xfff4df, 3.0);
  sun.position.set(-18, 28, 14);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -23, right: 23, top: 23, bottom: -23, near: 1, far: 100 });
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.035;
  sun.shadow.radius = 3;
  rig.add(sun, sun.target);

  scene.add(rig);
  return rig;
}
