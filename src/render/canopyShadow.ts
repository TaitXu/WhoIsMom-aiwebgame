import * as THREE from "three";

export interface CanopyShadow {
  group: THREE.Group;
  update(elapsed: number): void;
}

type CanopyCluster = Readonly<{
  x: number;
  z: number;
  radius: number;
  leaves: number;
}>;

const canopyClusters: readonly CanopyCluster[] = [
  { x: -26, z: -23, radius: 6.2, leaves: 10 },
  { x: -9, z: -19, radius: 5.3, leaves: 9 },
  { x: 10, z: -24, radius: 6.6, leaves: 11 },
  { x: 27, z: -15, radius: 6.3, leaves: 10 },
  { x: -26, z: -2, radius: 6.8, leaves: 11 },
  { x: -7, z: 4, radius: 5.2, leaves: 9 },
  { x: 14, z: -2, radius: 6.5, leaves: 11 },
  { x: 29, z: 5, radius: 5.4, leaves: 9 },
  { x: -21, z: 19, radius: 6.2, leaves: 10 },
  { x: 1, z: 22, radius: 6.8, leaves: 11 },
  { x: 22, z: 21, radius: 6.4, leaves: 10 },
];

export function createCanopyShadow(): CanopyShadow {
  const group = new THREE.Group();
  group.name = "overhead-canopy-shadows";
  group.userData.effectType = "canopy-shadows";

  const leaves = createLeafShadows();
  const branches = createBranchShadows();
  group.add(leaves, branches);

  return {
    group,
    update(elapsed) {
      leaves.position.set(
        Math.sin(elapsed * 0.17) * 0.22,
        0,
        Math.cos(elapsed * 0.13) * 0.16,
      );
      leaves.rotation.y = Math.sin(elapsed * 0.07) * 0.008;
      branches.position.set(
        Math.sin(elapsed * 0.11 + 1.8) * 0.12,
        0,
        Math.cos(elapsed * 0.09 + 1.8) * 0.09,
      );
      branches.rotation.y = Math.sin(elapsed * 0.05 + 0.6) * 0.005;
    },
  };
}

function createLeafShadows(): THREE.InstancedMesh {
  const count = canopyClusters.reduce((total, cluster) => total + cluster.leaves, 0);
  const material = createShadowMaterial(0.12);
  const mesh = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 9), material, count);
  mesh.name = "canopy-leaf-shadows";
  mesh.renderOrder = 2;

  const random = createSeededRandom(0x51ad0);
  const dummy = new THREE.Object3D();
  let instanceIndex = 0;
  canopyClusters.forEach((cluster) => {
    for (let leafIndex = 0; leafIndex < cluster.leaves; leafIndex += 1) {
      const angle = random() * Math.PI * 2;
      const radius = Math.sqrt(random()) * cluster.radius;
      const width = 1 + random() * 1.55;
      const height = width * (0.5 + random() * 0.34);
      dummy.position.set(
        cluster.x + Math.cos(angle) * radius,
        0.042 + (instanceIndex % 5) * 0.0004,
        cluster.z + Math.sin(angle) * radius,
      );
      dummy.rotation.set(-Math.PI / 2, 0, angle + random() * 0.9);
      dummy.scale.set(width, height, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(instanceIndex, dummy.matrix);
      instanceIndex += 1;
    }
  });
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

function createBranchShadows(): THREE.InstancedMesh {
  const branches: ReadonlyArray<Readonly<[number, number, number, number, number]>> = [
    [-27, -20, 0.55, 12, 0.2],
    [-22, -17, 1.08, 6, 0.12],
    [-12, -7, 0.82, 10, 0.19],
    [-9, -4, 1.4, 5, 0.11],
    [-8, -3, 0.22, 4.5, 0.1],
    [7, -17, 0.6, 12, 0.18],
    [10, -13, 1.2, 5, 0.11],
    [24, -8, -0.72, 11, 0.18],
    [20, -5, -1.32, 5, 0.11],
    [-24, 10, -0.48, 12, 0.18],
    [-19, 8, -1.08, 5, 0.11],
    [-5, 15, 0.68, 10, 0.18],
    [-2, 12, 1.35, 4.5, 0.1],
    [1, 17, 0.12, 4, 0.09],
    [18, 14, -0.55, 13, 0.19],
    [14, 11, -1.2, 5, 0.11],
    [22, 17, 0.25, 4.5, 0.1],
    [30, 24, 0.74, 9, 0.16],
  ];
  const material = createShadowMaterial(0.145);
  const mesh = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 12), material, branches.length);
  mesh.name = "canopy-branch-shadows";
  mesh.renderOrder = 2;

  const dummy = new THREE.Object3D();
  branches.forEach(([x, z, angle, length, width], index) => {
    dummy.position.set(x, 0.04 + index * 0.0002, z);
    dummy.rotation.set(-Math.PI / 2, 0, angle);
    dummy.scale.set(length * 0.5, width, 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

function createShadowMaterial(opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: 0x174b43,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}
