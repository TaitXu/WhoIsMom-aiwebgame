import * as THREE from "three";
import type { AgentId, FrogId, NpcId, Personality } from "../core/types";
import type { CandidateFrog } from "../game/case/caseTypes";
import { agentMarkerColors, getPersonalityMotion } from "../game/agents/personality";
import { createCharacterView, type CharacterView } from "./characterView";
import type { MaterialPalette } from "./materialPalette";
import { worldColors } from "./materialPalette";

export function createPlayerFish(palette: MaterialPalette): CharacterView {
  const group = createRoot("player-fish", "player");
  const model = new THREE.Group();
  group.add(model);
  const body = mesh(model, faceted(new THREE.SphereGeometry(0.62, 9, 6)), palette.toon(worldColors.player), [0, 0.42, 0], [0.9, 0.5, 1.25], palette, 0.045);
  mesh(model, faceted(new THREE.SphereGeometry(0.42, 8, 5)), palette.toon(0xb5df7a), [0, 0.21, -0.18], [0.74, 0.28, 0.95]);
  const tail = new THREE.Group();
  tail.position.set(0, 0.38, 0.68);
  mesh(tail, new THREE.ConeGeometry(0.44, 0.9, 4), palette.toon(0x329e69), [0, 0, 0.38], [1, 1, 1], palette, 0.035).rotation.x = Math.PI / 2;
  model.add(tail);
  addEyes(model, palette, 0.35, 0.52, -0.52, 0.15);
  addFakeShadow(group, palette, 0.64);
  return createCharacterView({ group, motionRoot: model, tail, body, tailAmplitude: 0.28, tailFrequency: 5.8, bobAmplitude: 0.05 });
}

export function createTadpole(id: AgentId, personality: Personality, palette: MaterialPalette, phase: number): CharacterView {
  const motion = getPersonalityMotion(personality);
  const group = createRoot(`agent-${id}`, "agent", id);
  const model = new THREE.Group();
  group.add(model);
  const body = mesh(model, faceted(new THREE.SphereGeometry(0.34, 8, 5)), palette.toon(worldColors.tadpole), [0, 0.28, 0], [0.88, 0.64, 1.05], palette, 0.045);
  const tail = new THREE.Group();
  tail.position.set(0, 0.27, 0.32);
  mesh(tail, new THREE.ConeGeometry(0.19, 0.78, 4), palette.toon(worldColors.tadpole), [0, 0, 0.33], [1, 1, 1], palette, 0.035).rotation.x = Math.PI / 2;
  model.add(tail);
  addEyes(model, palette, 0.19, 0.35, -0.28, 0.09);
  addLeafMarker(model, palette, agentMarkerColors[id]);
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

export function createFrog(definition: CandidateFrog, palette: MaterialPalette): CharacterView {
  const group = createRoot(`frog-${definition.id}`, "frog", definition.id satisfies FrogId);
  const model = new THREE.Group();
  group.add(model);
  const bodyScale = definition.id === "bullfrog" ? 1.22 : definition.id === "tree-frog" ? 0.9 : 1;
  const body = mesh(model, faceted(new THREE.SphereGeometry(0.7, 9, 6)), palette.toon(definition.bodyColor), [0, 0.68 * bodyScale, 0], [1.05 * bodyScale, 0.72 * bodyScale, 1.02 * bodyScale], palette, 0.055);
  mesh(model, faceted(new THREE.SphereGeometry(0.48, 8, 5)), palette.toon(definition.bellyColor), [0, 0.58 * bodyScale, -0.56 * bodyScale], [0.78 * bodyScale, 0.46 * bodyScale, 0.3 * bodyScale]);
  const legGeometry = new THREE.CylinderGeometry(0.1, 0.15, 0.9, 5);
  [-1, 1].forEach((side) => {
    const leg = mesh(model, legGeometry, palette.toon(definition.accentColor), [side * 0.7 * bodyScale, 0.28, 0.2], [1, definition.id === "marsh-frog" ? 1.2 : 0.95, 1], palette, 0.035);
    leg.rotation.z = side * 1.08;
    leg.rotation.x = 0.12;
    mesh(model, faceted(new THREE.SphereGeometry(0.18, 7, 4)), palette.toon(definition.accentColor), [side * 1.02 * bodyScale, 0.09, 0.14], [1.35, 0.45, 0.7]);
  });
  addEyes(model, palette, 0.34 * bodyScale, 1.08 * bodyScale, -0.42 * bodyScale, 0.16 * bodyScale);
  if (definition.accessory === "leaf-hat") addLeafHat(model, palette, bodyScale);
  else addScarf(model, palette, definition.accentColor, bodyScale);
  addFakeShadow(group, palette, 0.84 * bodyScale);
  const interactionRing = createInteractionRing(palette, definition.accentColor, 0.94 * bodyScale);
  group.add(interactionRing);
  const tail = new THREE.Group();
  model.add(tail);
  return createCharacterView({ group, motionRoot: model, tail, body, interactionRing, tailAmplitude: 0.04, tailFrequency: 2, bobAmplitude: 0.03, phase: definition.id === "tree-frog" ? 0 : definition.id === "bullfrog" ? 1.4 : 2.8 });
}

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
  const body = mesh(model, faceted(new THREE.SphereGeometry(0.42, 7, 5)), palette.toon(0x75b84d), [0, 0.48, 0], [0.72, 0.62, 1.2], palette, 0.045);
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
  const head = mesh(model, faceted(new THREE.SphereGeometry(0.27, 7, 5)), palette.toon(0x83ad65), [0, 0.38, -0.72], [1, 1, 1], palette, 0.035);
  addEyes(model, palette, 0.13, 0.45, -0.92, 0.06);
  addFakeShadow(group, palette, 0.67);
  const interactionRing = createInteractionRing(palette, 0xe8c85f, 0.8);
  group.add(interactionRing);
  return createCharacterView({ group, motionRoot: model, tail: head, body, interactionRing, tailAmplitude: 0.05, tailFrequency: 2.2, bobAmplitude: 0.025, phase: 1 });
}

function createCrab(palette: MaterialPalette): CharacterView {
  const group = createRoot("npc-crab", "npc", "crab");
  const model = new THREE.Group();
  group.add(model);
  const body = mesh(model, faceted(new THREE.SphereGeometry(0.48, 8, 5)), palette.toon(0xe56f59), [0, 0.32, 0], [1.2, 0.5, 0.8], palette, 0.045);
  const tail = new THREE.Group();
  [-1, 1].forEach((side) => {
    const claw = mesh(tail, new THREE.ConeGeometry(0.24, 0.48, 5), palette.toon(0xc94e48), [side * 0.72, 0.4, -0.1], [1, 1, 1], palette, 0.03);
    claw.rotation.z = side * Math.PI / 2;
  });
  model.add(tail);
  addEyes(model, palette, 0.2, 0.55, -0.32, 0.08);
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
  palette?: MaterialPalette,
  outlineWidth?: number,
): THREE.Mesh {
  const result = new THREE.Mesh(geometry, material);
  result.position.set(...position);
  result.scale.set(...scale);
  parent.add(result);
  if (palette && outlineWidth) {
    const outline = new THREE.Mesh(geometry, palette.outline(outlineWidth));
    outline.raycast = () => undefined;
    result.add(outline);
  }
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
    const eye = mesh(group, faceted(new THREE.SphereGeometry(radius, 8, 5)), white, [side * x, y, z], [1, 1, 1], palette, radius * 0.22);
    mesh(eye, faceted(new THREE.SphereGeometry(radius * 0.48, 7, 4)), pupil, [0, 0, -radius * 0.78]);
  });
}

function addLeafMarker(group: THREE.Group, palette: MaterialPalette, color: number): void {
  const leaf = mesh(group, new THREE.CircleGeometry(0.13, 5), palette.toon(color), [0.09, 0.6, -0.02]);
  leaf.rotation.set(-Math.PI / 2, 0.45, 0.2);
}

function addLeafHat(group: THREE.Group, palette: MaterialPalette, scale: number): void {
  const hat = mesh(group, faceted(new THREE.ConeGeometry(0.52 * scale, 0.18 * scale, 7)), palette.toon(0x3d9360), [0.06 * scale, 1.3 * scale, 0.02], [1, 1, 1], palette, 0.04);
  hat.rotation.z = -0.12;
  const stem = mesh(group, new THREE.CylinderGeometry(0.025, 0.035, 0.34 * scale, 5), palette.toon(0x315f4c), [0.12 * scale, 1.49 * scale, 0.02]);
  stem.rotation.z = -0.35;
}

function addScarf(group: THREE.Group, palette: MaterialPalette, color: number, scale: number): void {
  const scarf = mesh(group, new THREE.TorusGeometry(0.48 * scale, 0.09 * scale, 5, 10), palette.toon(color), [0, 0.82 * scale, -0.06]);
  scarf.rotation.x = Math.PI / 2;
  const end = mesh(group, new THREE.BoxGeometry(0.16 * scale, 0.48 * scale, 0.07), palette.toon(color), [0.35 * scale, 0.5 * scale, 0.35]);
  end.rotation.z = -0.18;
}

function addFakeShadow(group: THREE.Group, palette: MaterialPalette, radius: number): void {
  const outer = mesh(group, new THREE.CircleGeometry(radius, 20), palette.basic(worldColors.ink, { transparent: true, opacity: 0.1, depthWrite: false }), [0, 0.006, 0], [1, 0.58, 1]);
  outer.rotation.x = -Math.PI / 2;
  outer.renderOrder = -2;
  const inner = mesh(group, new THREE.CircleGeometry(radius * 0.68, 18), palette.basic(worldColors.ink, { transparent: true, opacity: 0.07, depthWrite: false }), [0, 0.009, 0], [1, 0.56, 1]);
  inner.rotation.x = -Math.PI / 2;
  inner.renderOrder = -1;
}
