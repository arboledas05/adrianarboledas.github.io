/* w-map.js (B5): 04 The North Atlantic Table. Paper-relief clay map (tools/map.mjs data), pins = the real .pin
   buttons as hotspots, two open arcs from Barcelona to 'your company?', drop-your-pin third arc. Motion: drawing. */
const{hypot:hy,sin,cos,max,min,abs,round,PI}=Math;
export async function create(T,K,ctx,slot,opt){
const{Vector3:V,Mesh:M,Group:G,Object3D:O,CylinderGeometry:Cy,ConeGeometry:Co,SphereGeometry:Sp,CapsuleGeometry:Ca,InstancedMesh:IM,BufferAttribute:BA,Float32BufferAttribute:FA,BufferGeometry:BG,TubeGeometry:TG,PerspectiveCamera:PC,Scene:SC}=T,mob=!!opt.mobile,still=opt.still,bus=opt.bus||ctx.bus,
cl=(v,a=0,b=1)=>v<a?a:v>b?b:v,ss=(a,b,x)=>{x=cl((x-a)/(b-a));return x*x*(3-2*x)},E=K.ease,
src=ctx.assets&&ctx.assets['assets/data/atlantic.json']||'assets/data/atlantic.json',
D=await(await fetch(new URL(src,document.baseURI))).json(),q=D.q,P=D.pts,[bx,bz]=P.mollet,COS=cos(42*PI/180),
scene=new SC(),cam=new PC(mob?32:26,2.1,.1,80),root=new G(),offs=[],
on=(el,e,f)=>{el.addEventListener(e,f);offs.push(()=>el.removeEventListener(e,f))};
scene.add(root);
K.rig(scene,{hemi:['#F7FBFF','#B9D3E6',.62],key:['#FFF6E6',1.75,[-4,8,5]],rim:['#3A2BE0',.5,[3,4,-8]],fog:['#EAF2F8',1,1e4]});
scene.environment=K.env(['#FFFFFF','#D5E6F5','#2B3D66']);
/* ---- shared shader bits: world position varying, land rise from Barcelona, one drifting cloud shadow */
const U={uRise:{value:0},uCl:{value:new T.Vector2(-9,0)}},
vw=s=>{s.vertexShader='varying vec3 vWp;\n'+s.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\nvWp=(modelMatrix*vec4(transformed,1.)).xyz;');
 s.fragmentShader='varying vec3 vWp;uniform vec2 uCl;\n'+s.fragmentShader;s.uniforms.uCl=U.uCl},
cloud='diffuseColor.rgb*=1.-.07*(1.-smoothstep(0.,1.7,length((vWp.xz-uCl)*vec2(.62,1.))));',
rise=s=>{vw(s);s.uniforms.uRise=U.uRise;s.vertexShader='uniform float uRise;\n'+s.vertexShader.replace('#include <begin_vertex>',
 '#include <begin_vertex>\nfloat rk=1.-smoothstep(uRise-.8,uRise,distance(position.xz,vec2('+bx.toFixed(3)+','+bz.toFixed(3)+')));transformed.y=transformed.y*rk-.07*(1.-rk);');
 s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\n'+cloud)},
hatch=s=>{vw(s);s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\nfloat hz=vWp.z*13.,hf=min(fract(hz),1.-fract(hz)),hw=fwidth(hz);diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.09,.08,.06),.07*(1.-smoothstep(hw*.5,hw*1.5,hf))*step(-.01,vWp.y));\n'+cloud)},
RIM='#1F5E8C',
seaM=K.clay('#9CC5E6',{rim:RIM,rimK:.2,env:.45,key:'clay-sea',patch:hatch}),
capM=K.clay('#F6E6C6',{rim:RIM,rimK:.2,env:.45,key:'clay-land',patch:rise}),sideM=K.clay('#D9BE93',{rim:RIM,rimK:.2,env:.45,key:'clay-land',patch:rise}),
vcM=K.clay('#ffffff',{rim:RIM,env:.5,vertexColors:true,flatShading:true,key:'clay-vc'}),white=K.clay('#FFFFFF',{rim:RIM,env:.5}),
vcs=o=>K.clay('#ffffff',{vertexColors:true,key:'clay-vcs',...o}),WH=new T.Color(1,1,1),
ring=a=>{const o=[];let x=0,y=0;for(let i=0;i<a.length;i+=2){x+=a[i];y+=a[i+1];o.push([x/q,y/q])}return o},
chaikin=r=>{if(r.length<5)return r;const o=[];r.forEach((p,i)=>{const n=r[(i+1)%r.length];o.push([p[0]*.75+n[0]*.25,p[1]*.75+n[1]*.25],[p[0]*.25+n[0]*.75,p[1]*.25+n[1]*.75])});return o},
polys=(mob?D.m:D.d).map(p=>p.map(r=>chaikin(ring(r)))),
inLand=(x,s)=>{let c=false;for(const p of polys)for(const r of p)for(let i=0,j=r.length-1;i<r.length;j=i++)if((r[i][1]>s)!==(r[j][1]>s)&&x<(r[j][0]-r[i][0])*(s-r[i][1])/(r[j][1]-r[i][1])+r[i][0])c=!c;return c},
vc=(g,hex)=>{const c=new T.Color(hex),n=g.attributes.position.count,a=new Float32Array(n*3);for(let i=0;i<n;i++)c.toArray(a,i*3);g.setAttribute('color',new BA(a,3));return g},
pr=(lon,lat)=>[(lon+43.5)*COS*D.k,-(lat-43)*D.k],rnd=K.rng(11),mtx=new O(),pm=(im,i,x,y,z,rx,ry,rz,k,sx=k,sy=k,sz=k)=>{mtx.position.set(x,y,z);mtx.rotation.set(rx,ry,rz);mtx.scale.set(max(1e-3,sx),max(1e-3,sy),max(1e-3,sz));mtx.updateMatrix();im.setMatrixAt(i,mtx.matrix);im.instanceMatrix.needsUpdate=true};
let land,wl,waves,pines,mts,mtsAt=[],pins,pinM,pinB,pinI,arcs,beads,ghost;
/* ---- build in idle chunks (≤40 ms each) */
await K.idleChunks([
()=>{const b=new M(K.slab(10.2,.3,5.2,{r:.4,bevel:.1}),seaM);b.position.y=-.15;const lp=K.lip(10.2,5.2,.4,.035,vcs({coat:.6}));vc(lp.geometry,'#3A2BE0');lp.visible=!mob;/* phones crop the board: the slot card frames it, not two stray indigo rules */const sh=K.blob(11.6,6.6,.18,'#2B3D66');sh.position.y=-.31;root.add(b,lp,sh)},
function*(){const shapes=polys.map(p=>{const s=new T.Shape(p[0].map(v=>new T.Vector2(v[0],v[1])));for(const h of p.slice(1))s.holes.push(new T.Path(h.map(v=>new T.Vector2(v[0],v[1]))));return s});
 /* extruded in batches of 12 shapes, one idle slice each (all 48 at once: ~50 ms at 4x CPU); a shape's triangles never depend on
    the others, so the merged data below is the same as one ExtrudeGeometry of them all */
 const gs=[];for(let i=0;i<shapes.length;i+=12){const q=new T.ExtrudeGeometry(shapes.slice(i,i+12),{depth:.1,bevelEnabled:false,curveSegments:1});q.rotateX(-PI/2);gs.push(q);yield}
 /* ExtrudeGeometry makes a cap group and a side group PER shape (48 polygons → 96 draws): regroup the non-indexed data into 2 groups → 2 draws */
 const by=[[],[]],g=new BG();gs.forEach(q=>q.groups.forEach(x=>by[x.materialIndex].push([q,x])));
 for(const k in gs[0].attributes){const n=gs[0].attributes[k].itemSize,o=new Float32Array(gs.reduce((s,q)=>s+q.attributes[k].array.length,0));let off=0;for(const b of by)for(const[q,x]of b){o.set(q.attributes[k].array.subarray(x.start*n,(x.start+x.count)*n),off);off+=x.count*n}g.setAttribute(k,new BA(o,n))}
 const c0=by[0].reduce((s,x)=>s+x[1].count,0);g.addGroup(0,c0,0);g.addGroup(c0,g.attributes.position.count-c0,1);gs.forEach(q=>q.dispose());
 land=new M(g,[capM,sideM]);root.add(land)},
()=>{/* water-lining (offset along the ring normals) + 10° graticule (faint, solid) + neatline: ONE LineSegments, RGBA vertex colours, fading in with the land */
 const a=[],c=[],col=(hex,al)=>{const k=new T.Color(hex);while(c.length<a.length/3*4)c.push(k.r,k.g,k.b,al)};
 (mob?[.045]:[.03,.072]).forEach((o,k)=>{for(const p of polys)for(const r of p){const n=r.length,pt=i=>{const A=r[(i+n-1)%n],B=r[i],C=r[(i+1)%n],dx=C[0]-A[0],dy=C[1]-A[1],l=hy(dx,dy)||1;return[B[0]+dy/l*o,B[1]-dx/l*o]};
  for(let i=0;i<n;i++){const u=pt(i),w=pt((i+1)%n);a.push(u[0],.004,-u[1],w[0],.004,-w[1])}}col('#7FA9C6',k?.25:.5)});
 const[x0,s0,x1,s1]=D.land,seg=(ax,az,bx2,bz2)=>a.push(ax,.006,az,bx2,.006,bz2);
 for(let lon=-130;lon<=40;lon+=10){const x=pr(lon,0)[0];seg(x,-s0,x,-s1)}for(let lat=20;lat<=70;lat+=10){const z=pr(0,lat)[1];seg(x0,z,x1,z)}col('#9CB5C9',.2);
 [[x0,-s0,x1,-s0],[x1,-s0,x1,-s1],[x1,-s1,x0,-s1],[x0,-s1,x0,-s0]].forEach(e=>a.push(e[0],.006,e[1],e[2],.006,e[3]));col('#7FA9C6',.4);
 const g=new BG();g.setAttribute('position',new FA(a,3));g.setAttribute('color',new FA(c,4));wl=new T.LineSegments(g,new T.LineBasicMaterial({vertexColors:true,transparent:true,opacity:0,depthWrite:false}));root.add(wl)},
()=>{/* waves: engraved '∿' marks on a jittered grid over open sea (one instanced draw); pines (16, Canadian boreal + Rockies: Europe stays clear for the arc and its label) and four mountain lumps; decorative counts drop at Q2 */
 const w=[],sea=(x,z)=>![[0,0],[.3,0],[-.3,0],[0,.2],[0,-.2]].some(([a,b])=>inLand(x+a,-z-b)),far=(x,z)=>[P.mollet,P.ireland,P.texas,P.eu,P.am].every(([a,b])=>hy(x-a,z-b)>.55),GX=mob?6:9,GZ=mob?4:5;
 for(let i=0;i<GX;i++)for(let j=0;j<GZ;j++)for(let g=0;g<6;g++){const x=-4.5+(i+.5+(rnd()-.5)*.8)*9/GX,z=-2+(j+.5+(rnd()-.5)*.7)*4/GZ;if(sea(x,z)&&far(x,z)){w.push([x,z,rnd()*6.3]);break}}
 const sq=[];for(let i=0;i<=12;i++){const u=i/12;sq.push(new V((u-.5)*.36,0,sin(u*PI*3)*.034))}
 waves=new IM(new TG(new T.CatmullRomCurve3(sq),36,.013,5).scale(1,.55,1),white,w.length);waves.userData.w=w;waves.userData.n=w.length;root.add(waves);
 if(mob)return;
 const pine=K.merge([vc(new Co(.06,.17,6).translate(0,.13,0),'#5E8A52'),vc(new Cy(.015,.015,.06,5).translate(0,.03,0),'#8A5A3B')]),pp=[];
 for(let g=0;pp.length<16&&g<2e3;g++){const c=g%2?[[-95,-72],[48,57]]:[[-126,-112],[50,59]],lon=c[0][0]+rnd()*(c[0][1]-c[0][0]),lat=c[1][0]+rnd()*(c[1][1]-c[1][0]),[x,z]=pr(lon,lat);if(inLand(x,-z)&&[P.mollet,P.eu,P.am].every(([a,b])=>hy(x-a,z-b)>.8))pp.push([x,z])}
 pines=new IM(pine,vcM,pp.length);for(let i=0;i<pp.length;i++)pines.setColorAt(i,WH);pines.userData.p=pp;root.add(pines);
 const ico=K.merge([[0,1,1],[.55,.72,.8],[-.5,.6,.7]].map(([x,h,r])=>new Co(r*.5,h,5).translate(x,h/2,(x*7%3-1)*.12))).toNonIndexed(),pa=ico.attributes.position,ca=[];for(let i=0;i<pa.count;i++){const c=new T.Color(pa.getY(i)>.62?'#FFFFFF':'#E6D3AE');ca.push(c.r,c.g,c.b)}
 ico.setAttribute('color',new FA(ca,3));
 mtsAt=[[9,46.3,.34,.2],[.5,42.7,.28,.12],[-108,41,.2,.5],[-80,38,.13,.36]].map(([lo,la,w2,d2])=>[...pr(lo,la),w2,d2]);mts=new IM(ico,vcM,4);for(let i=0;i<4;i++)mts.setColorAt(i,WH);root.add(mts)},
()=>{/* pins: head + cone (tip down) + prop, all three in ONE vertex-coloured mesh (1 draw); update() moves each pin's vertices
   (drop, hover hop, the chimney puff). The groups only carry the transforms and the hotspot anchors. */
 const pg=hex=>K.merge([vc(new Sp(.11,24,14).translate(0,.31,0),hex),vc(new Co(.04,.22,14).rotateX(PI).translate(0,.11,0),hex)]),
 house=K.merge([vc(K.slab(.12,.1,.12,{r:.02}).translate(0,.05,0),'#F6EEDC'),vc(new Co(.11,.08,4).rotateY(PI/4).translate(0,.14,0),'#E0784F'),vc(K.slab(.025,.06,.025,{r:.006}).translate(.03,.15,.02),'#F6EEDC')]).translate(.2,0,.06),
 cloud=vc(K.merge([new Sp(.07,14,10).translate(-.06,0,0),new Sp(.09,14,10).translate(.03,.03,0),new Sp(.06,14,10).translate(.11,-.01,0)]),'#FFFFFF').translate(.22,.45,0),
 card=K.merge([vc(K.slab(.22,.14,.02,{r:.025}),'#FFFFFF'),vc(K.slab(.2,.025,.024,{r:.01}).translate(0,.045,0),'#FFCCA3'),vc(K.slab(.12,.015,.024,{r:.007}).translate(-.03,0,0),'#C9C1B2')]).rotateY(.3).translate(-.24,.2,.04),
 parts=[[pg('#3A2BE0'),house],[pg('#6E9DF5'),cloud],[pg('#FFAE73'),card],[vc(new Sp(.035,12,8),'#FFFFFF')]].map(K.merge),g=K.merge(parts),pa=g.attributes.position;
 pinB=pa.array.slice();pinI=new Uint8Array(pa.count);let o=0;parts.forEach((p,i)=>pinI.fill(i,o,o+=p.attributes.position.count));pa.setUsage(T.DynamicDrawUsage);
 pinM=new M(g,vcs({coat:.6,env:.6,rim:'#3A2BE0',rimK:.4}));pinM.frustumCulled=false;root.add(pinM);
 pins=['mollet','ireland','texas'].map(id=>{const g=new G(),[x,z]=P[id];g.position.set(x,.1,z);g.userData.a=new O();g.userData.a.position.y=.31;g.add(g.userData.a);root.add(g);return g})},
()=>{/* arcs, shadows, open tips: bead + ghost ring + drop line */
 arcs=[mkArc(P.eu),mkArc(P.am)];beads=new IM(new Sp(.07,20,12),K.lacquer('#3A2BE0'),3);ghost=new IM(new Ca(.011,.05,2,6),K.clay('#8F86F0',{coat:.4}),72);root.add(beads,ghost)}
]);
let drop=null,dropT=0,hint=slot.querySelector('.map-hint'),hopT=[-9,-9,-9],dragY=0,dragX=0,lastDrag=-9,T0=0;
function mkArc(to,apex,mat){const a=new V(bx,.42,bz),b=new V(to[0],.1,to[1]),d=b.clone().sub(a),L=d.length(),H=(apex||min(2,.3+.45*L))/.75,f=.3-.15*ss(1,2.5,L),
 c=new T.CubicBezierCurve3(a,a.clone().addScaledVector(d,f).setY(.42+H),b.clone().addScaledVector(d,-f).setY(.1+H),b),geo=new TG(c,mob?90:140,.024,8),
 m=mat||K.dashMat('#3A2BE0',{rep:round(L*8+8),speed:.6}),s=K.dashMat('#9C7A55',{duty:1,opacity:.16});s.uniforms.uDraw=m.uniforms.uDraw;s.uniforms.uTime=m.uniforms.uTime;
 const mesh=new M(geo,m),sh=new M(geo,s);sh.scale.y=.012;sh.position.y=.006;mesh.renderOrder=sh.renderOrder=2;root.add(mesh,sh);
 const tip=c.getPointAt(.75),an=new O();an.position.copy(tip);an.position.y+=.13;root.add(an);return{mesh,sh,m,tip,gnd:b,an,draw:0}}
const lerp=(a,b,t)=>a+(b-a)*t,els=[...slot.querySelectorAll('.pin')],tips={};slot.querySelectorAll('.map-tip').forEach(e=>tips[e.dataset.tip]=e);
const pinEl=['mollet','ireland','texas'].map(id=>els.find(e=>e.dataset.pin===id));
pinEl.forEach((e,i)=>{if(!e)return;const h=()=>{hopT[i]=T0};on(e,'pointerenter',h);on(e,'focus',h)});
const hotspots=pins.map((g,i)=>({el:pinEl[i],anchor:g.userData.a})).filter(h=>h.el);
/* tip labels ride on their own anchors, clamped inside the slot's inner margin while the true tip is on screen */
const dropAn=new O(),tA=[new O(),new O(),dropAn],TV=new V(),lw={};let SW=1,SH=1;root.add(...tA);
/* per-frame scratch (no allocation in update): the three arcs (eu, am, the dropped one), their ids, tip visibility, a zero vector */
const AR=[arcs[0],arcs[1],null],IDS=['eu','am','drop'],TO=[0,0,0],Z0=new V();let mR=-1,bz0=0;
if(tips.eu)hotspots.push({el:tips.eu,anchor:tA[0]});if(tips.am)hotspots.push({el:tips.am,anchor:tA[1]});if(tips.drop)hotspots.push({el:tips.drop,anchor:dropAn});
function clearDrop(){if(!drop)return;root.remove(drop.mesh,drop.sh,drop.an);drop.mesh.geometry.dispose();drop.m.dispose();drop.sh.material.dispose();drop=null;if(tips.drop)tips.drop.hidden=true}
function dropAt(nx,ny){const o=cam.position,v=new V(nx,ny,.5).unproject(cam).sub(o).normalize(),y0=root.position.y+.1;if(v.y>-1e-3)return;const t=(y0-o.y)/v.y,x=o.x+v.x*t,z=o.z+v.z*t;
 if(abs(x)>4.9||abs(z)>2.4||hy(x-bx,z-bz)<.5)return;clearDrop();drop=mkArc([x,z]);dropT=T0;dropAn.position.copy(drop.an.position);
 if(tips.drop)tips.drop.hidden=false;if(hint)hint.hidden=true;try{bus.emit('map:drop',{lon:+(x/(COS*D.k)-43.5).toFixed(1),lat:+(43-z/D.k).toFixed(1)})}catch(e){}}
const w={id:'map',scene,camera:cam,exposure:1.02,hotspots,cursor:'drop',
resize(a,b){SW=a;SH=b;for(const k in lw)delete lw[k];cam.aspect=a/b;cam.updateProjectionMatrix()},
pointer(ev){if(ev.type==='drag'&&!mob){dragY=cl(dragY+ev.dx*.12,-18,18);dragX=cl(dragX+ev.dy*.1,-8,17);lastDrag=T0;w.cursor='drag'}
 else if(ev.type==='tap')dropAt(ev.nx,ev.ny);else if(ev.type==='up'||ev.type==='leave')w.cursor='drop'},
needsFrame:()=>!still,
setQuality(qq){if(waves)waves.count=qq<3?round(waves.userData.n*.6):waves.userData.n},
update(t,dt,p,inp){T0=t;AR[2]=drop;
 /* slot p (.5 = centred): 0–.26 board slides up, camera 75°→43°, land rises outward from Barcelona */
 const a=E.out(ss(0,.26,p)),r=ss(.03,.28,p);root.position.y=-.7*(1-a);U.uRise.value=r*8.6;
 wl.material.opacity=r;
 /* camera: orbit + drag spring. Phones, three beats while the slot is fully on screen: Europe close-up → pan along the arc
    to the Americas (.31–.42) → pull back over the crossing (.43–.52): Texas, both arcs, Ireland and Mollet end in one frame */
 const back=still?1:cl((t-lastDrag-3)/1.2);if(back>0){dragY*=1-back*.08;dragX*=1-back*.08}
 const bk=mob?E.inout(ss(.43,.52,p)):0,el=lerp(75,mob?lerp(54,64,bk):43,a)+dragX,push=1-.05*E.inout(ss(.58,.8,p));
 const tf=Math.tan(Math.atan(Math.tan(cam.fov*PI/360)*cam.aspect)),dist=mob?lerp(2.5,3.75,bk)/tf:max(8,6.2/tf)*push;
 const tx=mob?lerp(lerp(2.4,-1.9,E.inout(ss(.31,.42,p))),.5,bk):0,tz=mob?lerp(.45,.1,bk):.18,er=el*PI/180,ar=dragY*PI/180;
 cam.position.set(tx+sin(ar)*cos(er)*dist,sin(er)*dist,tz+cos(ar)*cos(er)*dist);cam.lookAt(tx,0,tz);cam.updateMatrixWorld();
 const S=[],mg=SW*.08,hiX=id=>max(mg,SW-1.5*mg-lw[id]-12);
 AR.forEach((A,i)=>{const id=IDS[i],e=tips[id];if(!A||!e)return;const v=TV.copy(A.an.position).add(root.position).project(cam);let x=(v.x+1)/2*SW,y=(1-v.y)/2*SH;
  if(v.z<1&&x>0&&y>0&&x<SW&&y<SH){if(!lw[id])lw[id]=e.offsetWidth||130;if(!lw.h)lw.h=e.offsetHeight||26;if(mob&&i<2)y-=lw.h*1.3;S[i]={id,x:cl(x,mg,hiX(id)),y:cl(y,mg+lw.h*1.3,SH-mg),z:v.z}}else tA[i].position.copy(A.an.position)});
 /* the two open-arc labels must never touch (long CA strings on 360–390 px phones): split the overlap sideways inside the margins, stack them if there is no room */
 if(S[0]&&S[1]&&abs(S[0].y-S[1].y)<lw.h*1.15){const[L,R]=S[1].x<=S[0].x?[S[1],S[0]]:[S[0],S[1]];let ov=L.x+lw[L.id]+14-R.x;
  if(ov>0){let s=min(ov/2,L.x-mg);L.x-=s;ov-=s;s=max(0,min(ov,hiX(R.id)-R.x));R.x+=s;ov-=s;s=max(0,min(ov,L.x-mg));L.x-=s;ov-=s;if(ov>0)R.y=min(SH-mg,max(R.y,L.y)+lw.h*1.25)}}
 S.forEach((s,i)=>{if(s)tA[i].position.copy(TV.set(s.x/SW*2-1,1-s.y/SH*2,s.z).unproject(cam).sub(root.position))});
 /* .25–.33: pins drop in Mollet → Ireland → Texas (back-out, staggered) + hover hops */
 pins.forEach((g,i)=>{const k=ss(.25+i*.014,.29+i*.014,p),hp=still?0:cl((t-hopT[i])/.5),hj=hp<1?sin(hp*PI)*.12:0;g.visible=k>.001;g.scale.setScalar(max(.001,E.back(k)));g.position.y=.1+(1-k)*.9+hj;
  const e=pinEl[i];if(e){const o=k>.6||e===document.activeElement?'':'0';if(e.style.opacity!==o)e.style.opacity=o}});
 /* the pins' vertices: pin i = its group's position + scale; the chimney puff (part 3) puffs and rises above the Mollet house */
 const ph=still?0:(t%6)/6,ps=.2+(ph<.18?sin(ph/.18*PI):0),py=.25+ph*.3,tr=pins.map(g=>[g.position.x,g.position.y,g.position.z,g.scale.x]),A=pinM.geometry.attributes.position,o=A.array;
 for(let i=0,n=pinI.length;i<n;i++){const k=pinI[i],b=i*3,u=tr[k>2?0:k];let x=pinB[b],y=pinB[b+1],z=pinB[b+2];if(k==3){x=.43+x*ps;y=py+y*ps;z=.14+z*ps}o[b]=u[0]+x*u[3];o[b+1]=u[1]+y*u[3];o[b+2]=u[2]+z*u[3]}A.needsUpdate=true;
 /* arcs: Europe .3–.44, Atlantic .35–.5 (phones a beat earlier, under the camera pan), both stop open at 75 %; dashes march */
 const dr=mob?[E.inout(ss(.28,.4,p)),E.inout(ss(.34,.47,p))]:[E.inout(ss(.3,.44,p)),E.inout(ss(.35,.5,p))];if(drop)drop.draw=still?.75:.75*E.out(cl((t-dropT)/.9));
 AR.forEach((A,i)=>{if(!A)return;const d=i<2?dr[i]*.75:A.draw;A.m.uniforms.uDraw.value=d;A.m.uniforms.uTime.value=t;A.mesh.visible=A.sh.visible=d>.002});
 AR.forEach((A,i)=>TO[i]=A?ss(.68,.75,A===drop?A.draw:A.m.uniforms.uDraw.value):0);
 IDS.forEach((id,i)=>{const e=tips[id];if(!e)return;const o=TO[i]>.5?'1':'0';if(e.style.opacity!==o)e.style.opacity=o});
 /* beads bob on the tips; ghost rings turn; drop lines hang to the target */
 /* (all three tips closed and already written closed: the 75 instances stay as they are) */
 const tc=!(TO[0]||TO[1]||TO[2]);if(!tc||!bz0){bz0=tc;
 let gi=0;AR.forEach((A,i)=>{const k=A?TO[i]:0,b=still?0:sin(t*2*PI/2.2+i)*.05,T=A?A.tip:Z0;pm(beads,i,T.x,T.y+b,T.z,0,0,0,k);
  for(let j=0;j<24;j++){const an=j/16*PI*2+(still?0:t*.25);if(j<16)pm(ghost,gi++,T.x+cos(an)*.22,T.y+b,T.z+sin(an)*.22,PI/2,0,-an,k);else pm(ghost,gi++,T.x,lerp(T.y-.14,(A?A.gnd.y:0)+.03,(j-15.5)/8),T.z,0,0,0,k)}})}
 /* idle: waves bob, pines settle, mountains rise with the land, one cloud shadow passes */
 const ws=ss(.02,.2,p);waves.userData.w.forEach(([x,z,ph],i)=>{if(i<waves.count){const bb=still?0:sin(t*1.2+ph);pm(waves,i,x+bb*.03,.012+bb*.008,z,0,(ph-3)*.05,0,ws)}});
 /* pines and mountains are a pure f(r): rewritten only when r changes */
 if(r!==mR){mR=r;const rk=(x,z)=>1-ss(r*8.6-.8,r*8.6,hy(x-bx,z-bz));
 if(pines)pines.userData.p.forEach(([x,z],i)=>{const k=rk(x,z);pm(pines,i,x,.1*k,z,0,i,0,k)});
 if(mts)mtsAt.forEach(([x,z,w2,d2],i)=>{const k=rk(x,z);pm(mts,i,x,.1*k-.01,z,0,i>1?PI/2:.3,0,0,w2,.2*k,d2)})}
 U.uCl.value.set(still?-1:((t*.22)%16)-8,still?.6:sin(t*.05)*.8);
 if(!still&&(p<.02||p>.985))clearDrop()},
dispose(){offs.splice(0).forEach(f=>f());clearDrop();pinEl.forEach(e=>e&&(e.style.opacity=''));Object.values(tips).forEach(e=>e.style.opacity='');if(tips.drop)tips.drop.hidden=true;if(hint)hint.hidden=false}};
return w}
