// V22 — Le panda vit : bouche synchronisée sur la voix, regard qui suit le curseur, tics spontanés, réactions au ton de la conversation.
// Tout passe par les propriétés CSS individuelles (translate / rotate / scale) pour ne pas écraser les animations CSS existantes.
const rnd = (a, b) => a + Math.random() * (b - a), clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const FX = { content: ["💖", "✨"], fete: ["🎉", "✨", "⭐"], desole: ["💧"], alerte: ["❗"], courrier: ["✉️"], attente: ["❓"], pense: ["💭"], travail: ["⌨️"], ecoute: ["🎧"], salut: ["👋"] };

export function vivant(holder) {
  const $ = (s) => holder.querySelector(s), $$ = (s) => [...holder.querySelectorAll(s)];
  const face = $(".comp-face"), mouth = $(".comp-mouth"), open = $(".comp-mouth-open"), body = $(".comp-body-group"), torso = $(".comp-torso");
  const eyes = $$(".comp-eye, .comp-glint"), earL = $(".comp-ear-l"), earR = $(".comp-ear-r"), armL = $(".comp-arm-l"), armR = $(".comp-arm-r"), tie = $(".comp-tie");
  for (const [el, o] of [[armR, "20% 10%"], [armL, "80% 10%"], [earL, "50% 90%"], [earR, "50% 90%"]]) if (el) { el.style.transformBox = "fill-box"; el.style.transformOrigin = o; }
  if (face) { face.style.transformBox = "fill-box"; face.style.transformOrigin = "50% 90%"; }
  const fx = document.createElement("div"); fx.style.cssText = "position:absolute;inset:0;pointer-events:none;overflow:visible"; holder.append(fx);

  let state = "idle", lvTarget = 0, lv = 0, lastLv = 0, tx = 0, ty = 0, ex = 0, ey = 0, hold = 0, lastMove = performance.now(), alive = true, mood = "", moodUntil = 0, squint = 0;
  let nextTic = performance.now() + rnd(3000, 6000), phase = 0;

  /* émojis flottants (réactions) */
  const puff = (list, n = 1) => { for (let i = 0; i < n; i++) { const s = document.createElement("span"); s.textContent = list[(Math.random() * list.length) | 0]; const x = 50 + rnd(-18, 18); s.style.cssText = `position:absolute;left:${x}%;top:22%;font-size:${rnd(15, 22)}px;opacity:0;pointer-events:none;filter:drop-shadow(0 2px 4px rgba(0,0,0,.4))`; fx.append(s);
    s.animate([{ transform: "translateY(8px) scale(.5)", opacity: 0 }, { opacity: 1, offset: .25 }, { transform: `translate(${rnd(-14, 14)}px,-46px) scale(1.1)`, opacity: 0 }], { duration: rnd(1400, 2200), delay: i * 160, easing: "ease-out" }).onfinish = () => s.remove(); } };
  const badge = (key) => { clear(); const list = FX[key]; if (!list) return; const s = document.createElement("span"); s.className = "vv-badge"; s.textContent = list[0]; s.style.cssText = "position:absolute;right:6%;top:8%;font-size:24px;pointer-events:none;filter:drop-shadow(0 2px 5px rgba(0,0,0,.45))"; fx.append(s);
    s.animate([{ transform: "translateY(0) rotate(-6deg)" }, { transform: "translateY(-5px) rotate(6deg)" }], { duration: 650, direction: "alternate", iterations: Infinity, easing: "ease-in-out" }); };
  const clear = () => fx.querySelectorAll(".vv-badge").forEach((n) => n.remove());

  const anim = (el, kf, o = {}) => { try { return el && el.animate(kf, { duration: 600, easing: "ease-in-out", ...o }); } catch { return null; } };
  const jump = (h = 12, n = 1) => anim(body, [{ transform: "translateY(0) scale(1,1)" }, { transform: "translateY(2px) scale(1.04,.94)", offset: .15 }, { transform: `translateY(${-h}px) scale(.97,1.05)`, offset: .5 }, { transform: "translateY(0) scale(1.03,.96)", offset: .85 }, { transform: "translateY(0) scale(1,1)" }], { duration: 560, iterations: n });
  const wave = () => anim(armR, [{ rotate: "0deg" }, { rotate: "-145deg", offset: .2 }, { rotate: "-115deg", offset: .4 }, { rotate: "-150deg", offset: .6 }, { rotate: "-115deg", offset: .8 }, { rotate: "0deg" }], { duration: 1500 });
  const wiggle = () => { anim(earL, [{ rotate: "0deg" }, { rotate: "-14deg" }, { rotate: "6deg" }, { rotate: "0deg" }], { duration: 520 }); anim(earR, [{ rotate: "0deg" }, { rotate: "12deg" }, { rotate: "-5deg" }, { rotate: "0deg" }], { duration: 520, delay: 90 }); };
  const cheer = () => { anim(armL, [{ rotate: "0deg" }, { rotate: "150deg" }, { rotate: "130deg" }, { rotate: "150deg" }, { rotate: "0deg" }], { duration: 1200 }); anim(armR, [{ rotate: "0deg" }, { rotate: "-150deg" }, { rotate: "-130deg" }, { rotate: "-150deg" }, { rotate: "0deg" }], { duration: 1200 }); };
  const yawn = () => { hold = performance.now() + 1500; lvTarget = 1; squint = 1; setTimeout(() => { lvTarget = 0; squint = 0; }, 1300); };
  const look = (x, y, ms = 1400) => { tx = x; ty = y; hold = performance.now() + ms; };
  const TICS = [() => wave(), wiggle, () => look(rnd(-1, 1), rnd(-.4, .6), 1600), () => jump(9), yawn, () => { anim(face, [{ rotate: "0deg" }, { rotate: "9deg" }, { rotate: "9deg" }, { rotate: "0deg" }], { duration: 2000 }); }, () => { cheer(); }];

  /* réactions pilotées de l'extérieur : ton de la réponse, événements (Dots, courrier…) */
  function react(m) {
    if (!m) return; mood = m; moodUntil = performance.now() + 3200;
    if (m === "content") { puff(FX.content, 3); jump(9); squint = .6; setTimeout(() => { squint = 0; }, 2200); }
    else if (m === "fete") { puff(FX.fete, 5); jump(16, 2); cheer(); }
    else if (m === "desole") { puff(FX.desole, 2); anim(face, [{ rotate: "0deg" }, { rotate: "-9deg" }, { rotate: "-9deg" }, { rotate: "0deg" }], { duration: 2800 }); }
    else if (m === "alerte") { puff(FX.alerte, 2); jump(14, 2); wiggle(); }
    else if (m === "courrier") { puff(FX.courrier, 2); wiggle(); look(.8, -.2, 1600); }
    else if (m === "attente") { puff(FX.attente, 2); anim(face, [{ rotate: "0deg" }, { rotate: "8deg" }, { rotate: "8deg" }, { rotate: "0deg" }], { duration: 2400 }); }
    else if (m === "salut") { wave(); puff(FX.salut, 1); }
  }

  function setState(s) {
    state = s; clear(); lastMove = performance.now();
    if (s === "thinking") { badge("pense"); look(.7, -.8, 99999); anim(armR, [{ rotate: "0deg" }, { rotate: "-150deg" }], { duration: 500, fill: "forwards" }); }
    else if (s === "tool") { badge("travail"); look(0, .7, 99999); }
    else if (s === "listening") { badge("ecoute"); look(0, 0, 0); wiggle(); }
    else if (s === "error") { puff(FX.desole, 2); }
    if (s !== "thinking" && armR) armR.getAnimations().forEach((a) => a.cancel());
    if (s === "idle" || s === "listening" || s === "speaking") { hold = 0; }
  }
  function setLevel(v) { lastLv = performance.now(); lvTarget = clamp(v * 1.4, 0, 1); }
  /* x,y ∈ [-1,1] : où se trouve le curseur par rapport au panda */
  function lookAt(x, y) { lastMove = performance.now(); if (performance.now() < hold) return; tx = clamp(x, -1, 1); ty = clamp(y, -1, 1); }

  const onMove = (e) => { const r = holder.getBoundingClientRect(); if (!r.width) return; lookAt((e.clientX - (r.left + r.width / 2)) / (innerWidth * .35), (e.clientY - (r.top + r.height * .4)) / (innerHeight * .35)); };
  const onDbl = (e) => { if (!e.target.closest || !e.target.closest("#orb")) return; react("content"); wave(); };
  const onDown = (e) => { if (e.target.closest && e.target.closest("#orb .ob,#orb .orbsz")) return; lastMove = performance.now(); };
  addEventListener("pointermove", onMove, { passive: true }); addEventListener("dblclick", onDbl); addEventListener("pointerdown", onDown, { passive: true });

  let last = performance.now();
  function frame(t) {
    if (!alive) return; requestAnimationFrame(frame);
    if (document.hidden) return; const dt = Math.min(64, t - last) / 1000; last = t; phase += dt;
    /* voix : niveau réel si on le reçoit, sinon mouvement de parole synthétique */
    let target = lvTarget;
    if (state === "speaking" && t - lastLv > 220) target = clamp(.35 + .35 * Math.sin(phase * 13) * Math.sin(phase * 3.1 + 1) + rnd(-.1, .1), 0, 1);
    if (state !== "speaking" && state !== "listening" && t > hold && lvTarget === 0) target = 0;
    lv += (target - lv) * clamp(dt * 22, 0, 1);
    const o = clamp(lv, 0, 1);
    if (open) { open.style.opacity = o > .06 ? 1 : 0; open.style.transform = `scaleY(${.15 + o * 1.5}) scaleX(${.8 + o * .5})`; }
    if (mouth) mouth.style.opacity = o > .06 ? 0 : 1;
    /* regard : suit la cible ; repos → balayage spontané */
    if (t > hold && state === "idle" && t - lastMove > 7000 && Math.random() < dt * .25) { tx = rnd(-.8, .8); ty = rnd(-.3, .5); }
    ex += (tx - ex) * clamp(dt * 9, 0, 1); ey += (ty - ey) * clamp(dt * 9, 0, 1);
    const sq = squint ? 1 - squint * .55 : 1;
    for (const e of eyes) { e.style.translate = `${ex * 3.2}px ${ey * 2.4}px`; if (e.classList.contains("comp-eye")) e.style.scale = `1 ${sq}`; }
    if (face) { face.style.translate = `${ex * 2.2}px ${ey * 1.2 - o * 1.6}px`; if (!face.getAnimations().length) face.style.rotate = `${ex * 4.5}deg`; }
    if (tie) tie.style.translate = `${ex * .8}px 0`;
    if (state === "speaking" && torso) torso.style.scale = `${1 + o * .03} ${1 - o * .02}`; else if (torso) torso.style.scale = "";
    if (state === "listening") { const ea = -4 - o * 10; if (earL && !earL.getAnimations().length) earL.style.rotate = `${ea}deg`; if (earR && !earR.getAnimations().length) earR.style.rotate = `${-ea}deg`; }
    else { if (earL && !earL.getAnimations().length) earL.style.rotate = ""; if (earR && !earR.getAnimations().length) earR.style.rotate = ""; }
    /* gestes pendant la parole : les mains suivent le rythme */
    if (state === "speaking") { if (armL && !armL.getAnimations().length) armL.style.rotate = `${Math.sin(phase * 5.2) * 7 * (.4 + o)}deg`; if (armR && !armR.getAnimations().length) armR.style.rotate = `${-Math.sin(phase * 4.6 + 1) * 8 * (.4 + o)}deg`; }
    else if (state === "tool") { if (armL && !armL.getAnimations().length) armL.style.rotate = `${Math.sin(phase * 22) * 7}deg`; if (armR && !armR.getAnimations().length) armR.style.rotate = `${Math.cos(phase * 22) * 7}deg`; }
    else if (state !== "thinking") { if (armL && !armL.getAnimations().length) armL.style.rotate = ""; if (armR && !armR.getAnimations().length) armR.style.rotate = ""; }
    /* tics spontanés au repos */
    if (state === "idle" && t > nextTic) { nextTic = t + rnd(5000, 11000); if (!mood || t > moodUntil) TICS[(Math.random() * TICS.length) | 0](); }
  }
  requestAnimationFrame(frame);
  setTimeout(() => react("salut"), 900);   // se présente à l'ouverture
  return { setState, setLevel, lookAt, react, destroy() { alive = false; removeEventListener("pointermove", onMove); removeEventListener("dblclick", onDbl); removeEventListener("pointerdown", onDown); fx.remove(); } };
}
