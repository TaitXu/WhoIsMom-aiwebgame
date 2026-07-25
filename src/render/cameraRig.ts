import * as THREE from "three";

export interface CameraRig {
  camera: THREE.PerspectiveCamera;
  update(delta: number, playerPosition: THREE.Vector3, movement?: THREE.Vector3): void;
  resize(width: number, height: number): void;
  getDistanceScale(): number;
}

export function createCameraRig(): CameraRig {
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 150);
  const target = new THREE.Vector3();
  const desiredPosition = new THREE.Vector3();
  const desiredTarget = new THREE.Vector3();
  const lookAhead = new THREE.Vector3();
  const baseOffset = new THREE.Vector3(0, 22, 12);
  let distanceScale = 1;

  camera.position.copy(baseOffset);
  camera.lookAt(target);

  return {
    camera,
    update(delta, playerPosition, movement) {
      const damping = 1 - Math.exp(-delta * 4.2);
      if (movement && movement.lengthSq() > 0.01) {
        lookAhead.lerp(movement.clone().setY(0).multiplyScalar(1.4), 1 - Math.exp(-delta * 3));
      } else {
        lookAhead.lerp(new THREE.Vector3(), 1 - Math.exp(-delta * 2.2));
      }
      desiredTarget.copy(playerPosition).add(lookAhead);
      desiredPosition.copy(playerPosition).addScaledVector(baseOffset, distanceScale);
      camera.position.lerp(desiredPosition, damping);
      target.lerp(desiredTarget, damping);
      camera.lookAt(target);
    },
    resize(width, height) {
      const aspect = width / Math.max(height, 1);
      camera.aspect = aspect;
      distanceScale = Math.max(1, Math.min(2.55, 1.15 / Math.max(aspect, 0.42)));
      camera.updateProjectionMatrix();
    },
    getDistanceScale() {
      return distanceScale;
    },
  };
}
