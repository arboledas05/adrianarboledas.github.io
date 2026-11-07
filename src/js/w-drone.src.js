/* w-drone.js (B5): The Viewfinder Valley. Shared heightfield on top (pure JS, also imported by tools/drone-svg.mjs). */
const{hypot:hy,floor:fl,sin,cos,max,min,abs,imul,PI}=Math,PAD=[4.3,1.5],VIL=[-4.7,-1.2],SEED=7;
export const TER={w:16,d:10,pad:PAD,vil:VIL};
export const RIVER=[[-2.6,-5.6],[-2.2,-3.6],[-.7,-2.2],[.5,-.6],[-.1,1.3],[1.2,3],[.9,5.6]];
export const PATH=[[-4.7,-1.2],[-3.3,.2],[-1.6,.5],[.2,-.4],[1.7,.9],[3.2,1.9],[4.3,1.5]];
const sm=t=>t*t*(3-2*t),cl=(v,a=0,b=1)=>v<a?a:v>b?b:v;
const ss=(a,b,x)=>sm(cl((x-a)/(b-a)));
function rng(s){return()=>{s|=0;s=s+0x6D2B79F5|0;let t=imul(s^s>>>15,1|s);t=t+imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const hs=(i,j)=>{let h=imul(i,374761393)+imul(j,668265263)+imul(SEED,982451653)|0;h=imul(h^h>>>13,1274126177);return((h^h>>>16)>>>0)/4294967296};
function vn(x,y){const i=fl(x),j=fl(y),fx=sm(x-i),fy=sm(y-j),a=hs(i,j),b=hs(i+1,j),c=hs(i,j+1),d=hs(i+1,j+1);return a+(b-a)*fx+(c-a)*fy+(a-b-c+d)*fx*fy}
function fbm(x,y,o=4){let s=0,a=.5,f=1,n=0;for(let k=0;k<o;k++){s+=a*vn(x*f+k*7.1,y*f-k*3.7);n+=a;a*=.5;f*=2.03}return s/n}
/* centripetal-ish Catmull-Rom through pts (open), n samples */
export function spline(P,n){const o=[];for(let i=0;i<n;i++){const u=i/(n-1)*(P.length-1),k=min(P.length-2,fl(u)),t=u-k,p0=P[max(0,k-1)],p1=P[k],p2=P[k+1],p3=P[min(P.length-1,k+2)],t2=t*t,t3=t2*t;o.push([0,1].map(c=>.5*(2*p1[c]+(-p0[c]+p2[c])*t+(2*p0[c]-5*p1[c]+4*p2[c]-p3[c])*t2+(-p0[c]+3*p1[c]-3*p2[c]+p3[c])*t3)))}return o}
const RS=spline(RIVER,36);
function dRiver(x,z){let m=1e9;for(let i=1;i<RS.length;i++){const a=RS[i-1],b=RS[i],dx=b[0]-a[0],dz=b[1]-a[1],t=cl(((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)),ex=x-a[0]-t*dx,ez=z-a[1]-t*dz,d=ex*ex+ez*ez;if(d<m)m=d}return Math.sqrt(m)}
function raw(x,z){let h=1.1*ss(.28,.8,fbm(x*.22+11.3,z*.22+4.1));h+=1.05*ss(-1.4,-4.9,z)+.55*ss(5.2,7.9,abs(x))-.25*ss(1.5,4.8,z);return h-.6*(1-ss(0,1.2,dRiver(x,z)))}
const PH=raw(PAD[0],PAD[1]),VH=raw(VIL[0],VIL[1]);
export function height(x,z){let h=raw(x,z);const dp=hy(x-PAD[0],z-PAD[1]),dv=hy(x-VIL[0],z-VIL[1]);h+=(PH-h)*(1-ss(.385,.7,dp));h+=(VH-h)*(1-ss(.46,1.15,dv))*.85;return h}
function slope(x,z){const e=.08;return hy(height(x+e,z)-height(x-e,z),height(x,z+e)-height(x,z-e))/(2*e)}
/* seeded props shared with the SVG twin */
export function trees(n){const r=rng(SEED*31),o=[];let g=0;while(o.length<n&&g++<6000){const x=(r()-.5)*15.2,z=(r()-.5)*9.2;if(hy(x-PAD[0],z-PAD[1])<1||hy(x-VIL[0],z-VIL[1])<1.3||dRiver(x,z)<.55)continue;const s=slope(x,z);if(s<.3||s>.9)continue;o.push([x,z,.75+r()*.5,r()*6.28])}return o.sort((a,b)=>a[0]-b[0])}
export function houses(){const r=rng(SEED*17),o=[];let g=0;while(o.length<12&&g++<900){const a=r()*6.28,d=.25+r()*.85,x=VIL[0]+cos(a)*d*1.15,z=VIL[1]+sin(a)*d*.8;if(o.some(h=>hy(h[0]-x,h[1]-z)<.3)||hy(x-VIL[0]-.15,z-VIL[1]+.1)<.22)continue;o.push([x,z,(r()-.5)*.6+(a>3.14?0:1.57),.8+r()*.4])}return o}
/* ------------------------------------------------------------------ the 3D world (create() contract) */
export async function create(T,K,ctx,slot,opt){
const{Vector3:V,Mesh:M,Group:G,Color:C,CylinderGeometry:Cy,ConeGeometry:Co,SphereGeometry:Sp,InstancedMesh:IM,BufferAttribute:BA,Float32BufferAttribute:FA,CatmullRomCurve3:CR,MeshBasicMaterial:MB}=T,mob=!!opt.mobile,still=opt.still,E=K.ease,
cl=(v,a=0,b=1)=>v<a?a:v>b?b:v,lerp=(a,b,t)=>a+(b-a)*t,hud=slot.querySelector('.drone-hud'),timers=[],
scene=new T.Scene(),cam=new T.PerspectiveCamera(34,16/9,.1,60),root=new G(),valley=new G(),dr=new G(),body=new G(),gim=new G(),mtx=new T.Object3D(),pm=(im,i,x,y,z,rx,ry,rz,k)=>{mtx.position.set(x,y,z);mtx.rotation.set(rx,ry,rz);mtx.scale.setScalar(max(1e-3,k));mtx.updateMatrix();im.setMatrixAt(i,mtx.matrix);im.instanceMatrix.needsUpdate=true};
scene.add(root);root.add(valley,dr);dr.add(body);
K.rig(scene,{hemi:['#CFE3EE','#6E5B3A',.62],key:['#FFE2B8',2.7,[-7,3.2,.8]],rim:['#9FC6FF',.55,[5,4,6]],fog:['#EFE6D2',11,27]});
scene.environment=K.env(['#DCEFF7','#F3E6CF','#6E5B3A']);
/* FOUR programs for the whole world:
   - 'clay-valley' (vertex colours, terrain facets = 40 % face normal over the smooth one): terrain + skirts + river + tower + houses + pad, ONE static mesh (aF.z: 0 terrain, 1 river, 2 plain)
   - 'clay-vc' instanced + instance colour (flat): trees, flight path, props, nav lights
   - 'clay-vcs' (smooth, vertex colours): plinth lip, home bead, drone body, gimbal (the map pins use it too)
   - MeshBasic + the shared soft-blob texture: contact shadows + blur discs */
const U={uT:{value:0},uC:{value:new T.Vector4(-9,0,-9,0)}},
vc=(g,hex)=>{const c=new C(hex),n=g.attributes.position.count,a=new Float32Array(n*3);for(let i=0;i<n;i++)c.toArray(a,i*3);g.setAttribute('color',new BA(a,3));return g},
vcM=(hex='#ffffff',o)=>K.clay(hex,{vertexColors:true,flatShading:true,env:.45,rim:'#FFD9A8',rimK:.18,key:'clay-vc',...o}),
vcs=o=>K.clay('#ffffff',{vertexColors:true,key:'clay-vcs',...o}),
/* valley shader: a patchwork of crop plots (ochre #D9B86A, wheat #E6CC85, young green #BCD48C, linear; scaled by the meadow #A9C98A) on a rotated grid, drawn per pixel so the edges are straight and
   crisp whatever the triangle grid, masked by the SMOOTH ground normal (aN) so plots stop along a soft curve, never a triangle staircase;
   contour lines on the terrain only; the river's scrolling ripple; two drifting cloud shadows over everything. */
BV='#include <begin_vertex>',CF='#include <color_fragment>',RF='#include <roughnessmap_fragment>',NF='#include <normal_fragment_begin>',
valleyP=s=>{s.uniforms.uC=U.uC;s.uniforms.uT=U.uT;
 s.vertexShader='attribute vec3 aF;attribute float aN;varying vec3 vP,vF;varying float vNy;\n'+s.vertexShader.replace(BV,BV+'\nvP=position;vNy=aN;vF=aF;');
 s.fragmentShader='varying vec3 vP,vF;varying float vNy;uniform vec4 uC;uniform float uT;float cs(vec2 c){return 1.-smoothstep(0.,1.7,length((vP.xz-c)*vec2(.6,1.)));}float dH(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float dN(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(dH(i),dH(i+vec2(1.,0.)),f.x),mix(dH(i+vec2(0.,1.)),dH(i+1.),f.x),f.y);}\n'+s.fragmentShader
 .replace(CF,CF+`
 float iT=1.-step(.5,vF.z),iR=step(.5,vF.z)*(1.-step(1.5,vF.z));
 vec2 q=mat2(.94,.34,-.34,.94)*vP.xz/vec2(.92,.6),fi=floor(q),ff=fract(q),fe=min(ff,1.-ff)*vec2(.92,.6);float fr=dH(fi+17.),fd=min(fe.x,fe.y),fa=fwidth(fd)+.002,nw=fwidth(vNy)+.004,
  fo=iT*smoothstep(.83-nw,.83+nw,vNy)*smoothstep(-.28,-.18,vP.y)*(1.-smoothstep(.55,.68,vP.y))*step(fr,.6)*step(.4,dN(fi*.33+2.))*smoothstep(.03-fa,.03+fa,fd),
  ra=(fr<.3?q.x*.92:q.y*.6)*26.,rw=fwidth(ra);
 diffuseColor.rgb=mix(diffuseColor.rgb,(fr<.24?vec3(.694,.479,.144):fr<.42?vec3(.791,.604,.235):vec3(.503,.658,.262))*(diffuseColor.g/.584)*(1.+.07*sin(ra)*(1.-smoothstep(.5,1.5,rw))),fo);
 float hh=vP.y*5.;diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.09,.08,.06),(.18-.18*smoothstep(0.,fwidth(hh)*1.2,abs(fract(hh)-.5)))*smoothstep(.2,.45,vNy)*iT)*(1.-.08*(cs(uC.xy)+cs(uC.zw)));
 diffuseColor.rgb=mix(diffuseColor.rgb,vec3(1.),.42*iR*step(.84,fract(vF.x*64.-uT*.45))*step(.3,fract(vF.y*2.+.1)));`)
 .replace(RF,RF+'\nroughnessFactor=mix(roughnessFactor,.3,iR);').replace(NF,NF+'\nnormal=normalize(mix(normal,normalize(cross(dFdx(vViewPosition),dFdy(vViewPosition))),.35*iT));')},
H=height,ROCK='#B9B2A0',WH=new C(1,1,1),VP=[],
/* one part of the static valley mesh: non-indexed, vertex colours, aF (flow uv + kind), aN (ground normal y) */
part=(g,kind,hex)=>{if(hex)vc(g,hex);const n=g.index?g.toNonIndexed():g;if(n!==g)g.dispose();if(!n.attributes.normal)n.computeVertexNormals();const c=n.attributes.position.count,f=new Float32Array(c*3),uv=n.attributes.uv,ny=new Float32Array(c),nm=n.attributes.normal;
 for(let i=0;i<c;i++){f[i*3+2]=kind;if(kind==1&&uv){f[i*3]=uv.getX(i);f[i*3+1]=uv.getY(i)}ny[i]=nm.getY(i)}n.setAttribute('aF',new BA(f,3));if(!n.attributes.aN)n.setAttribute('aN',new BA(ny,1));VP.push(n);return n};
let terrain,tM,treeM,tp,props,discs,lights,path,curve,spin=0,pang=0,ox=0,oz=0,tapT=-9,tapX=0,tapZ=0,camX=-4,look=new V(),pos=new V(),init=0,live=0,q=3,tpP=-1,tpN=-1;
await K.idleChunks([
function*(){/* faceted terrain: colours blended PER VERTEX from height and slope (soft tonal bands; the facets come from the light only),
   plus a faint per-face jitter; the smooth normals feed aN (plot mask, contour fade). A generator: it yields between rows
   (idleChunks resumes it in the next idle slice), so the ~8k H() calls never block one frame. */
 const nx=mob?96:112,nz=mob?60:70,g=new T.PlaneGeometry(16,10,nx,nz).rotateX(-PI/2),pa=g.attributes.position;
 for(let i=0;i<pa.count;i++){pa.setY(i,H(pa.getX(i),pa.getZ(i)));if(i%800==799)yield}g.computeVertexNormals();yield;
 const nm=g.attributes.normal,col=new Float32Array(pa.count*3),ny=new Float32Array(pa.count),c=new C(),BASE=new C('#E9D9B0'),rk=new C(ROCK),G1=new C('#A9C98A'),G2=new C('#7FA36B'),r=rng(9);
 for(let i=0;i<pa.count;i++){const hn=(pa.getY(i)+.74)/2.93,st=1-nm.getY(i);ny[i]=nm.getY(i);
  c.copy(BASE).lerp(G1,ss(.08,.22,hn)).lerp(G2,ss(.42,.6,hn)).lerp(rk,ss(.74,.9,hn));c.lerp(rk,.4*ss(.28,.5,st)*ss(.25,.4,hn));c.toArray(col,i*3);if(i%2000==1999)yield}
 g.setAttribute('color',new BA(col,3));g.setAttribute('aN',new BA(ny,1));g.deleteAttribute('uv');
 const ca=part(g,0).attributes.color;yield;
 for(let i=0;i<ca.count;i+=3){const k=.985+r()*.03;for(let j=i;j<i+3;j++)ca.setXYZ(j,ca.getX(j)*k,ca.getY(j)*k,ca.getZ(j)*k);if(i%6000==5997)yield}},
()=>{/* cut-cake skirts with strata + indigo lip + blob shadow */
 const a=[],c=[],W=16/2,D=10/2,N=mob?24:48,B0=-.12,BANDS=[['#7E5F3F',B0],['#E9D9B0',-.3],['#C9774F',-.46],['#E3C79A',-.6]],cc=new C(),
 wall=f=>{for(let i=0;i<N;i++){const A=f(i/N),B=f((i+1)/N),ha=H(A[0],A[1]),hb=H(B[0],B[1]);let ta=ha,tb=hb;
  for(const[hex,y]of BANDS){const ba=min(ta,y===B0?min(ha-.08,-.02):y),bb=min(tb,y===B0?min(hb-.08,-.02):y);
   if(ta>ba||tb>bb)for(const k of[0,1,3,0,3,2]){const Q=k&2?B:A;a.push(Q[0],[ta,ba,tb,bb][k],Q[1]);cc.set(hex).toArray(c,c.length)}ta=ba;tb=bb}}};
 wall(t=>[-W+t*2*W,D]);wall(t=>[W,D-t*2*D]);wall(t=>[W-t*2*W,-D]);wall(t=>[-W,-D+t*2*D]);
 const g=new T.BufferGeometry();g.setAttribute('position',new FA(a,3));g.setAttribute('color',new FA(c,3));g.computeVertexNormals();part(g,2);
 const lp=K.lip(16,10,.06,.035,vcs({coat:.6}));vc(lp.geometry,'#3A2BE0');lp.position.y=-.6;const bl=K.blob(16+3,10+2.4,.2,'#5A4630');bl.position.y=-.62;valley.add(lp,bl)},
()=>{/* river ribbon following the bed (its scrolling ripple lives in the valley shader) */
 const cr=new CR(spline(RIVER,40).map(([x,z])=>new V(x,0,z))),g=new T.TubeGeometry(cr,mob?70:120,.16,6).scale(1,.12,1),pa=g.attributes.position;
 for(let i=0;i<pa.count;i++)pa.setY(i,pa.getY(i)+H(pa.getX(i),pa.getZ(i))+.07);g.computeVertexNormals();part(g,1,'#7CC6E8')},
()=>{/* trees (two-tone cones, instanced); village houses, tower and the pad are baked into the valley; home bead */
 const tg=K.merge([vc(new Co(.14,.26,7).translate(0,.2,0),'#5E8A52'),vc(new Co(.1,.2,7).translate(0,.36,0),'#79A866'),vc(new Cy(.03,.03,.12,6).translate(0,.06,0),'#8A5A3B')]);
 tp=(mob?trees(90).filter(([x])=>abs(x)<5.8):trees(90)).map(([x,z,s,a])=>[x,z,s,a,H(x,z)-.02]);/* + the cached ground height */treeM=new IM(tg,vcM(),tp.length);for(let i=0;i<tp.length;i++)treeM.setColorAt(i,WH);valley.add(treeM);
 const hg=()=>K.merge([vc(K.slab(.22,.14,.15,{r:.02}).translate(0,.07,0),'#F6EEDC'),vc(new Cy(.1,.1,.24,3).rotateZ(PI/2).rotateX(PI/6).scale(1,.75,1.05).translate(0,.19,0),'#E0784F')]);
 for(const[x,z,a,s]of houses()){mtx.position.set(x,H(x,z)-.01,z);mtx.rotation.set(0,a,0);mtx.scale.setScalar(s);mtx.updateMatrix();part(hg().applyMatrix4(mtx.matrix),2)}
 const vx=VIL[0]+.15,vz=VIL[1]-.1;part(K.merge([vc(K.slab(.14,.5,.14,{r:.02}).translate(0,.25,0),'#F6EEDC'),vc(new Co(.11,.2,4).rotateY(PI/4).translate(0,.6,0),'#E0784F')]).translate(vx,H(vx,vz)-.01,vz),2);
 const[px,pz]=PAD,py=H(px,pz),b=(w,d,x,z)=>K.slab(w,.012,d,{r:.008}).translate(x,.068,z);
 part(new Cy(.55,.58,.06,40).translate(px,py+.03,pz),2,'#CDC5B5');
 part(K.merge([new T.RingGeometry(.41,.47,40).rotateX(-PI/2).translate(0,.064,0),b(.06,.34,-.11,0),b(.06,.34,.11,0),b(.2,.055,0,0)]).translate(px,py,pz),2,'#FFFFFF');
 const bead=new M(vc(new Sp(.1,24,14),'#3A2BE0'),vcs({rough:.25,coat:1,ccr:.06,rimK:.2,env:1.1}));bead.position.set(px+.36,py+.16,pz+.24);valley.add(bead)},
()=>{/* the static valley: ONE draw */
 const g=K.merge(VP);VP.forEach(x=>x.dispose());VP.length=0;
 tM=K.clay('#ffffff',{vertexColors:true,coat:0,rough:.85,env:.35,rim:'#FFD9A8',rimK:.1,wrap:.04,key:'clay-valley',patch:valleyP});terrain=new M(g,tM);valley.add(terrain)},
()=>{/* dash-dot flight path: 80 pills along the curve at h + .6 */
 curve=new CR(spline(PATH,26).map(([x,z])=>new V(x,max(H(x,z),0)+.6,z)));
 path=K.dashes(curve,80,{long:.09,short:.03,r:.017,mat:vcM('#F7F5F0',{coat:.8,ccr:.2,env:.7,rimK:.35})});vc(path.geometry,'#ffffff');for(let i=0;i<80;i++)path.setColorAt(i,WH);valley.add(path)},
()=>{/* the toy quadcopter, ≈1.1 wide: shell, stripe and dark parts in ONE vertex-coloured mesh */
 const tips=[0,1,2,3].map(i=>{const a=PI/4+i*PI/2;return[cos(a)*.47,-sin(a)*.47]}),
 arms=tips.map((_,i)=>new Cy(.035,.035,.55,8).rotateZ(PI/2).translate(.2,0,0).rotateY(PI/4+i*PI/2));
 body.add(new M(K.merge([vc(K.merge([K.slab(.7,.18,.5,{r:.12}),...arms]),'#F7F5F0'),vc(K.slab(.5,.1,.36,{r:.05}).translate(0,.07,0),'#FF8F6B'),
  vc(K.merge([...tips.map(([x,z])=>new Cy(.07,.07,.08,14).translate(x,.03,z)),...[-1,1].map(s=>new T.CapsuleGeometry(.02,.5,3,8).rotateZ(PI/2).translate(0,-.2,s*.17)),
   ...[[-1,-1],[1,-1],[-1,1],[1,1]].map(([a,b])=>new Cy(.012,.012,.14,6).translate(a*.15,-.13,b*.15))]),'#2B2B33')]),vcs({rough:.45,coat:.7,ccr:.2,env:.7})));
 /* props and nav lights: instanced on the trees' program (instance colours). The blur discs are one static mesh on the shared soft-blob texture. */
 const bl=b=>K.slab(.19,.012,.055,{r:.006}).rotateX(b*.14).translate(b*.1,0,0),sh=K.blob(1.3,1,.28,'#3A2F1E');props=new IM(vc(K.merge([bl(1),bl(-1)]),'#ffffff'),vcM('#3A3A44',{coat:.4,rimK:.35}),4);for(let i=0;i<4;i++)props.setColorAt(i,WH);
 discs=new M(K.merge(tips.map(([x,z])=>new T.CircleGeometry(.23,32).rotateX(-PI/2).translate(x,.095,z))),new MB({color:'#fff',map:sh.material.map,transparent:true,depthWrite:false,toneMapped:false,opacity:0}));
 lights=new IM(vc(new Sp(.028,10,8),'#ffffff'),vcM('#ffffff',{rough:.25,coat:1,ccr:.06,rimK:0,wrap:1.15,env:.3}),3);['#FF3B30','#33D17A','#FFFFFF'].forEach((h,i)=>lights.setColorAt(i,new C(h)));
 gim.position.set(.3,-.12,0);gim.add(new M(K.merge([vc(new T.TorusGeometry(.1,.016,8,20,PI).rotateX(PI/2).rotateZ(PI/2),'#3A2BE0'),vc(K.merge([new Sp(.09,20,14),new Cy(.05,.05,.04,16).rotateZ(PI/2).translate(.085,0,0)]),'#1B1B22')]),vcs({rough:.25,coat:1,ccr:.06,rimK:.2,env:1.1})));
 props.userData.t=tips;body.add(props,discs,lights,gim);dr.scale.setScalar(.95);root.add(sh);dr.userData.sh=sh}
]);
const ray=new T.Raycaster(),pl=new T.Plane(new V(0,1,0),0),hit=new V();
/* HUD: the horizon and the compass tape get their transform directly (same values as drone.css' --roll / --yaw rules),
   each only when its own value changes; no custom property on .drone-hud, so the HUD subtree is never restyled per frame */
const hzn=hud&&hud.querySelector('.hud-horizon'),tape=hud&&hud.querySelector('.hud-tape'),hk=[];
function hudSet(p,roll,yaw){if(!hud)return;const b=max(1,5-fl(live/20)),R=roll.toFixed(1),Y=yaw.toFixed(2),sv=p>.76;
 if(R!==hk[0]){hk[0]=R;if(hzn)hzn.style.transform='translateX(-50%) rotate('+R+'deg)'}
 if(Y!==hk[1]){hk[1]=Y;if(tape)tape.style.transform='translateX(calc(-50% - '+Y+' * 3.6em))'}
 if(sv!==hk[2]){hk[2]=sv;hud.classList.toggle('is-saved',sv)}
 if(b!==hk[3]){hk[3]=b;hud.dataset.bat=b}}
const w={id:'drone',scene,camera:cam,exposure:1.08,hotspots:[],cursor:'steer',
resize(a,b){cam.aspect=a/b;cam.fov=mob&&a/b<1.2?40:34;cam.updateProjectionMatrix()},
pointer(ev){if(ev.type!=='tap')return;if(mob){ray.setFromCamera({x:ev.nx,y:ev.ny},cam);pl.constant=-pos.y;if(ray.ray.intersectPlane(pl,hit)){tapX=hit.x;tapZ=hit.z;tapT=live}return}
 if(!hud)return;hud.classList.add('is-flash','is-shot');timers.push(setTimeout(()=>hud.classList.remove('is-flash'),80),setTimeout(()=>hud.classList.remove('is-shot'),1400))},
needsFrame:()=>!still,
setQuality(qq){q=qq;if(treeM)treeM.count=qq<3?Math.round(tp.length*.6):tp.length},
update(t,dt,p,inp){const S=!!still,first=!init;init=1;live+=dt;if(p<.02||p>.985)live=0;U.uT.value=t;
 /* 0–.13: the block rises, trees pop west → east, props spin up; .15–.65: the path draws and the drone flies it; .66–.76: soft landing */
 const k0=E.back(cl(p/.13)),f=.5-.5*cos(PI*cl((p-.15)/.5)),land=E.inout(cl((p-.66)/.1)),lift=E.out(cl((p-.08)/.1));
 valley.scale.y=max(.02,k0);valley.position.y=-.5*(1-cl(p/.13));
 /* trees: without sway (still or Q < 3) the matrices are a pure f(p): rewritten only when p or the count changes */
 const still0=S||q<3;if(!still0||p!==tpP||treeM.count!==tpN){tpP=still0?p:-1;tpN=treeM.count;
  tp.forEach(([x,z,s,a,y],i)=>{if(i>=treeM.count)return;const sw=still0?0:sin(t*1.3+x*.7)*.04;pm(treeM,i,x,y,z,sw,a,sw*.6,E.back(cl((p-.03-(x+8)/16*.09)/.05))*s)})}
 path.userData.draw(f);
 /* target: path point (+ lift-off from the village, + landing on the pad) + pointer offset */
 const P0=curve.getPointAt(f),[vx,vz]=VIL,[px,pz]=PAD,pad0=H(px,pz)+.2;
 if(p<.15)P0.set(vx+.1,lerp(H(vx,vz)+.25,P0.y,lift),vz+.35);if(land>0){P0.x=lerp(P0.x,px-.12,land);P0.z=lerp(P0.z,pz-.08,land);P0.y=lerp(P0.y,pad0,land)}
 let tx=0,tz=0;if(!S){if(mob){const a=cl(1-(live-tapT-3)/1.5);if(live-tapT<4.5){tx=(tapX-P0.x)*a;tz=(tapZ-P0.z)*a}}
  else if(inp&&inp.inside){ray.setFromCamera({x:inp.nx,y:inp.ny},cam);pl.constant=-P0.y;if(ray.ray.intersectPlane(pl,hit)){tx=hit.x-P0.x;tz=hit.z-P0.z}}}
 const fly=(1-land)*cl(p/.1);ox=K.damp(ox,cl(tx,-3,3)*fly,2.4,dt);oz=K.damp(oz,cl(tz,-1.5,1.5)*fly,2.4,dt);
 const nz=S?0:fly,bob=(sin(t*2*PI/2.6)*.06+K.noise2(t*.4,1)*.04)*nz,tgt=new V(P0.x+ox+sin(t*.9)*.04*nz,P0.y+bob,P0.z+oz+cos(t*.7)*.04*nz);
 const vx2=(tgt.x-pos.x)*1.3,vz2=(tgt.z-pos.z)*1.1;if(first||S)pos.copy(tgt);else pos.lerp(tgt,1-Math.exp(-6*dt));
 dr.position.copy(pos);const rl=cl(-vx2,-.35,.35),pt=cl(vz2,-.3,.3),yaw=-.35+cl(vz2*1.4,-.4,.4);
 dr.rotation.set(0,yaw,0);body.rotation.set(pt,0,rl);gim.rotation.set(-pt,0,-rl);
 /* props: blades → blur discs above the spin threshold; nav lights; strobe 1 Hz */
 const sp=cl((p-.05)/.08)*(1-land);spin=S?sp:K.damp(spin,sp,3,dt);pang+=dt*(6+spin*55);
 const dOn=cl((spin-.45)/.35);props.userData.t.forEach(([x,z],i)=>{pm(props,i,x,.09,z,0,pang*(i%2?1:-1)+i,0,dOn>.9?0:1);});discs.visible=dOn>.02;discs.material.opacity=dOn*.5;
 [[-.05,.04,-.45],[-.05,.04,.45],[-.37,.06,0]].forEach(([x,y,z],i)=>pm(lights,i,x,y,z,0,0,0,i<2||S||(t%1)<.08));
 const sh=dr.userData.sh,gy=H(pos.x,pos.z),alt=pos.y-gy;sh.position.set(pos.x,max(gy,-.5)+.03,pos.z);sh.material.opacity=.3*cl(1.4-alt*.5)*cl(p/.1);
 /* operator camera: trails the drone with lag */
 const cx=cl(pos.x*(mob?.95:.8),-4.6,4.6);camX=S||first?cx:K.damp(camX,cx,3,dt);cam.position.set(camX,(mob?3.3:2.55)+pos.y*.25,mob?8.3:7.2);mob?look.copy(pos):look.set(lerp(camX,pos.x,.5),pos.y*.7+.05,pos.z*.4-1.1);cam.lookAt(look);
 U.uC.value.set(mob||S?-9:((t*.18)%22)-11,sin(t*.07)*2,mob||S?-9:((t*.13+9)%22)-11,cos(t*.05)*2.2-1);
 hudSet(p,rl*57.3,yaw*-1.27+pos.x*.12)},
dispose(){timers.forEach(clearTimeout);if(hud){hud.classList.remove('is-flash','is-shot','is-saved');hud.removeAttribute('data-bat');hud.removeAttribute('style');for(const e of[hzn,tape])e&&e.style.removeProperty('transform')}}};
return w}
