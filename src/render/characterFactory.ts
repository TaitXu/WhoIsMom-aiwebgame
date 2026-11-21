import * as THREE from "three";
import { createPufferModel, createTadpoleModel } from "./heroModels";
import type { AgentId, FrogFeatures, FrogId, NpcId, Personality } from "../core/types";
import type { CandidateFrog } from "../game/case/caseTypes";
import { agentMarkerColors, getPersonalityMotion } from "../game/agents/personality";
import { createCharacterView, type CharacterView, type FrogCharacterView } from "./characterView";
import type { MaterialPalette } from "./materialPalette";
import { worldColors } from "./materialPalette";

export function createPlayerFish(palette: MaterialPalette): CharacterView {
  const group = createRoot("player-fish", "player");
  const {model,body,tail}=createPufferModel(palette);
  group.add(model);
  addFakeShadow(group, palette, 0.78);
  return createCharacterView({ group, motionRoot: model, tail, body, tailAmplitude: 0.16, tailFrequency: 4.2, bobAmplitude: 0.045 });
}

export function createTadpole(id: AgentId, personality: Personality, palette: MaterialPalette, phase: number): CharacterView {
  const motion = getPersonalityMotion(personality);
  const group = createRoot(`agent-${id}`, "agent", id);
  const {model,body,tail}=createTadpoleModel(agentMarkerColors[id],phase);
  group.add(model);
  addFakeShadow(group, palette, 0.36);

  const selectionRing = new THREE.Mesh(new THREE.RingGeometry(0.44, 0.52, 20), palette.basic(agentMarkerColors[id]));
  selectionRing.rotation.x = -Math.PI / 2;
  selectionRing.position.y = 0.018;
  selectionRing.visible = false;
  group.add(selectionRing);

  const statusMarker = new THREE.Mesh(new THREE.OctahedronGeometry(0.12, 0), palette.basic(worldColors.accent));
  statusMarker.position.set(0, 0.96, 0);
  statusMarker.visible = false;
  group.add(statusMarker);

  return createCharacterView({
    group,
    motionRoot: model,
    tail,
    body,
    selectionRing,
    statusMarker,
    statusMaterials: {
      approaching: palette.basic(worldColors.coral),
      interacting: palette.basic(worldColors.waterLight),
      working: palette.basic(worldColors.accent),
      teaching: palette.basic(worldColors.pink),
      jumping: palette.basic(0x9cdd79),
      returning: palette.basic(0x8fc7de),
      discussing: palette.basic(0xf1c94b),
      considering: palette.basic(0xe98b91),
      tired: palette.basic(0xd9825b),
    },
    tailAmplitude: motion.tailAmplitude,
    tailFrequency: motion.tailFrequency,
    bobAmplitude: motion.bobAmplitude,
    phase,
  });
}

export function createNpc(id: NpcId, palette: MaterialPalette): CharacterView {
  if (id === "dragonfly") return createDragonfly(palette);
  if (id === "turtle") return createTurtle(palette);
  if (id === "grasshopper") return createGrasshopper(palette);
  return createCrab(palette);
}

export function createFrog(definition: CandidateFrog, palette: MaterialPalette): FrogCharacterView {
  const group = createRoot(`frog-${definition.id}`, "frog", definition.id satisfies FrogId);
  const model = new THREE.Group();
  group.add(model);
  const bodyMaterial = palette.toon(0x65884b).clone();
  const bellyMaterial = palette.toon(0xe8c85f).clone();
  const irisMaterial = palette.basic(0xd58a35).clone();
  const redMaterial = palette.toon(0xd94f55).clone();
  const body = mesh(model, faceted(new THREE.SphereGeometry(0.74, 20, 14)), bodyMaterial, [0, 0.72, 0.02], [1.22, 0.72, 1.16], palette, 0.055);
  mesh(model, faceted(new THREE.SphereGeometry(0.51, 20, 14)), bellyMaterial, [0, 0.58, -0.54], [0.94, 0.5, 0.42], palette, 0.03);
  addFrogEyes(model, palette, 0.37, 1.14, -0.5, 0.19, irisMaterial);
  const hindLegs = addSharedFrogLegs(model, palette, bodyMaterial);
  const markingGroups = addFrogMarkingGroups(model, palette);
  const headGroups = {
    "leaf-hat": addLeafHat(model, palette),
    "reed-crown": addReedCrown(model, palette),
  };
  const redAdornmentGroups = {
    "ankle-ribbons": addAnkleRibbons(model, palette, redMaterial),
    scarf: addScarf(model, palette, redMaterial),
    "flower-pin": addFlowerPin(model, palette, redMaterial),
  };
  addFakeShadow(group, palette, 0.84);
  const interactionRing = createInteractionRing(palette, 0xd94f55, 0.94);
  group.add(interactionRing);
  const tail = new THREE.Group();
  model.add(tail);
  const view = createCharacterView({ group, motionRoot: model, tail, body, interactionRing, tailAmplitude: 0.04, tailFrequency: 2, bobAmplitude: 0.03, phase: definition.id === "tree-frog" ? 0 : definition.id === "bullfrog" ? 1.4 : 2.8 });

  function applyAppearance(features: FrogFeatures): void {
    bodyMaterial.color.setHex(frogBodyColors[features.bodyTone]);
    bellyMaterial.color.setHex(frogBellyColors[features.bellyTone]);
    irisMaterial.color.setHex(frogEyeColors[features.eyeTone]);
    Object.entries(markingGroups).forEach(([key, markingGroup]) => {
      markingGroup.visible = key === features.markingPattern;
    });
    Object.entries(headGroups).forEach(([key, adornmentGroup]) => {
      adornmentGroup.visible = key === features.headAdornment;
    });
    Object.entries(redAdornmentGroups).forEach(([key, adornmentGroup]) => {
      adornmentGroup.visible = key === features.redAdornment;
    });
    const sturdy = features.hindLegShape === "sturdy";
    hindLegs.scale.set(sturdy ? 1.14 : 0.94, sturdy ? 1.08 : 1, sturdy ? 1.08 : 1.02);
    group.userData.frogFeatures = { ...features };
  }

  applyAppearance(definition.features);
  return { ...view, applyAppearance };
}

const frogBodyColors: Record<FrogFeatures["bodyTone"], number> = {
  "blue-green": 0x55b8a4,
  "olive-green": 0x6f9255,
  "olive-brown": 0x7f7d4d,
};

const frogBellyColors: Record<FrogFeatures["bellyTone"], number> = {
  cream: 0xf4ead2,
  "warm-yellow": 0xe8c85f,
};

const frogEyeColors: Record<FrogFeatures["eyeTone"], number> = {
  "red-brown": 0xad4f3d,
  amber: 0xd99c34,
};

function createDragonfly(palette: MaterialPalette): CharacterView {
  const group = createRoot("npc-dragonfly", "npc", "dragonfly");
  const model = new THREE.Group();
  group.add(model);
  const body = mesh(model, faceted(new THREE.CapsuleGeometry(0.13, 0.7, 3, 6)), palette.toon(0x5270bd), [0, 0.82, 0], [1, 1, 1], palette, 0.04);
  body.rotation.x = Math.PI / 2;
  const tail = new THREE.Group();
  tail.position.copy(body.position);
  const wingMaterial = palette.basic(0xe3f8ef, { transparent: true, opacity: 0.78, depthWrite: false });
  [-1, 1].forEach((side) => {
    const wing = mesh(tail, new THREE.CircleGeometry(0.36, 6), wingMaterial, [side * 0.4, 0, 0], [1.7, 0.5, 1]);
    wing.rotation.x = -Math.PI / 2;
    wing.renderOrder = 1;
  });
  model.add(tail);
  addEyes(model, palette, 0.12, 0.91, -0.38, 0.07);
  addFakeShadow(group, palette, 0.4);
  const interactionRing = createInteractionRing(palette, 0x8fc7de, 0.54);
  group.add(interactionRing);
  return createCharacterView({ group, motionRoot: model, tail, body, interactionRing, tailAmplitude: 0.42, tailFrequency: 15, bobAmplitude: 0.13 });
}

function createGrasshopper(palette: MaterialPalette): CharacterView {
  const group = createRoot("npc-grasshopper", "npc", "grasshopper");
  const model = new THREE.Group();
  group.add(model);
  const body = mesh(model, faceted(new THREE.SphereGeometry(0.42, 20, 14)), palette.toon(0x75b84d), [0, 0.48, 0], [0.72, 0.62, 1.2], palette, 0.045);
  const tail = new THREE.Group();
  [-1, 1].forEach((side) => {
    const leg = mesh(tail, new THREE.CylinderGeometry(0.06, 0.1, 1.05, 5), palette.toon(0x4c8f46), [side * 0.47, 0.34, 0.2]);
    leg.rotation.z = side * 0.9;
  });
  model.add(tail);
  addEyes(model, palette, 0.2, 0.67, -0.38, 0.1);
  addFakeShadow(group, palette, 0.5);
  const interactionRing = createInteractionRing(palette, worldColors.accent, 0.62);
  group.add(interactionRing);
  return createCharacterView({ group, motionRoot: model, tail, body, interactionRing, tailAmplitude: 0.18, tailFrequency: 7, bobAmplitude: 0.08, phase: 0.7 });
}

function createTurtle(palette: MaterialPalette): CharacterView {
  const group = createRoot("npc-turtle", "npc", "turtle");
  const model = new THREE.Group();
  group.add(model);
  const body = mesh(model, new THREE.DodecahedronGeometry(0.58, 1), palette.toon(0x5d8e54), [0, 0.36, 0], [1, 0.45, 1.25], palette, 0.045);
  mesh(model, new THREE.DodecahedronGeometry(0.55, 1), palette.toon(0x8a6c45), [0, 0.56, 0.08], [1, 0.45, 1.05], palette, 0.035);
  const head = mesh(model, faceted(new THREE.SphereGeometry(0.27, 20, 14)), palette.toon(0x83ad65), [0, 0.38, -0.72], [1, 1, 1], palette, 0.035);
  addEyes(model, palette, 0.13, 0.45, -0.92, 0.06);
  [-1,1].forEach(side => {
    [-0.4,0.45].forEach(z => mesh(model,new THREE.SphereGeometry(0.17,12,8),palette.toon(0x718757),[side*0.5,0.18,z],[1.3,0.45,1.5]));
  });
  for(let i=0;i<7;i++) {
    const a=i*Math.PI/3;
    mesh(model,new THREE.SphereGeometry(0.17,6,4),palette.toon(i%2?0x827345:0x9a8756),[i===6?0:Math.cos(a)*0.31,0.76,i===6?0.08:Math.sin(a)*0.32+0.08],[1,0.18,1]);
  }
  addFakeShadow(group, palette, 0.67);
  const interactionRing = createInteractionRing(palette, 0xe8c85f, 0.8);
  group.add(interactionRing);
  return createCharacterView({ group, motionRoot: model, tail: head, body, interactionRing, tailAmplitude: 0.05, tailFrequency: 2.2, bobAmplitude: 0.025, phase: 1 });
}

function createCrab(palette: MaterialPalette): CharacterView {
  const group = createRoot("npc-crab", "npc", "crab");
  const model = new THREE.Group();
  group.add(model);
  const body = mesh(model, faceted(new THREE.SphereGeometry(0.48, 20, 14)), palette.toon(0xe56f59), [0, 0.32, 0], [1.2, 0.5, 0.8], palette, 0.045);
  const tail = new THREE.Group();
  [-1, 1].forEach((side) => {
    const claw = mesh(tail, new THREE.ConeGeometry(0.24, 0.48, 5), palette.toon(0xc94e48), [side * 0.72, 0.4, -0.1], [1, 1, 1], palette, 0.03);
    claw.rotation.z = side * Math.PI / 2;
  });
  model.add(tail);
  addEyes(model, palette, 0.2, 0.55, -0.32, 0.08);
  [-1,1].forEach(side => {
    for(let i=0;i<3;i++) {
      const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(side*0.3,0.27,i*0.22-0.1),new THREE.Vector3(side*0.65,0.26,i*0.3),new THREE.Vector3(side*0.8,0.06,i*0.36+0.1)]);
      mesh(model,new THREE.TubeGeometry(curve,8,0.035,5,false),palette.toon(0xa95f44));
    }
  });
  addFakeShadow(group, palette, 0.57);
  const interactionRing = createInteractionRing(palette, worldColors.pink, 0.7);
  group.add(interactionRing);
  return createCharacterView({ group, motionRoot: model, tail, body, interactionRing, tailAmplitude: 0.28, tailFrequency: 4.4, bobAmplitude: 0.035, phase: 2 });
}

function createRoot(name: string, entityType: string, entityId?: string): THREE.Group {
  const group = new THREE.Group();
  group.name = name;
  group.userData.entityType = entityType;
  if (entityId) group.userData.entityId = entityId;
  return group;
}

function mesh(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position: readonly [number, number, number] = [0, 0, 0],
  scale: readonly [number, number, number] = [1, 1, 1],
  _palette?: MaterialPalette,
  _outlineWidth?: number,
): THREE.Mesh {
  const result = new THREE.Mesh(geometry, material);
  result.position.set(...position);
  result.scale.set(...scale);
  result.castShadow = true;
  result.receiveShadow = true;
  parent.add(result);
  return result;
}

function faceted<T extends THREE.BufferGeometry>(geometry: T): T {
  geometry.computeVertexNormals();
  return geometry;
}

function createInteractionRing(palette: MaterialPalette, color: number, radius: number): THREE.Mesh {
  const ring = new THREE.Mesh(new THREE.RingGeometry(radius, radius + 0.09, 24), palette.basic(color, { transparent: true, opacity: 0.72, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.025;
  ring.visible = false;
  ring.renderOrder = 2;
  return ring;
}

function addEyes(group: THREE.Group, palette: MaterialPalette, x: number, y: number, z: number, radius: number): void {
  const white = palette.basic(worldColors.cream);
  const pupil = palette.basic(worldColors.ink);
  [-1, 1].forEach((side) => {
    const eye = mesh(group, faceted(new THREE.SphereGeometry(radius, 20, 14)), white, [side * x, y, z], [1, 1, 1], palette, radius * 0.22);
    mesh(eye, faceted(new THREE.SphereGeometry(radius * 0.48, 20, 14)), pupil, [0, 0, -radius * 0.78]);
  });
}

function addFrogEyes(
  group: THREE.Group,
  palette: MaterialPalette,
  x: number,
  y: number,
  z: number,
  radius: number,
  iris: THREE.Material,
): void {
  const pupil = palette.basic(worldColors.ink);
  [-1, 1].forEach((side) => {
    const eye = mesh(group, faceted(new THREE.SphereGeometry(radius, 20, 14)), iris, [side * x, y, z], [1, 1, 1], palette, radius * 0.2);
    mesh(eye, faceted(new THREE.SphereGeometry(radius * 0.48, 20, 14)), pupil, [0, 0, -radius * 0.78]);
  });
}

function addSharedFrogLegs(group: THREE.Group, palette: MaterialPalette, legMaterial: THREE.Material): THREE.Group {
  const hindLegs = new THREE.Group();
  group.add(hindLegs);
  const toeMaterial = palette.toon(0xcaa45d);
  [-1, 1].forEach((side) => {
    const front = mesh(group, new THREE.CylinderGeometry(0.1, 0.16, 0.92, 5), legMaterial, [side * 0.7, 0.3, 0.12], [1, 1, 1], palette, 0.03);
    front.rotation.z = side * 0.78;
    front.rotation.x = 0.12;
    const thigh = mesh(hindLegs, faceted(new THREE.SphereGeometry(0.26, 20, 14)), legMaterial, [side * 0.78, 0.42, 0.4], [1.3, 0.8, 1.25], palette, 0.03);
    thigh.rotation.z = side * 0.3;
    const rear = mesh(hindLegs, new THREE.CylinderGeometry(0.13, 0.2, 1.08, 5), legMaterial, [side * 0.78, 0.22, 0.58], [1, 1, 1], palette, 0.03);
    rear.rotation.z = side * 0.92;
    rear.rotation.x = -0.18;
    [-1, 0, 1].forEach((toe) => {
      const foot = mesh(hindLegs, new THREE.ConeGeometry(0.09, 0.34, 4), toeMaterial, [side * (0.88 + toe * 0.14), 0.08, 0.16 + Math.abs(toe) * 0.1], [1, 0.65, 1], palette, 0.02);
      foot.rotation.x = Math.PI / 2;
      foot.rotation.z = side * (0.22 + toe * 0.18);
    });
  });
  return hindLegs;
}

function addFrogMarkingGroups(
  group: THREE.Group,
  palette: MaterialPalette,
): Record<FrogFeatures["markingPattern"], THREE.Group> {
  const sparse = new THREE.Group();
  const dense = new THREE.Group();
  group.add(sparse, dense);
  const sparseMaterial = palette.toon(0x315f4c);
  const denseMaterial = palette.toon(0xd6d889);
  const sparseSpots: readonly (readonly [number, number, number, number])[] = [
    [-0.55, 0.83, -0.22, 0.11], [0.54, 0.8, -0.1, 0.1], [-0.34, 0.68, 0.38, 0.09],
  ];
  const denseSpots: readonly (readonly [number, number, number, number])[] = [
    [-0.58, 0.88, -0.22, 0.08], [-0.3, 0.96, -0.38, 0.07], [0.08, 0.91, -0.48, 0.08],
    [0.43, 0.88, -0.31, 0.075], [0.57, 0.72, -0.05, 0.08], [-0.46, 0.65, 0.25, 0.075],
    [0.2, 0.66, 0.43, 0.07],
  ];
  sparseSpots.forEach(([x, y, z, radius]) => {
    mesh(sparse, new THREE.CircleGeometry(radius, 6), sparseMaterial, [x, y, z], [1.15, 1, 1]);
  });
  denseSpots.forEach(([x, y, z, radius]) => {
    mesh(dense, new THREE.CircleGeometry(radius, 6), denseMaterial, [x, y, z], [1.1, 1, 1]);
  });
  return { "sparse-dark": sparse, "dense-light": dense };
}

function addLeafHat(group: THREE.Group, palette: MaterialPalette): THREE.Group {
  const featureGroup = new THREE.Group();
  group.add(featureGroup);
  const hat = mesh(featureGroup, faceted(new THREE.ConeGeometry(0.52, 0.18, 7)), palette.toon(0x3d9360), [0.06, 1.3, 0.02], [1, 1, 1], palette, 0.04);
  hat.rotation.z = -0.12;
  const stem = mesh(featureGroup, new THREE.CylinderGeometry(0.025, 0.035, 0.34, 5), palette.toon(0x315f4c), [0.12, 1.49, 0.02]);
  stem.rotation.z = -0.35;
  return featureGroup;
}

function addReedCrown(group: THREE.Group, palette: MaterialPalette): THREE.Group {
  const featureGroup = new THREE.Group();
  group.add(featureGroup);
  const reedMaterial = palette.toon(0xb9a54c);
  [-2, -1, 0, 1, 2].forEach((offset) => {
    const height = 0.34 + (2 - Math.abs(offset)) * 0.055;
    const reed = mesh(featureGroup, new THREE.CylinderGeometry(0.025, 0.04, height, 5), reedMaterial, [offset * 0.14, 1.38 + height / 2, 0.02]);
    reed.rotation.z = offset * -0.1;
    mesh(featureGroup, new THREE.SphereGeometry(0.045, 20, 14), palette.toon(0x7f7040), [offset * 0.14 + offset * 0.015, 1.38 + height, 0.02]);
  });
  return featureGroup;
}

function addScarf(group: THREE.Group, palette: MaterialPalette, material: THREE.Material): THREE.Group {
  const featureGroup = new THREE.Group();
  group.add(featureGroup);
  const scarf = mesh(featureGroup, new THREE.TorusGeometry(0.48, 0.09, 5, 10), material, [0, 0.82, -0.06]);
  scarf.rotation.x = Math.PI / 2;
  const end = mesh(featureGroup, new THREE.BoxGeometry(0.16, 0.48, 0.07), material, [0.35, 0.5, 0.35], [1, 1, 1], palette, 0.025);
  end.rotation.z = -0.18;
  return featureGroup;
}

function addAnkleRibbons(group: THREE.Group, palette: MaterialPalette, material: THREE.Material): THREE.Group {
  const featureGroup = new THREE.Group();
  group.add(featureGroup);
  [-1, 1].forEach((side) => {
    const ribbon = mesh(featureGroup, new THREE.TorusGeometry(0.16, 0.045, 5, 9), material, [side * 0.92, 0.16, 0.5], [1, 0.78, 1], palette, 0.018);
    ribbon.rotation.x = Math.PI / 2;
    const tail = mesh(featureGroup, new THREE.BoxGeometry(0.08, 0.28, 0.045), material, [side * 0.84, 0.04, 0.52], [1, 1, 1], palette, 0.018);
    tail.rotation.z = side * 0.24;
  });
  return featureGroup;
}

function addFlowerPin(group: THREE.Group, palette: MaterialPalette, material: THREE.Material): THREE.Group {
  const featureGroup = new THREE.Group();
  group.add(featureGroup);
  const flower = new THREE.Group();
  flower.position.set(0.52, 1.03, -0.54);
  featureGroup.add(flower);
  for (let index = 0; index < 5; index += 1) {
    const angle = (index / 5) * Math.PI * 2;
    mesh(flower, new THREE.CircleGeometry(0.11, 6), material, [Math.cos(angle) * 0.1, Math.sin(angle) * 0.1, 0], [1, 1, 1], palette, 0.018);
  }
  mesh(flower, new THREE.CircleGeometry(0.07, 7), palette.toon(0xf1c94b), [0, 0, -0.006]);
  return featureGroup;
}

function addFakeShadow(group: THREE.Group, palette: MaterialPalette, radius: number): void {
  const outer = mesh(group, new THREE.CircleGeometry(radius, 20), palette.basic(worldColors.ink, { transparent: true, opacity: 0.1, depthWrite: false }), [0, 0.006, 0], [1, 0.58, 1]);
  outer.rotation.x = -Math.PI / 2;
  outer.renderOrder = -2;
  const inner = mesh(group, new THREE.CircleGeometry(radius * 0.68, 18), palette.basic(worldColors.ink, { transparent: true, opacity: 0.07, depthWrite: false }), [0, 0.009, 0], [1, 0.56, 1]);
  inner.rotation.x = -Math.PI / 2;
  inner.renderOrder = -1;
}
