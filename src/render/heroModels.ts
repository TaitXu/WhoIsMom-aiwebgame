import * as THREE from 'three';
import { stylizedSurface } from './stylizedSurface';
import type { MaterialPalette } from './materialPalette';

function part(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, position: [number,number,number], scale: [number,number,number]=[1,1,1]) {
  const mesh=new THREE.Mesh(geometry,material);mesh.position.set(...position);mesh.scale.set(...scale);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
function eyes(parent: THREE.Group, radius: number, x: number, y: number, z: number) {
  const ivory=stylizedSurface(0xfff8df);
  const black=new THREE.MeshPhysicalMaterial({color:0x111d22,roughness:0.13,clearcoat:1,clearcoatRoughness:0.15});
  const highlight=new THREE.MeshBasicMaterial({color:0xffffff});
  for(const side of [-1,1]) {
    const eye=part(parent,new THREE.SphereGeometry(radius,24,16),ivory,[x*side,y,z],[1,1.08,0.88]);
    part(eye,new THREE.SphereGeometry(radius*0.57,20,14),black,[0,radius*0.22,-radius*0.76],[1,1.08,0.5]);
    part(eye,new THREE.SphereGeometry(radius*0.18,12,8),highlight,[-radius*0.17,radius*0.48,-radius*0.98]);
  }
}
function finGeometry(length:number,width:number):THREE.ShapeGeometry {
  const shape=new THREE.Shape();shape.moveTo(0,0);shape.bezierCurveTo(length*0.25,-width*0.35,length*0.65,-width,length,-width*0.72);
  shape.quadraticCurveTo(length*1.17,0,length,width*0.72);shape.bezierCurveTo(length*0.65,width,length*0.25,width*0.35,0,0);
  return new THREE.ShapeGeometry(shape,18);
}
export function createPufferModel(_palette:MaterialPalette) {
  const model=new THREE.Group();model.name='detailed-puffer-model';
  const skin=stylizedSurface(0xf6bd32);
  skin.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec3 skinLocal;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n skinLocal=position;');
    shader.fragmentShader='varying vec3 skinLocal;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float belly=1.0-smoothstep(-0.24,0.22,skinLocal.y);
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.93,0.85,0.61),belly*0.9);
    `);
  };
  const body=part(model,new THREE.SphereGeometry(1,40,28),skin,[0,0.55,0],[0.73,0.65,0.86]);
  eyes(model,0.18,0.40,0.92,-0.48);
  const lip=stylizedSurface(0xc88a26);
  part(model,new THREE.TorusGeometry(0.105,0.038,12,28),lip,[0,0.56,-0.842],[1,0.85,1]);
  part(model,new THREE.SphereGeometry(0.075,18,12),stylizedSurface(0x725128),[0,0.56,-0.852],[1,0.8,0.24]);
  // Short, rounded-looking nubs maintain a soft silhouette rather than aggressive spikes.
  const spines=new THREE.InstancedMesh(new THREE.ConeGeometry(0.027,0.08,8),stylizedSurface(0xfbe3a0),64);
  const spots=new THREE.InstancedMesh(new THREE.SphereGeometry(1,10,6),stylizedSurface(0xbd852c),64);
  const dummy=new THREE.Object3D(),up=new THREE.Vector3(0,1,0);let count=0;
  for(let i=0;i<100;i++) {
    const y=1-2*(i+0.5)/100,a=i*2.399963,r=Math.sqrt(1-y*y);
    const n=new THREE.Vector3(Math.cos(a)*r,y,Math.sin(a)*r);
    if(n.y<-.3||n.z<-.56||count>=64)continue;
    const surface=new THREE.Vector3(n.x*.73,.55+n.y*.65,n.z*.86);
    dummy.position.copy(surface).addScaledVector(n,.025);dummy.quaternion.setFromUnitVectors(up,n);dummy.scale.setScalar(.8+(i%4)*.08);dummy.updateMatrix();spines.setMatrixAt(count,dummy.matrix);
    dummy.position.copy(surface).addScaledVector(n,.002);dummy.scale.set(.04,.008,.032);dummy.updateMatrix();spots.setMatrixAt(count,dummy.matrix);count++;
  }
  spines.count=count;spots.count=count;spines.castShadow=true;model.add(spines,spots);
  const finMaterial=new THREE.MeshPhysicalMaterial({color:0xf6cf62,transparent:true,opacity:0.77,roughness:0.45,side:THREE.DoubleSide,depthWrite:false});
  const fins:THREE.Mesh[]=[];
  for(const side of [-1,1]) {
    const fin=part(model,finGeometry(.47,.22),finMaterial,[side*.65,.57,.02]);
    fin.rotation.x=-Math.PI/2;if(side<0)fin.rotation.z=Math.PI;fins.push(fin);
    for(let j=-2;j<=2;j++) {
      const curve=new THREE.QuadraticBezierCurve3(new THREE.Vector3(),new THREE.Vector3(side*.24,.015,j*.045),new THREE.Vector3(side*.43,0,j*.065));
      part(model,new THREE.TubeGeometry(curve,12,.008,4,false),lip,[side*.65,.58,.02]);
    }
  }
  const tail=new THREE.Group();tail.name='puffer-tail';tail.position.set(0,.78,.78);model.add(tail);
  const tailMaterial=stylizedSurface(0xe9aa30,{side:THREE.DoubleSide});
  part(tail,new THREE.CapsuleGeometry(.075,.23,6,12),skin,[0,0,.13],[1,1,1]).rotation.x=Math.PI/2;
  const tailShape=new THREE.Shape();tailShape.moveTo(-.055,.20);
  tailShape.bezierCurveTo(-.13,.32,-.40,.51,-.37,.69);
  tailShape.quadraticCurveTo(0,.82,.37,.69);
  tailShape.bezierCurveTo(.40,.51,.13,.32,.055,.20);tailShape.closePath();
  const tailFin=part(tail,new THREE.ExtrudeGeometry(tailShape,{depth:.025,bevelEnabled:true,bevelThickness:.012,bevelSize:.012,bevelSegments:2,curveSegments:20}),tailMaterial,[0,.02,0]);
  tailFin.name='puffer-fan-tail';tailFin.rotation.x=Math.PI/2;
  for(let j=-3;j<=3;j++) {
    const curve=new THREE.QuadraticBezierCurve3(new THREE.Vector3(0,.043,.20),new THREE.Vector3(j*.045,.055,.43),new THREE.Vector3(j*.103,.043,.70));
    part(tail,new THREE.TubeGeometry(curve,18,.009,5,false),lip,[0,0,0]);
  }
  const dorsal=part(model,finGeometry(.30,.14),finMaterial,[0,1.12,.13]);dorsal.rotation.z=Math.PI/2;dorsal.rotation.y=Math.PI/2;
  model.userData.animate=(time:number,activity:number)=>{fins.forEach((fin,i)=>{fin.rotation.y=Math.sin(time*(8+activity*6)+i*Math.PI)*.22;});};
  return {model,body,tail};
}

export function createTadpoleModel(color:number,phase:number) {
  const model=new THREE.Group();model.name='detailed-tadpole-model';
  const skin=stylizedSurface(0x263c47);
  const headGeometry=new THREE.SphereGeometry(1,32,24);
  const p=headGeometry.attributes.position!;
  for(let i=0;i<p.count;i++){const z=p.getZ(i);p.setX(i,p.getX(i)*(1-z*.15));}headGeometry.computeVertexNormals();
  const body=part(model,headGeometry,skin,[0,.38,-.12],[.43,.37,.47]);
  eyes(model,.11,.22,.65,-.43);
  const cheek=stylizedSurface(0xdd8f8b);
  for(const side of [-1,1])part(model,new THREE.SphereGeometry(.065,16,10),cheek,[side*.29,.49,-.43],[1,.5,.5]);
  const smile=new THREE.QuadraticBezierCurve3(new THREE.Vector3(-.07,.42,-.552),new THREE.Vector3(0,.38,-.57),new THREE.Vector3(.07,.42,-.552));
  part(model,new THREE.TubeGeometry(smile,16,.012,6,false),new THREE.MeshStandardMaterial({color:0x10262c}),[0,0,0]);
  const tail=new THREE.Group();tail.position.set(0,.38,.18);model.add(tail);
  const path=new THREE.CatmullRomCurve3([new THREE.Vector3(0,0,0),new THREE.Vector3(0,-.015,.24),new THREE.Vector3(.025,-.02,.58),new THREE.Vector3(0,0,1.04)]);
  // Tapered muscular tail core, with a separate thin dorsal/ventral swimming membrane.
  const core=new THREE.TubeGeometry(path,32,.115,12,false);const cp=core.attributes.position!;
  for(let i=0;i<cp.count;i++){const z=cp.getZ(i);cp.setX(i,cp.getX(i)*Math.max(.02,1-z));cp.setY(i,cp.getY(i)*Math.max(.05,1-z));}core.computeVertexNormals();
  part(tail,core,skin,[0,0,0]);
  const vertices:number[]=[],indices:number[]=[];
  for(let i=0;i<=36;i++){const t=i/36,z=t*1.04,width=Math.sin(t*Math.PI)**.7*.16;vertices.push(0,-width,z,0,width,z);if(i<36){const k=i*2;indices.push(k,k+1,k+2,k+1,k+3,k+2);}}
  const membrane=new THREE.BufferGeometry();membrane.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));membrane.setIndex(indices);membrane.computeVertexNormals();
  const finMaterial=new THREE.MeshPhysicalMaterial({color:0x73939c,transparent:true,opacity:.63,roughness:.4,side:THREE.DoubleSide,depthWrite:false});
  part(tail,membrane,finMaterial,[0,0,0]);
  const leafShape=new THREE.Shape();leafShape.moveTo(0,0);leafShape.quadraticCurveTo(.18,.10,0,.26);leafShape.quadraticCurveTo(-.15,.10,0,0);
  const leaf=part(model,new THREE.ShapeGeometry(leafShape,16),new THREE.MeshStandardMaterial({color,side:THREE.DoubleSide,roughness:.7}),[.04,.73,-.02]);leaf.rotation.x=-Math.PI/2;
  const shaderTime={value:0};
  for(const material of [skin,finMaterial]) {
    material.onBeforeCompile=shader=>{
      shader.uniforms.swimTime=shaderTime;
      shader.vertexShader='uniform float swimTime;\n'+shader.vertexShader;
      // Restrict deformation to the tail meshes using the material's local z, head geometry has a different scale.
      if(material===finMaterial)shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>\n transformed.x+=sin(position.z*6.0-swimTime)*position.z*position.z*0.075;`);
    };
  }
  model.userData.animate=(time:number,activity:number)=>{shaderTime.value=time*(5+activity*4)+phase;};
  return {model,body,tail};
}
