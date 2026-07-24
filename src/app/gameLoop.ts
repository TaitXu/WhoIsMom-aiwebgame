import * as THREE from "three";

export interface GameLoop {
  start(): void;
  stop(): void;
}

export function createGameLoop(
  renderer: THREE.WebGLRenderer,
  update: (delta: number, elapsed: number) => void,
): GameLoop {
  const clock = new THREE.Clock();

  return {
    start() {
      clock.start();
      renderer.setAnimationLoop(() => {
        const delta = Math.min(clock.getDelta(), 0.05);
        update(delta, clock.elapsedTime);
      });
    },
    stop() {
      renderer.setAnimationLoop(null);
      clock.stop();
    },
  };
}
