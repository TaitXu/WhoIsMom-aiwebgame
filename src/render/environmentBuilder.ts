import * as THREE from "three";
import type { MaterialPalette } from "./materialPalette";
import { worldColors } from "./materialPalette";

export interface EnvironmentView {
  group: THREE.Group;
  update(elapsed: number): void;
}

export function buildEnvironment(palette: MaterialPalette): EnvironmentView {
  const group = new THREE.Group();
  group.name = "river-environment";

  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 47),
    palette.toon(worldColors.water),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.04, -15.4);
  water.name = "river-water";
  group.add(water);

  const pond = new THREE.Mesh(
    new THREE.CircleGeometry(7.2, 18),
    palette.toon(worldColors.waterDeep),
  );
  pond.rotation.x = -Math.PI / 2;
  pond.scale.set(1, 1.35, 1);
  pond.position.set(0, -0.035, -36);
  group.add(pond);

  group.add(createBank(-7, palette), createBank(7, palette));
  addRiverDetails(group, palette);
  addInstancedLilies(group, palette);
  addPondReeds(group, palette);
  const waterHighlights = addWaterHighlights(group, palette);

  return {
    group,
    update(elapsed) {
      waterHighlights.forEach((highlight, index) => {
        highlight.position.z = 4 - ((elapsed * (0.45 + index * 0.035) + index * 7.1) % 43);
        highlight.position.x = Math.sin(elapsed * 0.35 + index * 1.8) * 2.7;
      });
    },
  };
}

function createBank(x: number, palette: MaterialPalette): THREE.Group {
  const bank = new THREE.Group();
  const ground = new THREE.Mesh(
    new THREE.BoxGeometry(5.2, 0.5, 47),
    palette.toon(worldColors.bank),
  );
  ground.position.set(x, -0.27, -15.4);
  bank.add(ground);

  const grass = new THREE.Mesh(
    new THREE.BoxGeometry(4.6, 0.18, 47),
    palette.toon(worldColors.grass),
  );
  grass.position.set(x + Math.sign(x) * 0.3, 0.02, -15.4);
  bank.add(grass);
  return bank;
}

function addRiverDetails(world: THREE.Group, palette: MaterialPalette): void {
  const rockGeometry = new THREE.DodecahedronGeometry(0.65, 0);
  const trunkGeometry = new THREE.CylinderGeometry(0.18, 0.26, 2.8, 6);
  const canopyGeometry = new THREE.DodecahedronGeometry(1.15, 1);

  const rockData: Array<[number, number, number, number]> = [
    [-4.9, 0.28, 1, 0.8],
    [5.2, 0.35, -4.5, 1.15],
    [-5.1, 0.3, -11.5, 0.9],
    [5.4, 0.34, -19.5, 1.05],
    [-5.3, 0.25, -27, 0.75],
    [5.1, 0.3, -31.5, 1],
  ];
  rockData.forEach(([x, y, z, scale], index) => {
    const rock = new THREE.Mesh(
      rockGeometry,
      palette.toon(index % 2 === 0 ? worldColors.bankLight : 0xb85f50),
    );
    rock.position.set(x, y, z);
    rock.rotation.set(0.2 * index, 0.7 * index, 0.1);
    rock.scale.set(scale * 1.2, scale * 0.7, scale);
    world.add(rock);
  });

  const treeData: Array<[number, number, number, number]> = [
    [-7.1, 0, -2.5, 1.1],
    [7.2, 0, -8.5, 0.9],
    [-7.4, 0, -18, 1.05],
    [7.5, 0, -27, 1.2],
    [-6.7, 0, -34, 0.95],
  ];
  treeData.forEach(([x, y, z, scale], index) => {
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeometry, palette.toon(0x704d43));
    trunk.position.y = 1.35;
    trunk.rotation.z = index % 2 === 0 ? 0.06 : -0.07;
    const canopy = new THREE.Mesh(
      canopyGeometry,
      palette.toon(index % 3 === 0 ? worldColors.canopy : worldColors.leaf),
    );
    canopy.position.set(0.15, 3, 0);
    canopy.scale.set(1.25, 0.9, 1.1);
    tree.add(trunk, canopy);
    tree.position.set(x, y, z);
    tree.scale.setScalar(scale);
    world.add(tree);
  });

  const goalArch = new THREE.Group();
  const archMaterial = palette.toon(worldColors.canopy);
  const postGeometry = new THREE.CylinderGeometry(0.16, 0.23, 3.1, 6);
  const leftPost = new THREE.Mesh(postGeometry, archMaterial);
  const rightPost = leftPost.clone();
  leftPost.position.set(-3.6, 1.5, -31.5);
  rightPost.position.set(3.6, 1.5, -31.5);
  const crown = new THREE.Mesh(
    new THREE.TorusGeometry(3.6, 0.18, 5, 14, Math.PI),
    archMaterial,
  );
  crown.rotation.z = Math.PI;
  crown.position.set(0, 3.05, -31.5);
  goalArch.add(leftPost, rightPost, crown);
  world.add(goalArch);
}

function addInstancedLilies(world: THREE.Group, palette: MaterialPalette): void {
  const positions: Array<[number, number, number, number]> = [
    [-2.6, 0.01, -1, 0.42],
    [2.3, 0.01, -6, 0.54],
    [-2.5, 0.01, -10, 0.44],
    [2.2, 0.01, -15, 0.5],
    [-2.4, 0.01, -21, 0.42],
    [2.5, 0.01, -26, 0.52],
    [-3.4, 0.01, -34.8, 0.62],
    [3.7, 0.01, -36.4, 0.58],
  ];
  const lilies = new THREE.InstancedMesh(
    new THREE.CircleGeometry(1, 7),
    palette.toon(0x4ea75c),
    positions.length,
  );
  const dummy = new THREE.Object3D();
  positions.forEach(([x, y, z, scale], index) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(-Math.PI / 2, 0, index * 0.8);
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
    lilies.setMatrixAt(index, dummy.matrix);
  });
  lilies.instanceMatrix.needsUpdate = true;
  world.add(lilies);
}

function addPondReeds(world: THREE.Group, palette: MaterialPalette): void {
  const reedCount = 30;
  const reeds = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.035, 0.055, 1, 5),
    palette.toon(0x397a50),
    reedCount,
  );
  const dummy = new THREE.Object3D();
  for (let index = 0; index < reedCount; index += 1) {
    const side = index % 2 === 0 ? -1 : 1;
    const angle = (index / reedCount) * Math.PI * 2;
    const radius = 5 + (index % 4) * 0.2;
    dummy.position.set(
      side * (4.2 + Math.abs(Math.sin(angle)) * 1.1),
      0.55,
      -35.7 + Math.cos(angle) * radius * 0.65,
    );
    dummy.rotation.set(Math.sin(index) * 0.04, angle, Math.cos(index * 1.7) * 0.08);
    dummy.scale.set(1, 0.8 + (index % 5) * 0.12, 1);
    dummy.updateMatrix();
    reeds.setMatrixAt(index, dummy.matrix);
  }
  reeds.instanceMatrix.needsUpdate = true;
  world.add(reeds);
}

function addWaterHighlights(
  world: THREE.Group,
  palette: MaterialPalette,
): THREE.Mesh[] {
  const material = palette.basic(0xb7f2ec, {
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
  });
  return Array.from({ length: 6 }, (_, index) => {
    const highlight = new THREE.Mesh(new THREE.PlaneGeometry(1.2 + (index % 3) * 0.4, 0.055), material);
    highlight.rotation.x = -Math.PI / 2;
    highlight.rotation.z = index % 2 === 0 ? 0.15 : -0.12;
    highlight.position.set((index % 3 - 1) * 2.3, 0.015, 3 - index * 6.5);
    highlight.renderOrder = 1;
    world.add(highlight);
    return highlight;
  });
}
