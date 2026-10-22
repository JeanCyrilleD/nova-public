// Panda 3D procédural — aucun fichier externe. États reliés à l'état RÉEL de l'assistant :
// idle · listening (micro ouvert, niveau réel) · thinking (requête en cours) · speaking (niveau audio réel) · tool (outil en cours) · error
import * as THREE from "./vendor/three.module.js";

const STATE_COL = { idle: null, listening: "#4cc9ff", thinking: "#ffb020", tool: "#b48cff", speaking: "#3ddc97", error: "#ff4d5e" };
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createAvatar(host, opts = {}) {
  const W = () => host.clientWidth || 300, H = () => host.clientHeight || 300;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: !!opts.preserve });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(W(), H());
  renderer.shadowMap.enabled = false;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  host.appendChild(renderer.domElement);
  renderer.domElement.style.cssText = "width:100%;height:100%;display:block;touch-action:none";

  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(32, W() / H(), 0.1, 50);
  cam.position.set(0, 0.2, 11.4); cam.lookAt(0, -0.25, 0);

  // --- lumières
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6b6f86, 0.85));
  const key = new THREE.DirectionalLight(0xffffff, 2.1); key.position.set(2.5, 4, 5); scene.add(key);
  const rim = new THREE.DirectionalLight(0x4cc9ff, 2.6); rim.position.set(-4, 2, -3); scene.add(rim);
  const fill = new THREE.PointLight(0xffffff, 8, 14); fill.position.set(0, -1, 4); scene.add(fill);

  const white = new THREE.MeshPhysicalMaterial({ color: 0xf6f4ee, roughness: 0.62, sheen: 1, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xffffff), clearcoat: 0.08 });
  const black = new THREE.MeshPhysicalMaterial({ color: 0x15161b, roughness: 0.55, sheen: 0.6, sheenColor: new THREE.Color(0x6a7090), clearcoat: 0.15 });
  // Liseré lumineux (fresnel) : donne au pelage un contour « holographique » qui prend la couleur de l'état.
  const rimU = { value: new THREE.Color("#4cc9ff") }, rimK = { value: 0.55 };
  for (const m of [white, black]) {
    m.onBeforeCompile = (sh) => {
      sh.uniforms.rimColor = rimU; sh.uniforms.rimK = rimK;
      sh.fragmentShader = "uniform vec3 rimColor; uniform float rimK;\n" + sh.fragmentShader.replace("#include <opaque_fragment>",
        "float rimF = pow(1.0 - saturate(dot(normalize(vNormal), normalize(vViewPosition))), 2.6);\n outgoingLight += rimColor * rimF * rimK;\n#include <opaque_fragment>");
    };
  }
  const eyeW = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.15 });
  const mat = (c, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.4 }, o));
  const S = (g, m, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); return o; };
  const sph = new THREE.SphereGeometry(1, 48, 32);

  const root = new THREE.Group(); scene.add(root);
  const floatG = new THREE.Group(); root.add(floatG);

  // corps
  const body = new THREE.Group(); floatG.add(body);
  body.add(S(sph, white, 0, -1.25, 0, 1.05, 1.1, 0.95));                    // ventre
  body.add(S(sph, white, 0, -1.35, 0.55, 0.72, 0.78, 0.5));                 // plastron
  const armL = new THREE.Group(), armR = new THREE.Group();
  for (const [g, sx] of [[armL, -1], [armR, 1]]) {
    g.position.set(sx * 1.0, -0.75, 0.15); body.add(g);
    g.add(S(new THREE.CapsuleGeometry(0.28, 0.55, 8, 16), black, sx * 0.1, -0.35, 0, 1, 1, 1));
    g.rotation.z = sx * 0.28;
  }
  const legL = S(new THREE.CapsuleGeometry(0.36, 0.3, 8, 16), black, -0.55, -2.2, 0.35); legL.rotation.x = Math.PI / 2.4;
  const legR = S(new THREE.CapsuleGeometry(0.36, 0.3, 8, 16), black, 0.55, -2.2, 0.35); legR.rotation.x = Math.PI / 2.4;
  body.add(legL, legR);

  // tête
  const head = new THREE.Group(); head.position.set(0, 0.35, 0); floatG.add(head);
  head.add(S(sph, white, 0, 0, 0, 1.38, 1.22, 1.2));
  const earL = S(sph, black, -1.02, 0.98, -0.05, 0.42, 0.42, 0.28), earR = S(sph, black, 1.02, 0.98, -0.05, 0.42, 0.42, 0.28);
  const earInL = S(sph, mat(0x4a3b44, { roughness: 0.8 }), -1.02, 0.98, 0.1, 0.22, 0.22, 0.1), earInR = S(sph, mat(0x4a3b44, { roughness: 0.8 }), 1.02, 0.98, 0.1, 0.22, 0.22, 0.1);
  head.add(earL, earR, earInL, earInR);
  const patchL = S(sph, black, -0.52, 0.12, 1.0, 0.34, 0.45, 0.2), patchR = S(sph, black, 0.52, 0.12, 1.0, 0.34, 0.45, 0.2);
  patchL.rotation.z = 0.5; patchR.rotation.z = -0.5; head.add(patchL, patchR);
  // yeux
  const eyes = new THREE.Group(); head.add(eyes);
  const eyeL = new THREE.Group(), eyeR = new THREE.Group();
  eyeL.position.set(-0.5, 0.14, 1.12); eyeR.position.set(0.5, 0.14, 1.12); eyes.add(eyeL, eyeR);
  const pupils = [];
  for (const e of [eyeL, eyeR]) {
    e.add(S(sph, eyeW, 0, 0, 0, 0.17, 0.2, 0.1));
    const p = S(sph, mat(0x0a0a0f, { roughness: 0.2 }), 0, 0, 0.07, 0.1, 0.125, 0.06); e.add(p); pupils.push(p);
    e.add(S(sph, mat(0xffffff, { emissive: 0xffffff, emissiveIntensity: 1 }), 0.035, 0.05, 0.12, 0.03, 0.03, 0.02));
  }
  // nez / bouche / joues
  head.add(S(sph, black, 0, -0.18, 1.2, 0.17, 0.115, 0.1));
  const mouth = S(sph, mat(0x3a0f18, { roughness: 0.6 }), 0, -0.5, 1.12, 0.17, 0.02, 0.06); head.add(mouth);
  const tongue = S(sph, mat(0xe0607a, { roughness: 0.6 }), 0, -0.53, 1.14, 0.1, 0.01, 0.04); head.add(tongue);
  const blush = mat(0xff8aa0, { transparent: true, opacity: 0.0, roughness: 1 });
  head.add(S(sph, blush, -0.85, -0.2, 0.85, 0.2, 0.12, 0.05), S(sph, blush, 0.85, -0.2, 0.85, 0.2, 0.12, 0.05));
  // paupières (clignement) : disques blancs écrasés qui descendent
  const lidMat = white;
  const lidL = S(sph, lidMat, 0, 0.0, 0.0, 0.2, 0.0, 0.13), lidR = S(sph, lidMat, 0, 0.0, 0.0, 0.2, 0.0, 0.13);
  lidL.position.set(0, 0.0, 0.03); lidR.position.set(0, 0.0, 0.03); eyeL.add(lidL); eyeR.add(lidR);

  // accessoires par thème
  const acc = new THREE.Group(); floatG.add(acc);
  function accessory(theme) {
    while (acc.children.length) acc.remove(acc.children[0]);
    const A = (c, e = 0.6) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.35, emissive: c, emissiveIntensity: e });
    if (theme === "nova-imperial") {          // foulard rouge + liseré or
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.98, 0.17, 20, 64), new THREE.MeshStandardMaterial({ color: 0xd93226, roughness: 0.55 }));
      t.position.set(0, -0.62, 0.02); t.rotation.x = Math.PI / 2 + 0.12; t.scale.set(1.08, 1.0, 0.95); acc.add(t);
      const knot = S(sph, new THREE.MeshStandardMaterial({ color: 0xb62419, roughness: 0.5 }), 0.62, -0.75, 0.82, 0.21, 0.26, 0.2); acc.add(knot);
      const tail = S(new THREE.BoxGeometry(0.28, 0.62, 0.06), new THREE.MeshStandardMaterial({ color: 0xd93226, roughness: 0.55 }), 0.7, -1.15, 0.86); tail.rotation.z = 0.2; acc.add(tail);
      const star = S(new THREE.OctahedronGeometry(0.1), A(0xd4af37, 0.5), 0.0, -0.5, 1.18); acc.add(star);
    } else if (theme === "cyber") {            // visière néon
      const v = new THREE.Mesh(new THREE.CylinderGeometry(1.34, 1.34, 0.42, 48, 1, true, -0.95, 1.9), new THREE.MeshStandardMaterial({ color: 0x00e5ff, roughness: 0.1, metalness: 0.5, emissive: 0x00b8d4, emissiveIntensity: 0.9, transparent: true, opacity: 0.42, side: THREE.DoubleSide }));
      v.scale.set(1.04, 1, 0.93); v.position.set(0, 0.16, 0.0); v.rotation.y = Math.PI / 2 * 0; head.add(v); acc.userData.headAdd = v;
      const line = new THREE.Mesh(new THREE.CylinderGeometry(1.345, 1.345, 0.02, 48, 1, true, -0.95, 1.9), new THREE.MeshBasicMaterial({ color: 0xff2bd6, side: THREE.DoubleSide }));
      line.scale.set(1.04, 1, 0.93); line.position.set(0, 0.37, 0); head.add(line); acc.userData.headAdd2 = line;
    } else if (theme === "monolith") {         // col acier
      const c = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.09, 16, 64), new THREE.MeshStandardMaterial({ color: 0xc9ced8, metalness: 1, roughness: 0.25 }));
      c.position.set(0, -0.6, 0.02); c.rotation.x = Math.PI / 2 + 0.12; acc.add(c);
    } else if (theme === "zenith") {           // halo solaire
      const h = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.055, 16, 80), new THREE.MeshStandardMaterial({ color: 0xffd700, emissive: 0xffae00, emissiveIntensity: 1.6, roughness: 0.3 }));
      h.position.set(0, 2.15, -0.1); h.rotation.x = Math.PI / 2 - 0.25; acc.add(h); acc.userData.halo = h;
    }
  }
  const headAddCleanup = () => { for (const k of ["headAdd", "headAdd2"]) { if (acc.userData[k]) { head.remove(acc.userData[k]); acc.userData[k] = null; } } };

  // ombre + anneau holographique + particules
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.7, 48), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28 }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.set(0, -3.2, 0); scene.add(shadow);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x4cc9ff, transparent: true, opacity: 0.7 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.95, 0.018, 8, 120), ringMat); ring.rotation.x = Math.PI / 2; ring.position.set(0, -3.15, 0); scene.add(ring);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.01, 8, 120), ringMat.clone()); ring2.rotation.x = Math.PI / 2; ring2.position.set(0, -3.15, 0); scene.add(ring2);
  const N = 110, pos = new Float32Array(N * 3), seed = [];
  for (let i = 0; i < N; i++) seed.push({ a: Math.random() * 6.28, r: 2.2 + Math.random() * 1.6, y: -2.8 + Math.random() * 5.2, s: 0.2 + Math.random() * 0.6 });
  const pg = new THREE.BufferGeometry(); pg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const pm = new THREE.PointsMaterial({ color: 0x4cc9ff, size: 0.075, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending });
  scene.add(new THREE.Points(pg, pm));
  // ── V10 : aura, anneaux gyroscopiques, cœur d'énergie, socle holographique ──
  const auraTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d"), r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, "rgba(255,255,255,.9)"); r.addColorStop(0.35, "rgba(255,255,255,.28)"); r.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = r; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
  const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: auraTex, color: 0x4cc9ff, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  aura.scale.set(8.4, 8.4, 1); aura.position.set(0, -0.4, -1.8); scene.add(aura);
  const gyro = new THREE.Group(); gyro.position.set(0, -0.5, 0); scene.add(gyro);
  const gyroMats = [], gyroNodes = [];
  [[2.9, 0.012, 0.0, 0.0], [3.25, 0.01, 1.05, 0.5], [3.6, 0.008, -0.8, 1.2]].forEach(([r, w, rx, rz], i) => {
    const m = new THREE.MeshBasicMaterial({ color: 0x4cc9ff, transparent: true, opacity: 0.5 - i * 0.1, depthWrite: false, blending: THREE.AdditiveBlending }); gyroMats.push(m);
    const g = new THREE.Group(); g.rotation.set(rx, 0, rz);
    const ringM = new THREE.Mesh(new THREE.TorusGeometry(r, w, 6, 160), m); g.add(ringM);
    const node = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffffff })); node.position.set(r, 0, 0); ringM.add(node); gyroNodes.push(ringM);
    gyro.add(g);
  });
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.17, 1), new THREE.MeshBasicMaterial({ color: 0x4cc9ff })); core.position.set(0, -1.05, 1.32); floatG.add(core);
  const coreHalo = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.014, 8, 40), new THREE.MeshBasicMaterial({ color: 0x4cc9ff, transparent: true, opacity: 0.8 })); coreHalo.position.copy(core.position); floatG.add(coreHalo);
  const holoU = { t: { value: 0 }, c: { value: new THREE.Color("#4cc9ff") } };
  const holo = new THREE.Mesh(new THREE.CircleGeometry(3.3, 64), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: holoU,
    vertexShader: "varying vec2 v; void main(){ v = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: "varying vec2 v; uniform float t; uniform vec3 c; void main(){ float r = length(v); float rings = smoothstep(.93,1.0,sin(r*7.0 - t*2.2)*.5+.5)*.55; float sweep = smoothstep(.05,.0,abs(fract(atan(v.y,v.x)/6.2832 - t*.18)-.5)-.0)*.0 + smoothstep(.06,.0,fract(atan(v.y,v.x)/6.2832 - t*.18))*.6; float edge = smoothstep(3.3,2.2,r); float a = (rings+sweep+.07)*edge; gl_FragColor = vec4(c*a, a); }" }));
  holo.rotation.x = -Math.PI / 2; holo.position.set(0, -3.18, 0); scene.add(holo);
  // « dots de réflexion » (clin d'œil aux Dots) : trois sphères qui orbitent au-dessus de la tête
  const thinkDots = new THREE.Group(); const tdm = new THREE.MeshBasicMaterial({ color: 0xffb020 });
  for (let i = 0; i < 3; i++) thinkDots.add(S(new THREE.SphereGeometry(0.09, 16, 12), tdm, 0, 0, 0));
  thinkDots.position.set(0, 2.4, 0); floatG.add(thinkDots);

  // --- état animé
  let state = "idle", level = 0, lvlS = 0, theme = null, accent = new THREE.Color("#4cc9ff");
  let target = { x: 0, y: 0 }, look = { x: 0, y: 0 }, blink = 0, nextBlink = 2, t0 = performance.now(), last = t0;
  let wave = 0, nextWave = 14 + Math.random() * 10, hold = 0, earT = 0;
  const api = {
    setState(s) { if (state !== s) { state = s; if (s === "speaking") wave = 0; } },
    setLevel(v) { level = clamp(v, 0, 1); },
    setTheme(id, accentHex) { if (theme !== id) { headAddCleanup(); accessory(id); theme = id; } if (accentHex) { accent = new THREE.Color(accentHex); } },
    lookAt(nx, ny) { target.x = clamp(nx, -1, 1); target.y = clamp(ny, -1, 1); },
    get state() { return state }, _head: head, _body: body,
    destroy() { cancelAnimationFrame(raf); renderer.dispose(); host.removeChild(renderer.domElement); },
    snapshot() { renderer.render(scene, cam); return renderer.domElement.toDataURL("image/png"); },
    _tick: (dt, t) => tick(dt, t),
  };
  const onMove = (e) => { const r = host.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height * 0.4; api.lookAt((e.clientX - cx) / (window.innerWidth * 0.5), -(e.clientY - cy) / (window.innerHeight * 0.5)); };
  window.addEventListener("pointermove", onMove);
  host.addEventListener("pointerdown", () => { wave = 1.6; });
  const fit = () => { cam.aspect = W() / H(); const need = 3.6 / (Math.tan(16 * Math.PI / 180) * cam.aspect); cam.position.z = Math.max(11.4, need); cam.updateProjectionMatrix(); };
  const ro = new ResizeObserver(() => { renderer.setSize(W(), H()); fit(); }); ro.observe(host); fit();

  const ptsArr = pg.getAttribute("position");
  function tick(dt, t) {
    lvlS = lerp(lvlS, level, 1 - Math.exp(-dt * 18));
    const col = STATE_COL[state] ? new THREE.Color(STATE_COL[state]) : accent;
    ringMat.color.lerp(col, 0.12); ring2.material.color.lerp(col, 0.12); pm.color.lerp(col, 0.1); rim.color.lerp(col, 0.08);
    const sp = state === "thinking" ? 2.4 : state === "tool" ? 3.2 : state === "listening" ? 1.0 : 0.5;
    ring.rotation.z += dt * sp; ring2.rotation.z -= dt * sp * 0.6;
    const pulse = 1 + (state === "speaking" ? lvlS * 0.22 : state === "listening" ? lvlS * 0.3 : 0.02 * Math.sin(t * 2));
    ring.scale.setScalar(pulse); ring2.scale.setScalar(1 + (pulse - 1) * 0.6);
    ringMat.opacity = 0.45 + 0.35 * (state === "idle" ? 0.4 : 1);
    // flottement + respiration
    const bob = Math.sin(t * 1.6) * 0.09; floatG.position.y = bob; shadow.scale.setScalar(1 - bob * 0.8); shadow.material.opacity = 0.28 - bob * 0.5;
    const br = Math.sin(t * 2.0) * 0.018; body.scale.set(1 + br, 1 - br * 0.8, 1 + br);
    // regard
    look.x = lerp(look.x, target.x, 1 - Math.exp(-dt * 6)); look.y = lerp(look.y, target.y, 1 - Math.exp(-dt * 6));
    let hx = look.x * 0.5, hy = -look.y * 0.32 + (state === "thinking" ? -0.28 : 0), hz = 0;
    if (state === "thinking") { hx = 0.42 * Math.sin(t * 0.8) + 0.25; hz = 0.12; }
    if (state === "listening") { hz = Math.sin(t * 1.4) * 0.05 + 0.1; hy -= 0.05; }
    if (state === "speaking") { hy += Math.sin(t * 7.0) * 0.045 * (0.4 + lvlS * 1.6); hx += Math.sin(t * 2.2) * 0.1 * (0.3 + lvlS); }
    if (state === "error") { hx = Math.sin(t * 22) * 0.12; hz = 0.18; }
    head.rotation.y = lerp(head.rotation.y, hx, 1 - Math.exp(-dt * 9)); head.rotation.x = lerp(head.rotation.x, hy, 1 - Math.exp(-dt * 9)); head.rotation.z = lerp(head.rotation.z, hz, 1 - Math.exp(-dt * 7));
    body.rotation.y = lerp(body.rotation.y, hx * 0.3, 1 - Math.exp(-dt * 4));
    const pz = clamp(look.x * 0.045, -0.05, 0.05), py = clamp(look.y * 0.05, -0.05, 0.05);
    pupils.forEach((p) => { p.position.x = lerp(p.position.x, pz * 2.2 + (state === "thinking" ? 0.04 : 0), 0.2); p.position.y = lerp(p.position.y, py * 2 + (state === "thinking" ? 0.05 : 0), 0.2); });
    // clignement
    nextBlink -= dt; if (nextBlink <= 0) { blink = 1; nextBlink = 2.2 + Math.random() * 3.5; }
    if (blink > 0) blink = Math.max(0, blink - dt * 7);
    const closed = Math.sin(blink * Math.PI); const open = state === "listening" ? 1.12 : state === "error" ? 0.8 : 1;
    eyeL.scale.set(1, open * (1 - closed * 0.9) + 0.001, 1); eyeR.scale.copy(eyeL.scale);
    // oreilles
    earT -= dt; if (earT <= 0 && Math.random() < 0.006) earT = 0.35;
    const tw = earT > 0 ? Math.sin(earT * 18) * 0.25 : 0; const up = state === "listening" ? 0.15 : 0;
    earL.rotation.z = tw + up; earR.rotation.z = -tw * 0.7 - up; earInL.rotation.z = earL.rotation.z; earInR.rotation.z = earR.rotation.z;
    // bouche : ouverture réelle selon le niveau audio
    const mo = state === "speaking" ? clamp(0.06 + lvlS * 1.6 + 0.12 * Math.abs(Math.sin(t * 11)) * lvlS, 0.03, 1) : state === "error" ? 0.0 : 0.0;
    mouth.scale.y = lerp(mouth.scale.y, 0.02 + mo * 0.34, 0.45); mouth.scale.x = lerp(mouth.scale.x, 0.17 - mo * 0.03 + (mo < 0.05 ? 0.02 : 0), 0.3);
    tongue.scale.y = mouth.scale.y * 0.5; tongue.position.y = -0.53 - mo * 0.12; mouth.position.y = -0.5 - mo * 0.1;
    blush.opacity = lerp(blush.opacity, state === "speaking" || state === "idle" ? 0.28 : 0.1, 0.05);
    // bras : salut (idle toutes ~20 s ou au clic), main au menton en réflexion, geste en parole
    nextWave -= dt; if (nextWave <= 0 && state === "idle") { wave = 2.2; nextWave = 18 + Math.random() * 15; }
    let rz = 0.28, rx = 0;
    if (wave > 0) { wave -= dt; rz = 2.4 + Math.sin(t * 12) * 0.28; }
    else if (state === "thinking") { rz = 1.0; rx = -1.0; }
    else if (state === "speaking") { rz = 0.28 + Math.abs(Math.sin(t * 3.1)) * 0.5 * lvlS; }
    armR.rotation.z = lerp(armR.rotation.z, rz, 0.15); armR.rotation.x = lerp(armR.rotation.x, rx, 0.15);
    armL.rotation.z = lerp(armL.rotation.z, -0.28 - (state === "speaking" ? Math.abs(Math.sin(t * 2.7 + 1)) * 0.4 * lvlS : 0), 0.15);
    // accessoires animés
    if (acc.userData.halo) { acc.userData.halo.rotation.z += dt * 0.8; acc.userData.halo.material.emissiveIntensity = 1.2 + Math.sin(t * 2) * 0.5 + lvlS; }
    // dots de réflexion
    thinkDots.visible = state === "thinking" || state === "tool";
    thinkDots.children.forEach((d, i) => { const a = t * 3.2 + i * 2.094; d.position.set(Math.cos(a) * 0.5, Math.sin(t * 5 + i) * 0.08, Math.sin(a) * 0.5); d.scale.setScalar(0.8 + 0.5 * Math.sin(t * 6 + i * 1.7)); });
    tdm.color.copy(col);
    // V10 : couleur d'état partout, aura qui respire avec la voix, anneaux qui tournent à des vitesses différentes
    rimU.value.lerp(col, 0.1); rimK.value = 0.45 + lvlS * 0.9 + (state === "thinking" ? 0.25 : 0);
    aura.material.color.lerp(col, 0.1); aura.material.opacity = 0.34 + 0.18 * Math.sin(t * 1.3) + lvlS * 0.45; aura.scale.setScalar(8.2 + lvlS * 1.6);
    gyroMats.forEach((m, i) => m.color.lerp(col, 0.1));
    gyroNodes.forEach((rg, i) => { rg.rotation.z += dt * (0.5 + i * 0.35) * (state === "thinking" ? 3 : state === "speaking" ? 1 + lvlS * 2 : 1) * (i % 2 ? -1 : 1); });
    gyro.rotation.y += dt * 0.15; gyro.position.y = -0.5 + bob * 0.5;
    core.rotation.y += dt * 1.8; core.rotation.x += dt * 0.9; core.material.color.lerp(col, 0.15); coreHalo.material.color.lerp(col, 0.15);
    core.scale.setScalar(1 + 0.18 * Math.sin(t * 3) + lvlS * 0.9); coreHalo.rotation.x += dt * 1.2; coreHalo.rotation.y += dt * 0.7;
    holoU.t.value = t; holoU.c.value.lerp(col, 0.1);
    // parallaxe 3D : toute la scène s'incline vers le curseur
    root.rotation.y = lerp(root.rotation.y, look.x * 0.16, 1 - Math.exp(-dt * 4)); root.rotation.x = lerp(root.rotation.x, -look.y * 0.06, 1 - Math.exp(-dt * 4));
    // particules
    for (let i = 0; i < N; i++) { const s = seed[i]; s.a += dt * s.s * (state === "thinking" ? 2.6 : 0.6 + lvlS * 2); const r = s.r + (state === "speaking" ? lvlS * 0.7 : 0);
      ptsArr.setXYZ(i, Math.cos(s.a) * r, s.y + Math.sin(t * s.s * 2 + i) * 0.25, Math.sin(s.a) * r * 0.55 - 0.4); }
    ptsArr.needsUpdate = true;
  }
  let raf = 0;
  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (document.hidden) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    tick(dt, (now - t0) / 1000);
    renderer.render(scene, cam);
  }
  accessory("nova-imperial"); theme = "nova-imperial";
  raf = requestAnimationFrame(loop);
  let frames = 0, fpsT = performance.now(); api.fps = 0;
  const fpsLoop = () => { frames++; const n = performance.now(); if (n - fpsT > 1000) { api.fps = frames * 1000 / (n - fpsT); frames = 0; fpsT = n; } requestAnimationFrame(fpsLoop); }; fpsLoop();
  return api;
}
