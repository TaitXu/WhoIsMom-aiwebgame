import * as THREE from 'three';
import { stylizedSurface, meadowGLSL } from './stylizedSurface';
import { createGroundDetails } from './groundDetails';
import type { TerrainCollider } from './environmentBuilder';
import { createTerrainField, TERRAIN_SIZE, TERRAIN_RESOLUTION, WATER_LEVEL } from './terrainField';

export function createContinuousWetland(banks: readonly TerrainCollider[]) {
  const sampleHeight = createTerrainField(banks);
  const geometry = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_RESOLUTION, TERRAIN_RESOLUTION);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position!;
  const heights = new Float32Array((TERRAIN_RESOLUTION + 1) ** 2);
  for (let i = 0; i < positions.count; i++) {
    const h=sampleHeight(positions.getX(i), positions.getZ(i));
    positions.setY(i,h);heights[i]=h;
  }
  geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  const heightMap = new THREE.DataTexture(heights, TERRAIN_RESOLUTION + 1, TERRAIN_RESOLUTION + 1, THREE.RedFormat, THREE.FloatType);
  heightMap.minFilter = heightMap.magFilter = THREE.LinearFilter;
  heightMap.needsUpdate = true;
  const time = { value: 0 };
  const details = createGroundDetails(banks, sampleHeight, time);
  const material = stylizedSurface(0xffffff);
  material.onBeforeCompile = shader => {
    shader.uniforms.terrainTime = time;
    shader.vertexShader = 'varying vec3 terrainWorld;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n terrainWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
    shader.fragmentShader = meadowGLSL + `varying vec3 terrainWorld; uniform float terrainTime;
      float thash(vec2 p) {return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float tnoise(vec2 p) {
        vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
        return mix(mix(thash(i),thash(i+vec2(1,0)),f.x),mix(thash(i+vec2(0,1)),thash(i+vec2(1)),f.x),f.y);
      }
      ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec2 p=terrainWorld.xz;
      float h=terrainWorld.y;
      float n=tnoise(p*3.0)*0.45+tnoise(p*12.0)*0.2+tnoise(p*.6)*0.35;
      vec3 sand=vec3(0.86,0.65,0.32)*(0.88+n*0.22);
      vec3 wetSand=vec3(0.41,0.36,0.20)*(0.9+n*0.17);
      float wet=1.0-smoothstep(-0.12,0.16,h);
      vec3 ground=mix(sand,wetSand,wet*0.6);
      float grass=smoothstep(0.32,0.55,h+(tnoise(p*2.1)-0.5)*0.13);
      vec3 turf=meadowColor(p);
      ground=mix(ground,turf,grass);
      float grain=thash(floor(p*105.0));
      ground*=0.93+grain*0.13;
      // Small grains with a screen-space cutoff avoid distant shimmering.
      float grainFade=1.0-smoothstep(0.015,0.05,length(fwidth(p)));
      ground*=1.0-step(0.991,grain)*0.4*grainFade;
      float submerged=1.0-smoothstep(-0.14,-0.025,h);
      vec2 flow=p*3.0+vec2(terrainTime*0.12,-terrainTime*0.09);
      float c=pow(1.0-abs(sin(flow.x+sin(flow.y))*sin(flow.y+sin(flow.x*0.83))),20.0);
      ground+=vec3(0.055,0.09,0.045)*c*submerged;
      diffuseColor.rgb*=ground;
    `);
  };
  const originalCompile=material.onBeforeCompile;
  material.onBeforeCompile=(shader,renderer)=>{
    originalCompile(shader,renderer);
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
      float sandMask=1.0-smoothstep(.32,.50,terrainWorld.y);
      float microHeight=tnoise(terrainWorld.xz*24.0)*.010 + sin(terrainWorld.x*10.0+terrainWorld.z*2.2+tnoise(terrainWorld.xz*2.0)*4.0)*.004;
      vec3 dp1=dFdx(-vViewPosition),dp2=dFdy(-vViewPosition);
      vec3 r1=cross(dp2,normal),r2=cross(normal,dp1);
      float determinant=dot(dp1,r1);
      vec3 gradient=sign(determinant)*(dFdx(microHeight)*r1+dFdy(microHeight)*r2);
      normal=normalize(abs(determinant)*normal-gradient*sandMask);
    `);
  };
  material.customProgramCacheKey = () => 'continuous-terrain-v1';
  const terrain = new THREE.Mesh(geometry, material);
  terrain.name = 'continuous-wetland-heightfield';terrain.receiveShadow = true;terrain.castShadow = true;

  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  target.depthTexture = new THREE.DepthTexture(1, 1);
  const waterMaterial = new THREE.ShaderMaterial({
    toneMapped: false,
    uniforms: {
      time, heightMap: { value: heightMap }, terrainSize: { value: TERRAIN_SIZE },
      sceneColor: { value: target.texture }, sceneDepth: { value: target.depthTexture },
      resolution: { value: new THREE.Vector2(1, 1) }, cameraNear: { value: 0.1 }, cameraFar: { value: 150 },
      sunDirection: { value: new THREE.Vector3(-18, 28, 14).normalize() },
    },
    vertexShader: `
      uniform float time,terrainSize;uniform sampler2D heightMap;
      varying vec3 vWorld;varying vec3 vWaveNormal;varying float vBed;
      vec3 wave(vec2 dir,float amplitude,float length,float speed,vec2 p,inout vec3 tangent,inout vec3 binormal) {
        float k=6.283185/length;
        float phase=k*dot(dir,p)-speed*time;
        tangent+=vec3(-dir.x*dir.x*amplitude*k*sin(phase),dir.x*amplitude*k*cos(phase),-dir.x*dir.y*amplitude*k*sin(phase));
        binormal+=vec3(-dir.x*dir.y*amplitude*k*sin(phase),dir.y*amplitude*k*cos(phase),-dir.y*dir.y*amplitude*k*sin(phase));
        return vec3(dir.x*amplitude*cos(phase),amplitude*sin(phase),dir.y*amplitude*cos(phase));
      }
      void main() {
        vec3 p=position;
        float bed=texture2D(heightMap,p.xz/terrainSize+0.5).r;
        float fade=smoothstep(0.0,0.5,${WATER_LEVEL.toFixed(2)}-bed);
        vec3 tangent=vec3(1,0,0),binormal=vec3(0,0,1);
        vec3 displacement=wave(normalize(vec2(0.6,1)),0.045*fade,4.8,1.25,p.xz,tangent,binormal);
        displacement+=wave(normalize(vec2(-0.8,0.4)),0.027*fade,2.7,1.7,p.xz,tangent,binormal);
        displacement+=wave(normalize(vec2(0.2,1)),0.012*fade,1.8,2.1,p.xz,tangent,binormal);
        p+=displacement;p.y+=${WATER_LEVEL.toFixed(2)};
        vWaveNormal=normalize(cross(binormal,tangent));
        vWorld=p;vBed=bed;
        gl_Position=projectionMatrix*viewMatrix*vec4(p,1.0);
      }`,
    fragmentShader: `
      #include <packing>
      uniform sampler2D sceneColor,sceneDepth,heightMap;
      uniform vec2 resolution;uniform float cameraNear,cameraFar,time,terrainSize;uniform vec3 sunDirection;
      varying vec3 vWorld,vWaveNormal;varying float vBed;
      float flowNoise(vec2 p) {
        return sin(p.x+sin(p.y*1.17))*sin(p.y+sin(p.x*.83));
      }
      void main() {
        float bed=texture2D(heightMap,vWorld.xz/terrainSize+0.5).r;
        float depth=vWorld.y-bed;
        if(depth<0.0) discard;
        vec2 uv=gl_FragCoord.xy/resolution;
        float sceneZ=perspectiveDepthToViewZ(texture2D(sceneDepth,uv).r,cameraNear,cameraFar);
        float waterZ=perspectiveDepthToViewZ(gl_FragCoord.z,cameraNear,cameraFar);
        float thickness=max(0.0,waterZ-sceneZ);
        vec3 normal=normalize(vWaveNormal+vec3(sin(vWorld.z*13.0+time)*0.018,0.0,sin(vWorld.x*11.0-time*1.1)*0.018));
        vec2 offset=normal.xz*0.018*min(thickness,1.0);
        vec2 refractedUv=clamp(uv+offset,vec2(0.001),vec2(0.999));
        float refractedZ=perspectiveDepthToViewZ(texture2D(sceneDepth,refractedUv).r,cameraNear,cameraFar);
        if(refractedZ>waterZ) refractedUv=uv;
        vec3 bottom=texture2D(sceneColor,refractedUv).rgb;
        // Beer-Lambert absorption: red light attenuates fastest, exposing the actual bed in the shallows.
        vec3 transmittance=exp(-vec3(2.4,0.75,0.38)*min(thickness,8.0));
        vec3 scattering=vec3(0.001,0.22,0.36);
        vec3 color=bottom*transmittance+scattering*(1.0-transmittance);
        vec3 viewDir=normalize(cameraPosition-vWorld);
        float fresnel=0.02+0.98*pow(1.0-max(dot(viewDir,normal),0.0),5.0);
        vec3 skyReflection=mix(vec3(0.12,0.36,0.39),vec3(0.58,0.77,0.78),max(normal.y,0.0));
        color=mix(color,skyReflection,fresnel*.65);
        vec3 halfVector=normalize(sunDirection+viewDir);
        float specular=pow(max(dot(normal,halfVector),0.0),220.0);
        color+=vec3(1.0,0.89,0.66)*smoothstep(.3,.7,specular)*0.35;
        float foam=(1.0-smoothstep(0.015,0.09,depth))*(0.45+0.55*sin(vWorld.x*8.7+sin(vWorld.z*11.3)+time*1.2)*sin(vWorld.z*7.6+time*0.7));
        color=mix(color,vec3(0.72,0.84,0.66),foam*0.55);
        // Advected surface features make direction and speed legible from the gameplay camera.
        vec2 current=vec2(.22,.85);
        vec2 moving=vWorld.xz-current*time*.72;
        float distortion=flowNoise(moving*.75);
        float crests=pow(max(0.0,sin(moving.x*5.5+moving.y*2.0+distortion*2.1)),18.0);
        float breakup=smoothstep(.2,.8,sin(moving.y*3.7+sin(moving.x*2.3))*.5+.5);
        float surface=crests*breakup*smoothstep(.08,.45,depth)*(0.4+0.6*flowNoise(moving*.31+2.0));
        color+=vec3(.012,.038,.045)*surface;
        float fineRipple=sin(moving.y*12.0+sin(moving.x*4.3)+distortion)*.014;
        color+=vec3(.25,.75,.80)*fineRipple*smoothstep(.05,.5,depth);
        gl_FragColor=vec4(color,1.0);
        #include <colorspace_fragment>
      }`,
  });
  const waterGeometry = new THREE.PlaneGeometry(180, 180, 320, 320);waterGeometry.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(waterGeometry, waterMaterial);water.name = 'depth-refracted-river';water.frustumCulled = false;
  return {
    terrain, water, sampleHeight, details: details.group,
    update(elapsed: number) { time.value = elapsed; },
    renderUnderwater(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
      const size = renderer.getDrawingBufferSize(new THREE.Vector2());
      // Half resolution is sufficient for the bed through gently rippled water.
      const w = Math.max(1, Math.floor(size.x * 0.75)), h = Math.max(1, Math.floor(size.y * 0.75));
      if (target.width !== w || target.height !== h) target.setSize(w, h);
      waterMaterial.uniforms.resolution!.value.copy(size);
      waterMaterial.uniforms.cameraNear!.value = camera.near;waterMaterial.uniforms.cameraFar!.value = camera.far;
      const previousTarget=renderer.getRenderTarget();
      water.visible=false;
      try {renderer.setRenderTarget(target);renderer.render(scene,camera);} finally {water.visible=true;renderer.setRenderTarget(previousTarget);}
    },
    dispose() { target.dispose();heightMap.dispose();details.dispose(); },
  };
}
