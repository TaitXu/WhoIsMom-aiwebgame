import * as THREE from 'three';
import { stylizedSurface } from './stylizedSurface';
import type { MaterialPalette } from './materialPalette';

function add(parent:THREE.Object3D,g:THREE.BufferGeometry,m:THREE.Material,p:THREE.Vector3,scale?:THREE.Vector3) {
  const mesh=new THREE.Mesh(g,m);mesh.position.copy(p);if(scale)mesh.scale.copy(scale);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
function tube(parent:THREE.Object3D,points:THREE.Vector3[],radius:number,material:THREE.Material){return add(parent,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),20,radius,8,false),material,new THREE.Vector3());}
export function createLandmarkModel(type:string,palette:MaterialPalette,accent:number):THREE.Group {
  const group=new THREE.Group();group.name=`landmark-${type}`;
  const wood=palette.toon(0x87613c),leaf=palette.toon(0x388334),flower=palette.toon(accent),stone=palette.toon(0xaaa18a);
  if(type==='willow') {
    const trunk=new THREE.CatmullRomCurve3([new THREE.Vector3(0,-.2,0),new THREE.Vector3(-.12,.9,.08),new THREE.Vector3(.12,1.8,0),new THREE.Vector3(-.08,2.8,.08)]);
    const trunkGeo=new THREE.TubeGeometry(trunk,32,.19,14,false);const p=trunkGeo.attributes.position!;
    for(let i=0;i<p.count;i++){const y=p.getY(i),center=trunk.getPointAt(Math.min(1,Math.max(0,(y+.2)/3)));const factor=1.25-y*.19;p.setX(i,center.x+(p.getX(i)-center.x)*factor);p.setZ(i,center.z+(p.getZ(i)-center.z)*factor);}trunkGeo.computeVertexNormals();add(group,trunkGeo,wood,new THREE.Vector3());
    const leaves=new THREE.InstancedMesh(new THREE.SphereGeometry(1,10,6),palette.toon(0xffffff),18*36);
    const dummy=new THREE.Object3D(),color=new THREE.Color();let index=0;
    for(let branch=0;branch<18;branch++) {
      const angle=branch*2.39996,reach=1.15+(branch%4)*.16,top=2.6+(branch%3)*.12;
      const path=new THREE.CatmullRomCurve3([new THREE.Vector3(0,2.1,0),new THREE.Vector3(Math.cos(angle)*reach*.6,top,Math.sin(angle)*reach*.6),new THREE.Vector3(Math.cos(angle)*reach,top-.4,Math.sin(angle)*reach),new THREE.Vector3(Math.cos(angle)*reach*1.1,.8+(branch%4)*.16,Math.sin(angle)*reach*1.1)]);
      add(group,new THREE.TubeGeometry(path,24,.025,6,false),wood,new THREE.Vector3());
      for(let j=0;j<18;j++)for(const side of [-1,1]){
        const t=.16+j/18*.82,pos=path.getPoint(t);dummy.position.copy(pos).add(new THREE.Vector3(Math.cos(angle+side*.8)*.10,-.03,Math.sin(angle+side*.8)*.10));
        dummy.rotation.set(.4+Math.sin(j)*.2,angle+side*.8,.35);dummy.scale.set(.065,.025,.18+(1-t)*.10);dummy.updateMatrix();leaves.setMatrixAt(index,dummy.matrix);leaves.setColorAt(index++,color.setHSL(.25+(branch%4)*.012,.55,.22+(j%5)*.018));
      }
    }
    leaves.castShadow=true;leaves.receiveShadow=true;group.add(leaves);
    for(let i=0;i<5;i++){const a=i*1.256;tube(group,[new THREE.Vector3(0,.2,0),new THREE.Vector3(Math.cos(a)*.35,.03,Math.sin(a)*.35),new THREE.Vector3(Math.cos(a)*.5,-.12,Math.sin(a)*.5)],.06,wood);}
  } else if(type==='reed-tower'||type==='crescent-reeds') {
    for(let i=0;i<11;i++){
      const a=i*2.399,r=.25+(i%3)*.22,h=1.7+(i%5)*.22,x=Math.cos(a)*r,z=Math.sin(a)*r;
      tube(group,[new THREE.Vector3(x,-.12,z),new THREE.Vector3(x+.1,h*.5,z),new THREE.Vector3(x+Math.cos(a)*.3,h,z+Math.sin(a)*.2)],.025,leaf);
      const head=add(group,new THREE.CapsuleGeometry(.09,.32,5,10),palette.toon(0x9b6c34),new THREE.Vector3(x+Math.cos(a)*.3,h,z+Math.sin(a)*.2));head.rotation.z=-Math.cos(a)*.12;
      for(const side of [-1,1]) {
        const shape=new THREE.Shape();shape.moveTo(0,0);shape.quadraticCurveTo(side*.4,.55,side*.65,.2);shape.quadraticCurveTo(side*.22,.28,0,0);
        const blade=add(group,new THREE.ShapeGeometry(shape,16),stylizedSurface(0x4d973b,{side:THREE.DoubleSide}),new THREE.Vector3(x,h*.42,z));blade.rotation.y=a;
      }
    }
  } else if(type==='stone-arch'||type==='lotus-arch') {
    if(type==='stone-arch') {
      for(const side of [-1,1])for(let i=0;i<4;i++)add(group,new THREE.DodecahedronGeometry(.35,1),stone,new THREE.Vector3(side*1.2,i*.48+.2,0),new THREE.Vector3(.95,.85,1));
      for(let i=0;i<9;i++){const a=i/8*Math.PI;const rock=add(group,new THREE.DodecahedronGeometry(.32,1),stone,new THREE.Vector3(Math.cos(a)*1.2,1.65+Math.sin(a)*.7,0),new THREE.Vector3(1.15,.85,.9));rock.rotation.z=a;}
    } else {
      tube(group,[new THREE.Vector3(-1.2,0,0),new THREE.Vector3(-1.2,1.7,0),new THREE.Vector3(0,2.5,0),new THREE.Vector3(1.2,1.7,0),new THREE.Vector3(1.2,0,0)],.11,leaf);
      for(let i=0;i<7;i++){const a=i/6*Math.PI;add(group,new THREE.SphereGeometry(.3,16,10),flower,new THREE.Vector3(Math.cos(a)*1.1,1.6+Math.sin(a)*.8,.02),new THREE.Vector3(1,.38,.65));}
    }
  } else if(type==='spring-flower'||type==='mud-bloom') {
    tube(group,[new THREE.Vector3(),new THREE.Vector3(.13,.8,0),new THREE.Vector3(0,1.6,0)],.06,leaf);
    for(let i=0;i<8;i++){const a=i/8*Math.PI*2;const petal=add(group,new THREE.SphereGeometry(.48,20,12),flower,new THREE.Vector3(Math.cos(a)*.55,1.6+Math.sin(a)*.06,Math.sin(a)*.55),new THREE.Vector3(1,.20,.50));petal.rotation.y=-a;petal.rotation.z=.12;}
    add(group,new THREE.SphereGeometry(.27,20,12),palette.toon(0xf4c548),new THREE.Vector3(0,1.65,0),new THREE.Vector3(1,.5,1));
  } else if(type==='nest') {
    for(let i=0;i<64;i++){const a=i*2.399;const r=.85+(i%4)*.065;const start=new THREE.Vector3(Math.cos(a)*r,.12+(i%4)*.04,Math.sin(a)*r);tube(group,[start,new THREE.Vector3(Math.cos(a+.28)*r,start.y+.025,Math.sin(a+.28)*r),new THREE.Vector3(Math.cos(a+.56)*r,start.y,Math.sin(a+.56)*r)],.025,i%2?wood:palette.toon(0xb09b62));}
    for(let i=0;i<4;i++){const a=i*2.399;add(group,new THREE.SphereGeometry(.26,24,16),palette.toon(0xffefd0),new THREE.Vector3(Math.cos(a)*.4,.30,Math.sin(a)*.4),new THREE.Vector3(1,1.3,1));}
  } else {
    tube(group,[new THREE.Vector3(),new THREE.Vector3(.15,1.4,0),new THREE.Vector3(0,2.6,0)],.1,wood);
    const topper=add(group,new THREE.SphereGeometry(.5,20,12),flower,new THREE.Vector3(0,2.65,0),new THREE.Vector3(.8,.35,1.4));topper.rotation.z=.25;
  }
  return group;
}
