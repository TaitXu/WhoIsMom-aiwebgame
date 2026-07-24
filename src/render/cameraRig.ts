import * as THREE from "three";

export interface CameraRig {
  camera: THREE.PerspectiveCamera;
  update(delta: number, playerPosition: THREE.Vector3): void;
  resize(width: number, height: number): void;
}

export function createCameraRig(): CameraRig {
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  const target = new THREE.Vector3(0, 0, -1.8);
  const desiredPosition = new THREE.Vector3();
  const desiredTarget = new THREE.Vector3();
  const lookAhead = new THREE.Vector3(0, 0, -2.6);
  const offset = new THREE.Vector3(7.2, 9.5, 10.8);
  camera.position.copy(offset);
  camera.lookAt(target);

  return {
    camera,
    update(delta, playerPosition) {
      const damping = 1 - Math.exp(-delta * 3.8);
      desiredTarget.copy(playerPosition).add(lookAhead);
      desiredPosition.copy(playerPosition).add(offset);
      camera.position.lerp(desiredPosition, damping);
      target.lerp(desiredTarget, damping);
      camera.lookAt(target);
    },
    resize(width, height) {
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
    },
  };
}
