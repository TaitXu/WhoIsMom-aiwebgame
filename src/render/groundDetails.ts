import * as THREE from 'three';
import { stylizedSurface, meadowGLSL } from './stylizedSurface';
import type { TerrainCollider } from './environmentBuilder';

export function createGroundDetails(banks: readonly TerrainCollider[], height: (x:number,z:number)=>number, time:{value:number}) {
  const group=new THREE.Group();group.name='ground-grass-and-sand-grit';
  const blade=new THREE.BufferGeometry();const vertices:number[]=[],indices:number[]=[];
  for(let strand=0;strand<3;strand++)for(let i=0;i<=5;i++) {
    const t=i/5,side=strand-1,w=.016*(1-t)**.5,bend=t*t*.025;
    const x=side*(.025+t*t*.035),y=t*(strand===1?.21:.16);
    vertices.push(x-w,y,bend,x,y,bend-.003*(1-t),x+w,y,bend);
    if(i<5){const k=strand*18+i*3;indices.push(k,k+3,k+1,k+1,k+3,k+4,k+1,k+4,k+2,k+2,k+4,k+5);}
  }
  blade.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));blade.setIndex(indices);blade.computeVertexNormals();
  const mat=stylizedSurface(0xffffff,{side:THREE.DoubleSide});
  const wind=`
    vec3 grassBase=(modelMatrix*instanceMatrix*vec4(0,0,0,1)).xyz;
    float tip=clamp(position.y/.21,0.0,1.0);
    float wind=sin(grassBase.x*1.8+grassBase.z*.7-grassTime*1.7)*.025+sin(grassBase.z*3.0+grassTime*2.1)*.009;
    transformed.x+=wind*tip*tip;
    transformed.z+=wind*.4*tip*tip;
  `;
  mat.onBeforeCompile=shader=>{
    shader.uniforms.grassTime=time;
    shader.vertexShader='uniform float grassTime; varying float bladeHeight; varying vec3 grassOrigin;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\n objectNormal=vec3(0.0,1.0,0.0);');
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n'+wind+'\n bladeHeight=tip; grassOrigin=grassBase;');
    shader.fragmentShader=meadowGLSL+'varying float bladeHeight; varying vec3 grassOrigin; uniform float grassTime;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_begin>','#include <normal_fragment_begin>\n normal=normalize((viewMatrix*vec4(0.0,1.0,0.0,0.0)).xyz);');
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
 diffuseColor.rgb=meadowColor(grassOrigin.xz)*mix(.90,1.13,bladeHeight);
 float breeze=meadowNoise(grassOrigin.xz*.55-vec2(grassTime*.09,grassTime*.15));
 diffuseColor.rgb*=mix(.96,1.09,smoothstep(.4,.65,breeze));`);
  };
  const depth=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,side:THREE.DoubleSide});
  depth.onBeforeCompile=shader=>{
    shader.uniforms.grassTime=time;shader.vertexShader='uniform float grassTime;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n'+wind);
  };
  const grass=new THREE.InstancedMesh(blade,mat,banks.length*4000);grass.customDepthMaterial=depth;grass.name='wind-animated-grass';
  const grit=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),new THREE.MeshStandardMaterial({color:0xffffff,roughness:1}),banks.length*500);
  let state=49173;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  const dummy=new THREE.Object3D(),color=new THREE.Color();let gi=0,si=0;
  for(const b of banks) {
    const c=Math.cos(b.rotation),s=Math.sin(b.rotation);
    for(let cluster=0;cluster<1000;cluster++) {
      const a=random()*Math.PI*2,r=Math.sqrt(random());
      const lx=Math.cos(a)*r*(b.radiusX-.32),lz=Math.sin(a)*r*(b.radiusZ-.32);
      const x=b.centerX+lx*c-lz*s,z=b.centerZ+lx*s+lz*c,h=height(x,z);
      if(h>.43 && cluster<900) {
        const tuftScale=.55+random()*.4;
        for(let j=0;j<1;j++) {
          const px=x+(random()-.5)*.16,pz=z+(random()-.5)*.16,py=height(px,pz);
          if(py<.40)continue;
          dummy.position.set(px,py-.015,pz);dummy.rotation.set(0,random()*Math.PI*2,(random()-.5)*.25);
          dummy.scale.set(.7+random()*.7,tuftScale*(.6+random()*.6),1);dummy.updateMatrix();grass.setMatrixAt(gi,dummy.matrix);
          gi++;
        }
      } else if(h>-.14 && h<.43 && si<grit.instanceMatrix.count) {
        dummy.position.set(x,h+.012,z);dummy.rotation.set(random()*3,random()*6,random()*3);
        const size=.018+random()**3*.045;dummy.scale.set(size,size*.5,size*.8);dummy.updateMatrix();grit.setMatrixAt(si,dummy.matrix);
        grit.setColorAt(si++,color.setHSL(.10+random()*.04,.20+random()*.3,.35+random()*.25));
      }
    }
  }
  grass.count=gi;grit.count=si;
  for(const mesh of [grass,grit]){mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);}
  grass.castShadow=false;
  group.userData.bladeCount=gi;group.userData.gritCount=si;
  return {group,dispose(){depth.dispose();}};
}
