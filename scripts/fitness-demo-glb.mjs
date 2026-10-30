import { writeFileSync } from 'node:fs';

const chunks = [], views = [], accessors = [];
let length = 0;
function add(values, component, type, target) {
  const pad = (4-length%4)%4;
  if (pad) { chunks.push(Buffer.alloc(pad)); length+=pad; }
  const buf=Buffer.alloc(values.length*(component===5126?4:2));
  values.forEach((value,i)=>component===5126?buf.writeFloatLE(value,i*4):buf.writeUInt16LE(value,i*2));
  const view={buffer:0,byteOffset:length,byteLength:buf.length};
  if(target)view.target=target;
  chunks.push(buf);length+=buf.length;
  views.push(view);
  const stride={SCALAR:1,VEC3:3,VEC4:4}[type];
  const acc={bufferView:views.length-1,componentType:component,count:values.length/stride,type};
  if(component===5126&&type==='SCALAR') { acc.min=[Math.min(...values)];acc.max=[Math.max(...values)]; }
  if(component===5126&&type==='VEC3') {
    acc.min=[0,1,2].map(i=>Math.min(...values.filter((_,j)=>j%3===i)));
    acc.max=[0,1,2].map(i=>Math.max(...values.filter((_,j)=>j%3===i)));
  }
  accessors.push(acc);return accessors.length-1;
}
const pos=[], normals=[], indices=[], lat=8,lon=12;
for(let i=0;i<=lat;i++)for(let j=0;j<=lon;j++){
  const t=Math.PI*i/lat,p=2*Math.PI*j/lon;
  const xyz=[Math.sin(t)*Math.cos(p),Math.cos(t),Math.sin(t)*Math.sin(p)];
  pos.push(...xyz);normals.push(...xyz);
}
for(let i=0;i<lat;i++)for(let j=0;j<lon;j++){
  const a=i*(lon+1)+j,b=a+lon+1;indices.push(a,b,a+1,b,b+1,a+1);
}
const position=add(pos,5126,'VEC3',34962),normal=add(normals,5126,'VEC3',34962),
  index=add(indices,5123,'SCALAR',34963);
const nodes=[];
function node(name,mesh,tr,scale){
  const item={name};if(mesh!==undefined)item.mesh=mesh;
  if(tr)item.translation=tr;if(scale)item.scale=scale;
  nodes.push(item);return nodes.length-1;
}
const body=node('Quadril',undefined,[0,1.15,0]);
const torso=node('Tronco',0,[0,.37,0],[.23,.39,.16]);
const head=node('Cabe�a',1,[0,.86,0],[.17,.19,.16]);
const left=node('Bra�o esquerdo',0,[-.31,.58,0],[.09,.34,.09]);
const right=node('Bra�o direito',0,[.31,.58,0],[.09,.34,.09]);
nodes[body].children=[torso,head,left,right];
const thighs=[],shins=[];
for(const [side,z] of [['Esquerda',-.15],['Direita',.15]]){
  const hip=node('Coxa '+side,undefined,[0,0,z]);
  const thigh=node('Volume coxa '+side,0,[0,-.27,0],[.12,.29,.11]);
  const knee=node('Joelho '+side,undefined,[0,-.54,0]);
  const shin=node('Volume perna '+side,0,[0,-.27,0],[.09,.28,.09]);
  const foot=node('P� '+side,0,[.10,-.55,0],[.22,.065,.12]);
  nodes[body].children.push(hip);nodes[hip].children=[thigh,knee];nodes[knee].children=[shin,foot];
  thighs.push(hip);shins.push(knee);
}
const times=add([0,1,2],5126,'SCALAR');
const rotation=d=>[0,0,Math.sin(d*Math.PI/360),Math.cos(d*Math.PI/360)];
const animation={samplers:[],channels:[]};
function animate(target,path,frames,type){
  const output=add(frames.flat(),5126,type);
  animation.samplers.push({input:times,output,interpolation:'LINEAR'});
  animation.channels.push({sampler:animation.samplers.length-1,target:{node:target,path}});
}
animate(body,'translation',[[0,1.15,0],[0,.75,0],[0,1.15,0]],'VEC3');
for(let i=0;i<2;i++){
  animate(thighs[i],'rotation',[rotation(0),rotation(70),rotation(0)],'VEC4');
  animate(shins[i],'rotation',[rotation(0),rotation(-70),rotation(0)],'VEC4');
}
const gltf={
  asset:{version:'2.0',generator:'VendeWeb original pilot model'},
  scene:0,scenes:[{nodes:[body]}],nodes,
  materials:[
    {name:'Azul demonstrativo',pbrMetallicRoughness:{baseColorFactor:[.08,.32,.39,1],metallicFactor:0,roughnessFactor:.86}},
    {name:'Cabe�a',pbrMetallicRoughness:{baseColorFactor:[.8,.54,.38,1],metallicFactor:0,roughnessFactor:.94}}
  ],
  meshes:[
    {primitives:[{attributes:{POSITION:position,NORMAL:normal},indices:index,material:0}]},
    {primitives:[{attributes:{POSITION:position,NORMAL:normal},indices:index,material:1}]}
  ],
  buffers:[{byteLength:length}],bufferViews:views,accessors,
  animations:[{name:'Agachamento ilustrativo',...animation}]
};
let json=Buffer.from(JSON.stringify(gltf));
json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,0x20)]);
let bin=Buffer.concat(chunks);
bin=Buffer.concat([bin,Buffer.alloc((4-bin.length%4)%4)]);
const header=Buffer.alloc(12);header.write('glTF');header.writeUInt32LE(2,4);
header.writeUInt32LE(12+8+json.length+8+bin.length,8);
const jsonHeader=Buffer.alloc(8);jsonHeader.writeUInt32LE(json.length);jsonHeader.write('JSON',4);
const binHeader=Buffer.alloc(8);binHeader.writeUInt32LE(bin.length);binHeader.write('BIN\0',4);
const glb=Buffer.concat([header,jsonHeader,json,binHeader,bin]);
writeFileSync('fitness-demo-squat.glb',glb);
console.log('GLB',glb.length,'bytes');

