import * as THREE from "three";
import { createCameraRig, type CameraRig } from "./cameraRig";
import { buildEnvironment, type EnvironmentView } from "./environmentBuilder";
import { createLightingRig } from "./lightingRig";
import { createMaterialPalette, type MaterialPalette, worldColors } from "./materialPalette";

export interface RenderHost {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  cameraRig: CameraRig;
  palette: MaterialPalette;
  worldRoot: THREE.Group;
  environment: EnvironmentView;
  resize(): void;
  render(elapsed: number): void;
  getPixelDiagnostics(): Readonly<PixelDiagnostics>;
  dispose(): void;
}

export type PixelDiagnostics = {
  width: number;
  height: number;
  uniqueSampleColors: number;
  lumaRange: [number, number];
  frame: number;
};

export function createRenderHost(canvas: HTMLCanvasElement): RenderHost {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(worldColors.sky);
  scene.fog = new THREE.Fog(worldColors.sky, 23, 54);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = false;

  const cameraRig = createCameraRig();
  const palette = createMaterialPalette();
  const worldRoot = new THREE.Group();
  worldRoot.name = "world-root";
  const environment = buildEnvironment(palette);
  worldRoot.add(environment.group);
  scene.add(worldRoot);
  createLightingRig(scene);
  const pixelDiagnostics: PixelDiagnostics = {
    width: 0,
    height: 0,
    uniqueSampleColors: 0,
    lumaRange: [0, 0],
    frame: 0,
  };
  let frame = 0;
  const onContextLost = (event: Event): void => {
    event.preventDefault();
    canvas.dataset.webglContext = "lost";
  };
  const onContextRestored = (): void => {
    canvas.dataset.webglContext = "ready";
    renderer.resetState();
  };
  canvas.dataset.webglContext = "ready";
  canvas.addEventListener("webglcontextlost", onContextLost);
  canvas.addEventListener("webglcontextrestored", onContextRestored);

  function resize(): void {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    cameraRig.resize(width, height);
    const cameraScale = cameraRig.getDistanceScale();
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.near = 23 * cameraScale;
      scene.fog.far = Math.min(cameraRig.camera.far - 5, 54 * cameraScale);
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(width, height, false);
  }

  return {
    scene,
    renderer,
    cameraRig,
    palette,
    worldRoot,
    environment,
    resize,
    render(elapsed) {
      environment.update(elapsed);
      renderer.render(scene, cameraRig.camera);
      frame += 1;
      canvas.dataset.renderCalls = String(renderer.info.render.calls);
      canvas.dataset.renderTriangles = String(renderer.info.render.triangles);
      if (frame % 30 === 0) samplePixels(renderer, canvas, pixelDiagnostics, frame);
    },
    getPixelDiagnostics() {
      return pixelDiagnostics;
    },
    dispose() {
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      palette.dispose();
      renderer.dispose();
    },
  };
}

function samplePixels(
  renderer: THREE.WebGLRenderer,
  canvas: HTMLCanvasElement,
  diagnostics: PixelDiagnostics,
  frame: number,
): void {
  const gl = renderer.getContext();
  const width = gl.drawingBufferWidth;
  const height = gl.drawingBufferHeight;
  const pixel = new Uint8Array(4);
  const colors = new Set<string>();
  let minLuma = 255;
  let maxLuma = 0;

  for (let row = 1; row <= 6; row += 1) {
    for (let column = 1; column <= 9; column += 1) {
      gl.readPixels(
        Math.floor((width * column) / 10),
        Math.floor((height * row) / 7),
        1,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        pixel,
      );
      colors.add(`${pixel[0]},${pixel[1]},${pixel[2]},${pixel[3]}`);
      const luma = Math.round(pixel[0]! * 0.2126 + pixel[1]! * 0.7152 + pixel[2]! * 0.0722);
      minLuma = Math.min(minLuma, luma);
      maxLuma = Math.max(maxLuma, luma);
    }
  }

  diagnostics.width = width;
  diagnostics.height = height;
  diagnostics.uniqueSampleColors = colors.size;
  diagnostics.lumaRange = [minLuma, maxLuma];
  diagnostics.frame = frame;

  canvas.dataset.renderFrame = String(frame);
  canvas.dataset.renderWidth = String(width);
  canvas.dataset.renderHeight = String(height);
  canvas.dataset.renderUniqueColors = String(colors.size);
  canvas.dataset.renderLumaRange = `${minLuma},${maxLuma}`;
}
