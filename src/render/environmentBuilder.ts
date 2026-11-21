import * as THREE from "three";
import { createLandmarkModel } from "./landmarkModels";
import { createContinuousWetland } from "./continuousWetland";
import type { GateId, ObstacleId } from "../core/types";
import { demoCase } from "../game/case/demoCase";
import { createCanopyShadow } from "./canopyShadow";
import type { MaterialPalette } from "./materialPalette";
import { worldColors } from "./materialPalette";

export interface EnvironmentView {
  group: THREE.Group;
  obstacles: Record<ObstacleId, THREE.Group>;
  gates: Record<GateId, THREE.Group>;
  restPosition: THREE.Vector3;
  colliders: readonly TerrainCollider[];
  update(elapsed: number): void;
  renderUnderwater(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera): void;
  dispose(): void;
  setObstacleCleared(id: ObstacleId, cleared: boolean): void;
  setGateOpen(id: GateId, open: boolean): void;
  canOccupy(position: THREE.Vector3, radius: number): boolean;
}

export type TerrainCollider = Readonly<{
  centerX: number;
  centerZ: number;
  radiusX: number;
  radiusZ: number;
  rotation: number;
}>;

export function buildEnvironment(palette: MaterialPalette): EnvironmentView {
  const group = new THREE.Group();
  group.name = "nine-region-wetland";
  const colliders: TerrainCollider[] = [];

  demoCase.regions.forEach((region, index) => {
    addRegionBanks(region.center[0], region.center[2], index, colliders);
    addLandmark(group, palette, region.landmark, region.center[0], region.center[2], region.accentColor);
  });

  const wetland = createContinuousWetland(colliders);
  group.add(wetland.terrain, wetland.water, wetland.details);
  addInstancedReeds(group, palette);
  addInstancedPebbles(group, palette);
  const canopyShadow = createCanopyShadow();
  group.add(canopyShadow.group);

  const obstacles = Object.fromEntries(
    demoCase.obstacles.map((definition) => {
      const obstacle = createObstacle(definition.id, palette);
      obstacle.name = `obstacle-${definition.id}`;
      obstacle.userData.entityType = "obstacle";
      obstacle.userData.entityId = definition.id;
      obstacle.position.set(definition.position[0], definition.position[1], definition.position[2]);
      group.add(obstacle);
      return [definition.id, obstacle];
    }),
  ) as Record<ObstacleId, THREE.Group>;

  const gates = Object.fromEntries(
    demoCase.gates.map((definition) => {
      const gate = createGate(definition.id, palette);
      gate.name = `gate-${definition.id}`;
      gate.userData.entityType = "gate";
      gate.userData.entityId = definition.id;
      gate.position.set(definition.position[0], definition.position[1], definition.position[2]);
      group.add(gate);
      return [definition.id, gate];
    }),
  ) as Record<GateId, THREE.Group>;

  const restPosition = new THREE.Vector3(0, 0, 1.5);
  const rest = new THREE.Group();
  rest.position.copy(restPosition);
  const restLeaf = new THREE.Mesh(createLilyGeometry(1.5), palette.toon(0x728c48));
  restLeaf.rotation.x = -Math.PI / 2;
  restLeaf.position.y = -0.01;
  rest.add(restLeaf);
  const restRing = new THREE.Mesh(new THREE.RingGeometry(1.65, 1.78, 24), palette.basic(worldColors.cream, { transparent: true, opacity: 0.7, depthWrite: false }));
  restRing.rotation.x = -Math.PI / 2;
  restRing.position.y = 0.01;
  rest.add(restRing);
  rest.name = "rest-lotus";
  group.add(rest);

  return {
    group,
    obstacles,
    gates,
    restPosition,
    colliders,
    update(elapsed) {
      wetland.update(elapsed);
      canopyShadow.update(elapsed);
      Object.values(obstacles).forEach((obstacle, index) => {
        obstacle.rotation.y = Math.sin(elapsed * 0.8 + index) * 0.035;
        const marker = obstacle.userData.marker as THREE.Group | undefined;
        if (marker) {
          marker.position.y = 1.25 + Math.sin(elapsed * 2.6 + index) * 0.08;
          marker.rotation.y = elapsed * 1.2 + index;
          const pulse = 1 + Math.sin(elapsed * 3.2 + index) * 0.08;
          marker.scale.setScalar(pulse);
        }
      });
    },
    renderUnderwater: wetland.renderUnderwater,
    dispose: wetland.dispose,
    setObstacleCleared(id, cleared) {
      obstacles[id].visible = !cleared;
    },
    setGateOpen(id, open) {
      const blocker = gates[id].userData.blocker as THREE.Object3D | undefined;
      if (blocker) blocker.visible = !open;
      gates[id].userData.open = open;
    },
    canOccupy(position, radius) {
      return colliders.every((collider) => {
        const cos = Math.cos(collider.rotation);
        const sin = Math.sin(collider.rotation);
        const dx = position.x - collider.centerX;
        const dz = position.z - collider.centerZ;
        const localX = dx * cos + dz * sin;
        const localZ = -dx * sin + dz * cos;
        const radiusX = collider.radiusX + radius;
        const radiusZ = collider.radiusZ + radius;
        return (localX / radiusX) ** 2 + (localZ / radiusZ) ** 2 >= 1;
      });
    },
  };
}

function addRegionBanks(x: number, z: number, index: number, colliders: TerrainCollider[]): void {
  const offsets: Array<[number, number, number, number]> = [[-6.4, -5.8, 2.7, 2.2], [6.1, 5.7, 2.4, 2.8]];
  offsets.forEach(([ox, oz, sx, sz], localIndex) => colliders.push({
    centerX: x + ox, centerZ: z + oz,
    radiusX: 2.2 * sx + 0.32, radiusZ: 2.2 * sz + 0.32,
    rotation: (index * 0.47 + localIndex) % Math.PI,
  }));
}

function addLandmark(world: THREE.Group, palette: MaterialPalette, type: string, x: number, z: number, accent: number): void {
  const landmark=createLandmarkModel(type,palette,accent);
  landmark.position.set(x+4.7,0,z-4.7);
  world.add(landmark);
}

function addInstancedReeds(world: THREE.Group, palette: MaterialPalette): void {
  const count = 96;
  const reeds = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.018, 0.03, 1, 6), palette.toon(0x3b7937), count);
  const dummy = new THREE.Object3D();
  for (let index = 0; index < count; index += 1) {
    const region = demoCase.regions[index % demoCase.regions.length]!;
    const angle = index * 2.37;
    const radius = 6.4 + (index % 3) * 0.45;
    dummy.position.set(region.center[0] + Math.cos(angle) * radius, 0.45, region.center[2] + Math.sin(angle) * radius);
    dummy.rotation.set(Math.sin(index) * 0.05, angle, Math.cos(index * 1.7) * 0.08);
    dummy.scale.set(1, 0.7 + (index % 5) * 0.1, 1);
    dummy.updateMatrix();
    reeds.setMatrixAt(index, dummy.matrix);
  }
  reeds.instanceMatrix.needsUpdate = true;
  reeds.castShadow = true;
  reeds.receiveShadow = true;
  world.add(reeds);
  const heads = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.065, 0.22, 3, 6), palette.toon(0x73502c), count);
  for(let i=0;i<count;i++) {
    reeds.getMatrixAt(i,dummy.matrix);dummy.matrix.decompose(dummy.position,dummy.quaternion,dummy.scale);
    dummy.position.y += dummy.scale.y * 0.55;
    dummy.scale.set(1,1,1);dummy.updateMatrix();heads.setMatrixAt(i,dummy.matrix);
  }
  heads.castShadow=true;world.add(heads);
}

function addInstancedPebbles(world: THREE.Group, palette: MaterialPalette): void {
  const count = 42;
  const pebbles = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.32, 1), palette.toon(0x8c8065), count);
  const dummy = new THREE.Object3D();
  for (let index = 0; index < count; index += 1) {
    const region = demoCase.regions[(index * 5) % demoCase.regions.length]!;
    const angle = index * 1.83;
    dummy.position.set(region.center[0] + Math.cos(angle) * 7.3, 0.12, region.center[2] + Math.sin(angle) * 6.9);
    dummy.rotation.set(index, angle, 0.2);
    dummy.scale.set(0.7 + (index % 4) * 0.12, 0.5, 0.9);
    dummy.updateMatrix();
    pebbles.setMatrixAt(index, dummy.matrix);
  }
  pebbles.instanceMatrix.needsUpdate = true;
  world.add(pebbles);
}

function createObstacle(id: ObstacleId, palette: MaterialPalette): THREE.Group {
  const group = new THREE.Group();
  const warm = palette.toon(
    id === "driftwood-jam" ? 0xb76545
      : id === "petal-drift" ? 0xf07f9a
        : id === "silt-bubbles" ? 0x8f69c5
          : id === "lily-clutter" ? 0xd6a72e
            : 0x3f9b5a,
  );
  const pieceScale = id === "silt-bubbles" ? 1.35 : id === "petal-drift" ? 1.35 : 1.15;
  for (let index = 0; index < (id === "driftwood-jam" ? 3 : 5); index += 1) {
    const piece = new THREE.Mesh(
      id === "silt-bubbles" ? new THREE.SphereGeometry((0.28 + index * 0.03) * pieceScale, 20, 14) : id === "petal-drift" ? new THREE.CircleGeometry(0.45 * pieceScale, 24) : new THREE.CylinderGeometry(0.08 * pieceScale, 0.13 * pieceScale, 1.4 * pieceScale, 12),
      warm,
    );
    piece.position.set((index - 2) * 0.5, id === "silt-bubbles" ? 0.24 : 0.25, Math.sin(index * 1.7) * 0.5);
    piece.rotation.set(id === "petal-drift" ? -Math.PI / 2 : 0.3, index * 0.8, (index - 2) * 0.24);
    group.add(piece);
  }
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.72, 24), palette.basic(worldColors.accent, { transparent: true, opacity: 0.9, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  group.add(ring);

  // A high-contrast floating marker makes small obstacles legible from the camera.
  const marker = new THREE.Group();
  const markerStem = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.07, 0.9, 6), palette.toon(worldColors.ink));
  markerStem.position.y = 0.45;
  marker.add(markerStem);
  const markerHead = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), palette.toon(worldColors.accent));
  markerHead.position.y = 0.95;
  marker.add(markerHead);
  group.add(marker);
  group.userData.marker = marker;

  // Invisible interaction volume. This does not change navigation collision.
  const hitArea = new THREE.Mesh(
    new THREE.CylinderGeometry(1.9, 1.9, 1.35, 16),
    palette.basic(worldColors.accent, { transparent: true, opacity: 0, depthWrite: false }),
  );
  hitArea.position.y = 0.55;
  hitArea.userData.interactionOnly = true;
  group.add(hitArea);
  return group;
}

function createGate(id: GateId, palette: MaterialPalette): THREE.Group {
  const group = new THREE.Group();
  const count = id === "lotus-gate" ? 7 : 4;
  for (let index = 0; index < count; index += 1) {
    const pad = new THREE.Mesh(createLilyGeometry(id === "lotus-gate" ? 0.78 : 0.64), palette.toon(index % 2 === 0 ? 0x4fa55e : 0x69b96b));
    pad.rotation.x = -Math.PI / 2;
    pad.rotation.z = index * 0.55;
    pad.position.set(id === "lotus-gate" ? (index - 3) * 1.15 : Math.sin(index) * 0.4, 0.01 + (index % 2) * 0.035, id === "lotus-gate" ? Math.sin(index) * 0.35 : (index - 1.5) * 1.15);
    group.add(pad);
  }
  const blocker = new THREE.Group();
  for (let index = 0; index < 5; index += 1) {
    const reed = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 1.5, 5), palette.toon(worldColors.pink));
    reed.position.set(id === "lotus-gate" ? (index - 2) * 0.75 : Math.sin(index) * 0.55, 0.72, id === "lotus-gate" ? 0 : (index - 2) * 0.75);
    reed.rotation.z = (index - 2) * 0.08;
    blocker.add(reed);
  }
  group.userData.blocker = blocker;
  group.add(blocker);
  return group;
}

function createLilyGeometry(radius: number): THREE.ShapeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0,0);
  for(let i=0;i<=48;i++) {
    const a=0.18+(Math.PI*2-0.36)*i/48;
    const r=radius*(1+Math.sin(a*7)*0.025);
    shape.lineTo(Math.cos(a)*r,Math.sin(a)*r);
  }
  shape.lineTo(0,0);
  return new THREE.ShapeGeometry(shape,48);
}
