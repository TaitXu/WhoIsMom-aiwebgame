import * as THREE from "three";
import type { AgentId, FrogId, NpcId, Personality } from "../core/types";
import { agentMarkerColors, getPersonalityMotion } from "../game/agents/personality";
import type { CandidateFrog } from "../game/case/caseTypes";
import type { MaterialPalette } from "./materialPalette";
import { worldColors } from "./materialPalette";
import type { CharacterView } from "./characterView";
import { createCharacterView } from "./characterView";
import { faceted } from "./geometry";

export function createPlayerFish(palette: MaterialPalette): CharacterView {
  const group = new THREE.Group();
  group.name = "player-fish";
  group.userData.entityType = "player";

  const body = new THREE.Mesh(
    faceted(new THREE.SphereGeometry(0.62, 9, 6)),
    palette.toon(worldColors.player),
  );
  body.scale.set(0.9, 0.48, 1.25);
  body.position.y = 0.38;
  group.add(body);

  const belly = new THREE.Mesh(
    faceted(new THREE.SphereGeometry(0.42, 8, 5)),
    palette.toon(0xa8db77),
  );
  belly.scale.set(0.75, 0.28, 1);
  belly.position.set(0, 0.17, -0.12);
  group.add(belly);

  const tail = new THREE.Group();
  tail.position.set(0, 0.34, 0.72);
  const tailMesh = new THREE.Mesh(
    new THREE.ConeGeometry(0.43, 0.9, 4),
    palette.toon(0x2e9f6c),
  );
  tailMesh.rotation.x = Math.PI / 2;
  tailMesh.position.z = 0.38;
  tail.add(tailMesh);
  group.add(tail);

  addEyes(group, palette, 0.35, 0.48, -0.52, 0.15);
  addFakeShadow(group, palette, 0.6, -0.01);

  return createCharacterView({
    group,
    tail,
    body,
    tailAmplitude: 0.28,
    tailFrequency: 5.8,
    bobAmplitude: 0.045,
  });
}

export function createTadpole(
  id: AgentId,
  personality: Personality,
  palette: MaterialPalette,
  phase: number,
): CharacterView {
  const motion = getPersonalityMotion(personality);
  const group = new THREE.Group();
  group.name = `agent-${id}`;
  group.userData.entityType = "agent";
  group.userData.entityId = id;

  const body = new THREE.Mesh(
    faceted(new THREE.SphereGeometry(0.34, 8, 5)),
    palette.toon(worldColors.tadpole),
  );
  body.scale.set(0.86, 0.62, 1.05);
  body.position.y = 0.25;
  group.add(body);

  const tail = new THREE.Group();
  tail.position.set(0, 0.24, 0.34);
  const tailMesh = new THREE.Mesh(
    new THREE.ConeGeometry(0.19, 0.78, 4),
    palette.toon(worldColors.tadpole),
  );
  tailMesh.rotation.x = Math.PI / 2;
  tailMesh.position.z = 0.33;
  tail.add(tailMesh);
  group.add(tail);

  addEyes(group, palette, 0.19, 0.31, -0.28, 0.09);
  addLeafMarker(group, palette, agentMarkerColors[id]);
  addFakeShadow(group, palette, 0.34, -0.005);

  const selectionRing = new THREE.Mesh(
    new THREE.RingGeometry(0.43, 0.5, 18),
    palette.basic(agentMarkerColors[id]),
  );
  selectionRing.rotation.x = -Math.PI / 2;
  selectionRing.position.y = 0.018;
  selectionRing.visible = false;
  group.add(selectionRing);

  const statusMarker = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.12, 0),
    palette.basic(worldColors.accent),
  );
  statusMarker.position.set(0, 0.92, 0);
  statusMarker.visible = false;
  group.add(statusMarker);

  return createCharacterView({
    group,
    tail,
    body,
    selectionRing,
    statusMarker,
    statusMaterials: {
      approaching: palette.basic(0xef9368),
      interacting: palette.basic(0x62c6d3),
      returning: palette.basic(0x8fc7de),
      discussing: palette.basic(0xf1c94b),
      considering: palette.basic(0xe98b91),
    },
    tailAmplitude: motion.tailAmplitude,
    tailFrequency: motion.tailFrequency,
    bobAmplitude: motion.bobAmplitude,
    phase,
  });
}

export function createNpc(
  id: NpcId,
  palette: MaterialPalette,
): CharacterView {
  if (id === "dragonfly") return createDragonfly(palette);
  if (id === "turtle") return createTurtle(palette);
  return createCrab(palette);
}

export function createFrog(
  definition: CandidateFrog,
  palette: MaterialPalette,
): CharacterView {
  const group = new THREE.Group();
  group.name = `frog-${definition.id}`;
  group.userData.entityType = "frog";
  group.userData.entityId = definition.id satisfies FrogId;

  const bodyScale = definition.id === "bullfrog" ? 1.22 : definition.id === "tree-frog" ? 0.9 : 1;
  const body = new THREE.Mesh(
    faceted(new THREE.SphereGeometry(0.7, 9, 6)),
    palette.toon(definition.bodyColor),
  );
  body.scale.set(1.05 * bodyScale, 0.72 * bodyScale, 1.02 * bodyScale);
  body.position.y = 0.63 * bodyScale;
  group.add(body);

  const belly = new THREE.Mesh(
    faceted(new THREE.SphereGeometry(0.48, 8, 5)),
    palette.toon(definition.bellyColor),
  );
  belly.scale.set(0.78 * bodyScale, 0.46 * bodyScale, 0.3 * bodyScale);
  belly.position.set(0, 0.55 * bodyScale, -0.56 * bodyScale);
  group.add(belly);

  const legGeometry = new THREE.CylinderGeometry(0.1, 0.15, 0.9, 5);
  const legMaterial = palette.toon(definition.accentColor);
  [-1, 1].forEach((side) => {
    const rearLeg = new THREE.Mesh(legGeometry, legMaterial);
    rearLeg.rotation.z = side * 1.08;
    rearLeg.rotation.x = 0.12;
    rearLeg.position.set(side * 0.7 * bodyScale, 0.28, 0.2);
    rearLeg.scale.y = definition.id === "marsh-frog" ? 1.2 : 0.95;
    group.add(rearLeg);

    const foot = new THREE.Mesh(
      faceted(new THREE.SphereGeometry(0.18, 7, 4)),
      legMaterial,
    );
    foot.scale.set(1.35, 0.45, 0.7);
    foot.position.set(side * 1.02 * bodyScale, 0.09, 0.14);
    group.add(foot);
  });

  addEyes(group, palette, 0.34 * bodyScale, 1.03 * bodyScale, -0.42 * bodyScale, 0.16 * bodyScale);
  if (definition.accessory === "leaf-hat") addLeafHat(group, palette, bodyScale);
  else addScarf(group, palette, definition.accentColor, bodyScale);
  addFakeShadow(group, palette, 0.82 * bodyScale, -0.01);

  const interactionRing = createInteractionRing(palette, definition.accentColor, 0.92 * bodyScale);
  group.add(interactionRing);
  const tail = new THREE.Group();
  tail.position.set(0, 0.6, 0);
  group.add(tail);

  return createCharacterView({
    group,
    tail,
    body,
    interactionRing,
    tailAmplitude: 0.04,
    tailFrequency: 2,
    bobAmplitude: 0.025,
    phase: definition.id === "tree-frog" ? 0 : definition.id === "bullfrog" ? 1.4 : 2.8,
  });
}

function createDragonfly(palette: MaterialPalette): CharacterView {
  const group = createInteractiveGroup("dragonfly");
  const body = new THREE.Mesh(
    faceted(new THREE.CapsuleGeometry(0.13, 0.7, 3, 6)),
    palette.toon(0x476cba),
  );
  body.rotation.x = Math.PI / 2;
  body.position.y = 0.75;
  group.add(body);
  const tail = new THREE.Group();
  tail.position.copy(body.position);
  const wingMaterial = palette.basic(0xd8f4ee, { transparent: true, opacity: 0.8, depthWrite: false });
  [-1, 1].forEach((side) => {
    const wing = new THREE.Mesh(new THREE.CircleGeometry(0.36, 6), wingMaterial);
    wing.scale.set(1.7, 0.5, 1);
    wing.rotation.x = -Math.PI / 2;
    wing.position.set(side * 0.4, 0, 0);
    tail.add(wing);
  });
  group.add(tail);
  addEyes(group, palette, 0.12, 0.84, -0.38, 0.07);
  addFakeShadow(group, palette, 0.38, 0.01);
  const interactionRing = createInteractionRing(palette, 0x8fc7de, 0.52);
  group.add(interactionRing);
  return createCharacterView({ group, tail, body, interactionRing, tailAmplitude: 0.4, tailFrequency: 15, bobAmplitude: 0.12 });
}

function createTurtle(palette: MaterialPalette): CharacterView {
  const group = createInteractiveGroup("turtle");
  const body = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.58, 1),
    palette.toon(0x5d8e54),
  );
  body.scale.set(1, 0.45, 1.25);
  body.position.y = 0.34;
  group.add(body);
  const shell = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.55, 1),
    palette.toon(0x8a6c45),
  );
  shell.scale.set(1, 0.45, 1.05);
  shell.position.set(0, 0.53, 0.08);
  group.add(shell);
  const head = new THREE.Mesh(faceted(new THREE.SphereGeometry(0.27, 7, 5)), palette.toon(0x83ad65));
  head.position.set(0, 0.35, -0.72);
  group.add(head);
  const tail = head;
  addEyes(group, palette, 0.13, 0.42, -0.92, 0.06);
  addFakeShadow(group, palette, 0.65, 0.01);
  const interactionRing = createInteractionRing(palette, 0xe8c85f, 0.78);
  group.add(interactionRing);
  return createCharacterView({ group, tail, body, interactionRing, tailAmplitude: 0.05, tailFrequency: 2.2, bobAmplitude: 0.025, phase: 1 });
}

function createCrab(palette: MaterialPalette): CharacterView {
  const group = createInteractiveGroup("crab");
  const body = new THREE.Mesh(
    faceted(new THREE.SphereGeometry(0.48, 8, 5)),
    palette.toon(0xe56f59),
  );
  body.scale.set(1.2, 0.5, 0.8);
  body.position.y = 0.3;
  group.add(body);
  const tail = new THREE.Group();
  const clawGeometry = new THREE.ConeGeometry(0.24, 0.48, 5);
  [-1, 1].forEach((side) => {
    const arm = new THREE.Mesh(clawGeometry, palette.toon(0xc94e48));
    arm.rotation.z = side * Math.PI / 2;
    arm.position.set(side * 0.72, 0.38, -0.1);
    tail.add(arm);
  });
  group.add(tail);
  addEyes(group, palette, 0.2, 0.52, -0.32, 0.08);
  addFakeShadow(group, palette, 0.55, 0.01);
  const interactionRing = createInteractionRing(palette, 0xe98b91, 0.68);
  group.add(interactionRing);
  return createCharacterView({ group, tail, body, interactionRing, tailAmplitude: 0.28, tailFrequency: 4.4, bobAmplitude: 0.035, phase: 2 });
}

function createInteractionRing(
  palette: MaterialPalette,
  color: number,
  radius: number,
): THREE.Mesh {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(radius, radius + 0.09, 24),
    palette.basic(color, { transparent: true, opacity: 0.72, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.025;
  ring.visible = false;
  ring.renderOrder = 2;
  return ring;
}

function addLeafHat(group: THREE.Group, palette: MaterialPalette, scale: number): void {
  const hat = new THREE.Mesh(
    faceted(new THREE.ConeGeometry(0.52 * scale, 0.18 * scale, 7)),
    palette.toon(0x3d9360),
  );
  hat.rotation.z = -0.12;
  hat.position.set(0.06 * scale, 1.25 * scale, 0.02);
  group.add(hat);
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.035, 0.34 * scale, 5),
    palette.toon(0x315f4c),
  );
  stem.rotation.z = -0.35;
  stem.position.set(0.12 * scale, 1.44 * scale, 0.02);
  group.add(stem);
}

function addScarf(
  group: THREE.Group,
  palette: MaterialPalette,
  color: number,
  scale: number,
): void {
  const scarf = new THREE.Mesh(
    new THREE.TorusGeometry(0.48 * scale, 0.09 * scale, 5, 10),
    palette.toon(color),
  );
  scarf.rotation.x = Math.PI / 2;
  scarf.position.set(0, 0.78 * scale, -0.06);
  group.add(scarf);
  const end = new THREE.Mesh(
    new THREE.BoxGeometry(0.16 * scale, 0.48 * scale, 0.07),
    palette.toon(color),
  );
  end.rotation.z = -0.18;
  end.position.set(0.35 * scale, 0.48 * scale, 0.35);
  group.add(end);
}

function createInteractiveGroup(id: NpcId): THREE.Group {
  const group = new THREE.Group();
  group.name = `npc-${id}`;
  group.userData.entityType = "npc";
  group.userData.entityId = id;
  return group;
}

function addEyes(
  group: THREE.Group,
  palette: MaterialPalette,
  x: number,
  y: number,
  z: number,
  radius: number,
): void {
  const white = palette.basic(worldColors.cream);
  const pupil = palette.basic(worldColors.ink);
  [-1, 1].forEach((side) => {
    const eye = new THREE.Mesh(faceted(new THREE.SphereGeometry(radius, 8, 5)), white);
    eye.position.set(side * x, y, z);
    const dot = new THREE.Mesh(faceted(new THREE.SphereGeometry(radius * 0.48, 7, 4)), pupil);
    dot.position.set(0, 0, -radius * 0.78);
    eye.add(dot);
    group.add(eye);
  });
}

function addLeafMarker(
  group: THREE.Group,
  palette: MaterialPalette,
  color: number,
): void {
  const leaf = new THREE.Mesh(
    new THREE.CircleGeometry(0.13, 5),
    palette.toon(color),
  );
  leaf.rotation.set(-Math.PI / 2, 0.45, 0.2);
  leaf.position.set(0.09, 0.56, -0.02);
  group.add(leaf);
}

function addFakeShadow(
  group: THREE.Group,
  palette: MaterialPalette,
  radius: number,
  y: number,
): void {
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 16),
    palette.basic(0x173b45, { transparent: true, opacity: 0.16, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(1, 0.55, 1);
  shadow.position.y = y;
  shadow.renderOrder = -1;
  group.add(shadow);
}
