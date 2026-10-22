// V11 — Dot 3D : orbe futuriste animé (shader : surface vivante déformée par du bruit, halo de Fresnel, particules en orbite).
// Une scène three.js par Dot ; si WebGL est indisponible, on garde la sphère CSS (aucune erreur).
import * as THREE from "./vendor/three.module.js";

const VERT = `
uniform float uT, uAmp, uSpd, uDamp; varying vec3 vN, vP; varying float vD;
vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;} vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 perm(vec4 x){return mod289(((x*34.)+1.)*x);} vec4 tis(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
 vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
 i=mod289(i);vec4 p=perm(perm(perm(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
 float n_=.142857142857;vec3 ns=n_*D.wyz-D.xzx;vec4 j=p-49.*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);
 vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.-abs(x)-abs(y);vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
 vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;vec4 sh=-step(h,vec4(0.));vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
 vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
 vec4 nm=tis(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));p0*=nm.x;p1*=nm.y;p2*=nm.z;p3*=nm.w;
 vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);m=m*m;return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));}
void main(){ float n=snoise(normal*1.6+vec3(0.,uT*uSpd,uT*uSpd*.6)); float n2=snoise(normal*3.4-vec3(uT*uSpd*1.3)); vD=n*.7+n2*.3;
 float fr=smoothstep(.15,.7,normal.z); vec3 pos=position+normal*vD*uAmp*(1.-fr*uDamp); vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(pos,1.); vP=-mv.xyz; gl_Position=projectionMatrix*mv; }`;
const FRAG = `
uniform vec3 uC; uniform float uT, uGlow; varying vec3 vN, vP; varying float vD;
void main(){ vec3 N=normalize(vN), V=normalize(vP); float f=pow(1.-max(dot(N,V),0.),2.2);
 vec3 core=mix(uC*.35,uC,.5+vD*.9); vec3 hi=mix(uC,vec3(1.),.65);
 float spec=pow(max(dot(reflect(-V,N),normalize(vec3(-.5,.7,.6))),0.),24.);
 float band=.5+.5*sin(vD*9.+uT*1.7);
 vec3 col=core+hi*f*(.9+uGlow*.8)+hi*spec*.8+uC*band*.18;
 gl_FragColor=vec4(col,1.); }`;


// V16 — visage : yeux qui suivent le pointeur et clignent, sourcils, bouche, joues, lunettes ; expression selon la phase et l'humeur.
const ptr = { x: 0, y: 0 }; let ptrBound = false;
function bindPointer() { if (ptrBound) return; ptrBound = true; try { addEventListener("pointermove", (e) => { ptr.x = e.clientX; ptr.y = e.clientY; }, { passive: true }); } catch {} }
const mb = (c, o = 1, extra = {}) => new THREE.MeshBasicMaterial({ color: c, transparent: o < 1, opacity: o, depthWrite: false, ...extra });
function surf(x, y, lift = .035) { return Math.sqrt(Math.max(.05, 1 - x * x - y * y)) + lift; }
function buildFace(fp) {
  const g = new THREE.Group(), eyeS = fp.eye || 1, ex = .34, ey = .14;
  const white = mb(0xffffff), dark = mb(0x14110f), P = {};
  const eyes = [];
  for (const side of [-1, 1]) {
    const eg = new THREE.Group(); eg.position.set(side * ex, ey, surf(side * ex, ey)); eg.scale.setScalar(eyeS);
    const w = new THREE.Mesh(new THREE.CircleGeometry(.155, 28), white), pu = new THREE.Mesh(new THREE.CircleGeometry(.082, 20), dark), hl = new THREE.Mesh(new THREE.CircleGeometry(.025, 10), white);
    pu.position.z = .004; hl.position.set(.03, .03, .008); const pg = new THREE.Group(); pg.add(pu, hl); pg.position.z = .003; eg.add(w, pg);
    const happy = new THREE.Mesh(new THREE.TorusGeometry(.1, .026, 8, 20, Math.PI), dark); happy.position.y = -.03; happy.visible = false; eg.add(happy);
    const lidTop = new THREE.Mesh(new THREE.CircleGeometry(.17, 24, 0, Math.PI), mb(0x000000, 1)); lidTop.position.z = .012; lidTop.visible = false;   // paupière (couleur recalculée par l'humeur)
    eg.add(lidTop); g.add(eg); eyes.push({ eg, w, pg, happy, lidTop, side });
    const br = new THREE.Mesh(new THREE.BoxGeometry(.2, .036, .01), dark); br.position.set(side * ex, ey + .22 * Math.min(eyeS, 1.2), surf(side * ex, ey + .22) + .01); g.add(br); eyes[eyes.length - 1].brow = br;
    const ch = new THREE.Mesh(new THREE.CircleGeometry(.1, 20), mb(0xff6f8a, .32)); ch.position.set(side * (ex + .13), -.1, surf(side * (ex + .13), -.1) - .005); g.add(ch);
    if (fp.glasses) { const r = new THREE.Mesh(new THREE.TorusGeometry(.2 * Math.min(eyeS, 1.1), .02, 8, 32), mb(0x2b2622)); r.position.set(side * ex, ey, surf(side * ex, ey) + .02); g.add(r); }
  }
  if (fp.glasses) { const b = new THREE.Mesh(new THREE.BoxGeometry(.16, .02, .01), mb(0x2b2622)); b.position.set(0, ey + .03, surf(0, ey) + .02); g.add(b); }
  const mouth = new THREE.Group(); mouth.position.set(0, -.3, surf(0, -.3)); g.add(mouth);
  const smileArc = new THREE.Mesh(new THREE.TorusGeometry(.17, .026, 8, 24, Math.PI), dark); smileArc.rotation.z = Math.PI; mouth.add(smileArc);   // arc ∪ quand scale.y > 0
  const openM = new THREE.Mesh(new THREE.CircleGeometry(.17, 24, Math.PI, Math.PI), mb(0x3a0d0d)); openM.position.y = .02; openM.visible = false; mouth.add(openM);   // demi-disque (grand sourire)
  const oM = new THREE.Mesh(new THREE.CircleGeometry(.075, 18), mb(0x3a0d0d)); oM.visible = false; mouth.add(oM);
  const sweat = new THREE.Mesh(new THREE.CircleGeometry(.05, 12), mb(0x7fd4ff, .9)); sweat.position.set(.62, .3, surf(.62, .3) - .12); sweat.visible = false; g.add(sweat);
  Object.assign(P, { g, eyes, mouth, smileArc, openM, oM, sweat, lidCol: null });
  return P;
}

let supported = null;
export function webglOK() {
  if (supported !== null) return supported;
  try { const c = document.createElement("canvas"); supported = !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { supported = false; }
  return supported;
}

const PHASE = { idle: { amp: .13, spd: .45, glow: .35, spin: .3 }, listening: { amp: .16, spd: .7, glow: .6, spin: .5 }, speaking: { amp: .2, spd: 1.1, glow: .9, spin: .7 }, working: { amp: .34, spd: 1.9, glow: .6, spin: 2.4 }, ready: { amp: .22, spd: .9, glow: 1, spin: .9 }, waiting: { amp: .10, spd: .35, glow: .15, spin: .3 }, open: { amp: .1, spd: .3, glow: 0, spin: .2 } };
const live = new Set(); let raf = 0, t0 = performance.now();


const lerp = (a, b, k) => a + (b - a) * k;
function targetOf(o, t) {
  const fp = o.fp, md = o.mood, ph = o.phase, B = fp.smile ?? .3;
  let T = { smile: B, open: 0, o: 0, lid: 1, happy: 0, browTilt: fp.brow || 0, browY: 0, lx: 0, ly: 0, follow: 1, sweat: 0, wob: 0 };
  if (ph === "working") T = { ...T, smile: 0, o: .6, lx: -.55 + Math.sin(t * 1.3) * .2, ly: .45 + Math.sin(t * 1.9) * .1, follow: 0, browTilt: (fp.brow || 0) + .12 };
  else if (ph === "idle") T = { ...T, smile: B + .2, browY: .01 };
  else if (ph === "listening") T = { ...T, smile: B * .6, lid: 1.15, browY: .06, browTilt: (fp.brow || 0) + .05 };
  else if (ph === "speaking") T = { ...T, smile: B + .1, open: Math.min(1, (o.level || 0) * 2.2), browY: .02 };
  else if (ph === "waiting") T = { ...T, smile: Math.max(.1, B * .5), lid: .45, follow: .3, browY: -.02 };
  else if (ph === "open") T = { ...T, smile: B + .15, browY: .03 };
  else T = { ...T, smile: B + .35, browY: .04 };   // ready : content de livrer
  if (md === "dance") T = { ...T, smile: 1, open: 1, happy: 1, browY: .07, follow: 0, lx: 0, ly: 0 };
  if (md === "confused") T = { ...T, smile: -.55, browTilt: -.32, browY: .05, lx: Math.sin(t * 7) * .5, ly: .1, follow: 0, sweat: 1, wob: 1, lid: 1 };
  return T;
}
function driveFace(o, t) {
  const F = o.F, T = targetOf(o, t), c = o.expr, k = .14;
  for (const key of ["smile", "open", "o", "lid", "happy", "browTilt", "browY", "lx", "ly", "sweat", "wob"]) c[key] = lerp(c[key], T[key], k);
  // regard : vers le pointeur (si suivi), sinon cible propre
  let px = 0, py = 0;
  if (T.follow > 0) { const r = o.canvas.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2; const dx = ptr.x - cx, dy = ptr.y - cy, d = Math.hypot(dx, dy) || 1, m = Math.min(1, d / 260); px = dx / d * m; py = -dy / d * m; }
  o.look.x = lerp(o.look.x, T.follow > .5 ? px : T.lx, .12); o.look.y = lerp(o.look.y, T.follow > .5 ? py : T.ly, .12);
  // clignement
  if (t > o.nextBlink) { o.blinkT = t; o.nextBlink = t + 2.2 + Math.random() * 3.6; }
  const bl = t - o.blinkT, blink = bl >= 0 && bl < .16 ? Math.sin(bl / .16 * Math.PI) : 0;
  const open = Math.max(.08, c.lid * (1 - blink * .95));
  const ph = o.cur;
  for (const e of F.eyes) {
    const hp = c.happy > .5;
    e.w.visible = !hp; e.pg.visible = !hp; e.happy.visible = hp;
    e.eg.scale.y = (o.fp.eye || 1) * open; e.pg.position.x = o.look.x * .05; e.pg.position.y = o.look.y * .05 / Math.max(.15, open);
    e.brow.rotation.z = -e.side * (c.browTilt * 1.3) + (c.wob ? Math.sin(t * 9 + e.side) * .05 : 0); e.brow.position.y = .14 + .22 * Math.min(o.fp.eye || 1, 1.2) + c.browY + (c.happy > .5 ? .03 : 0);
  }
  const s = c.smile; F.smileArc.visible = c.open < .3 && c.o < .35; F.smileArc.scale.y = Math.max(.05, Math.abs(s)); F.smileArc.rotation.z = s >= 0 ? Math.PI : 0; F.smileArc.position.y = s >= 0 ? .05 : -.07;
  F.smileArc.rotation.z += c.wob * Math.sin(t * 6) * .09;
  F.openM.visible = c.open > .1; F.openM.scale.y = .2 + c.open * .85 * (c.happy > .5 ? (.8 + .2 * Math.sin(t * 10)) : 1);
  F.oM.visible = c.o > .35; F.oM.scale.setScalar(.8 + c.o * .35 * (1 + .15 * Math.sin(t * 6)));
  F.sweat.visible = c.sweat > .5; F.sweat.position.y = .3 - ((t * .5) % 1) * .12;
  F.g.position.set(o.look.x * .02, o.look.y * .015, 0); F.g.scale.setScalar(1.12); o.mat.uniforms.uAmp.value *= .5;
}

function loop(now) {
  raf = live.size ? requestAnimationFrame(loop) : 0;
  const t = (now - t0) / 1000;
  for (const o of live) {
    if (!o.canvas.isConnected) { o.dispose(); continue; }
    const p = PHASE[o.phase] || PHASE.ready;
    for (const k of ["amp", "spd", "glow", "spin"]) o.cur[k] += (p[k] - o.cur[k]) * .06;   // transitions douces entre phases
    const pulse = o.phase === "ready" ? 1 + Math.sin(t * 4) * .05 : o.phase === "working" ? 1 + Math.sin(t * 7) * .04 : 1;
    o.mat.uniforms.uT.value = t; o.mat.uniforms.uAmp.value = o.cur.amp; o.mat.uniforms.uSpd.value = o.cur.spd; o.mat.uniforms.uGlow.value = o.cur.glow;
    if (o.F) { o.orb.rotation.y = Math.sin(t * .7) * .18; o.orb.rotation.x = Math.sin(t * .5) * .06; o.mat.uniforms.uDamp.value = 1; driveFace(o, t); } else { o.orb.rotation.y = t * .25 * (1 + o.cur.spin); o.orb.rotation.x = Math.sin(t * .5) * .25; } o.orb.scale.setScalar(pulse);
    o.halo.scale.setScalar(1.35 + Math.sin(t * 2.2) * .05 + o.cur.glow * .12); o.halo.material.opacity = .10 + o.cur.glow * .16;
    o.ring.rotation.z = t * .6 * (.4 + o.cur.spin); o.ring.rotation.x = 1.15 + Math.sin(t * .4) * .15;
    o.pts.rotation.y = -t * .5 * (.4 + o.cur.spin); o.pts.rotation.x = .5;
    const md = o.mood;   // humeur : danse (bonne nouvelle) / trouble (urgence)
    o.orb.position.y = md === "dance" ? Math.abs(Math.sin(t * 5.2)) * .38 - .12 : 0;
    o.orb.position.x = md === "confused" ? Math.sin(t * 27) * .06 + Math.sin(t * 9) * .05 : md === "dance" ? Math.sin(t * 2.6) * .22 : 0;
    o.orb.rotation.z = md === "dance" ? Math.sin(t * 5.2) * .35 : md === "confused" ? Math.sin(t * 13) * .12 : 0;
    o.halo.position.copy(o.orb.position); if (md === "confused") o.mat.uniforms.uAmp.value = o.cur.amp + .14 + Math.sin(t * 17) * .05;
    try { if (o.r.getContext().isContextLost()) { o.dispose(); continue; } o.r.render(o.scene, o.cam); } catch { o.dispose(); }   // contexte perdu : on retire l'orbe, la sphère CSS reste
  }
}

/** Monte un orbe 3D dans `host` (élément DOM). Retourne { setPhase, setColor, dispose } ou null si WebGL est absent. */
export function mountDot3D(host, color = "#D93226", size = 132, persona = null, opts = {}) {
  if (!webglOK()) return null;
  let r; try { r = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" }); } catch { return null; }
  r.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); r.setSize(size, size); r.setClearColor(0x000000, 0);
  const canvas = r.domElement; canvas.className = "d3canvas"; host.prepend(canvas);
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(36, 1, .1, 20); cam.position.z = opts.zoom || 4.6;
  const col = new THREE.Color(color);
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { uT: { value: 0 }, uAmp: { value: .2 }, uDamp: { value: 0 }, uSpd: { value: 1 }, uGlow: { value: .5 }, uC: { value: col } } });
  const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 24), mat); scene.add(orb);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 32), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .15, side: THREE.BackSide, depthWrite: false })); scene.add(halo);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.55, .012, 8, 120), new THREE.MeshBasicMaterial({ color: col.clone().lerp(new THREE.Color(1, 1, 1), .5), transparent: true, opacity: .75 })); scene.add(ring);
  const g = new THREE.BufferGeometry(), n = 46, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, b = Math.acos(2 * Math.random() - 1), R = 1.5 + Math.random() * .5; arr.set([R * Math.sin(b) * Math.cos(a), R * Math.sin(b) * Math.sin(a), R * Math.cos(b)], i * 3); }
  g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: col.clone().lerp(new THREE.Color(1, 1, 1), .6), size: .045, transparent: true, opacity: .9, depthWrite: false })); scene.add(pts);
  const fp = persona && persona.face ? persona.face : null; let F = null; if (fp) { try { F = buildFace(fp); orb.add(F.g); bindPointer(); host.classList.add("hasface"); } catch { F = null; } }
  const o = { F, fp, expr: { smile: .3, open: 0, o: 0, lid: 1, happy: 0, browTilt: 0, browY: 0, lx: 0, ly: 0, sweat: 0, wob: 0 }, look: { x: 0, y: 0 }, nextBlink: 1.5, blinkT: -9, r, canvas, scene, cam, orb, halo, ring, pts, mat, phase: "working", cur: { ...PHASE.working },
    mood: "calm", level: 0, setLevel(v) { o.level = v; }, resize(w, hh) { try { r.setSize(w, hh, false); cam.aspect = w / hh; cam.updateProjectionMatrix(); } catch {} }, setPhase(p) { o.phase = p; }, setMood(m) { o.mood = m; if (m === "confused") col.set("#ff8a1f"); else if (m === "dance") col.set("#35e0a1"); if (m !== "calm") { halo.material.color.copy(col); ring.material.color.copy(col).lerp(new THREE.Color(1, 1, 1), .5); } }, setColor(c) { col.set(c); halo.material.color.set(c); },
    dispose() { if (o.gone) return; o.gone = true; live.delete(o); try { r.dispose(); r.forceContextLoss(); canvas.remove(); orb.geometry.dispose(); mat.dispose(); } catch {} } };
  canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); o.dispose(); host.classList.remove("has3d"); });
  live.add(o); host.classList.add("has3d"); if (!raf) raf = requestAnimationFrame(loop);
  return o;
}
