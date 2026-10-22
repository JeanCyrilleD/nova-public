// Compagnon animé (hérité de Spark Local) : un personnage vectoriel qui montre ce que Nova fait — repos, réfléchit, travaille, cherche, écoute, parle, attend, fête.
// Mêmes humeurs que Spark Local ; ici elles suivent l'état réel de l'assistant Nova.
export const MASCOTS = [["spark", "Panda Spark", "Le panda au nœud papillon rouge de Spark Local, en volume."], ["renard", "Renard", "Le compagnon de Spark Local : curieux, vif."], ["panda", "Panda 2D", "Le panda dessiné de Spark Local."], ["lion", "Lion", "Crinière sombre, allure royale."], ["chouette", "Chouette", "Violette, attentive, posée."], ["robot", "Robot", "Antenne lumineuse, tout en précision."], ["esprit", "Esprit", "Prend la couleur de ton thème."]];
export const MOODS = { repos: "Prêt", pense: "Je réfléchis…", ecrit: "J'écris la réponse…", travaille: "Je travaille…", cherche: "Je cherche…", ecoute: "Je t'écoute…", parle: "Je te réponds…", attente: "J'attends ton accord", fete: "C'est fait", erreur: "Quelque chose a coincé", alerte: "Message urgent", courrier: "Un message vient d'arriver", content: "Merci, ça fait plaisir", desole: "Compris, je corrige" };
const MOOD_OF = { idle: "repos", listening: "ecoute", thinking: "pense", tool: "travaille", speaking: "parle", error: "erreur" };
const HOLD = { fete: 2800, erreur: 3200, alerte: 7000, courrier: 4500, content: 2600, desole: 2600 };

export function mascotSvg(skin, react = true) {   // react : ce personnage-là mime l'activité en cours (les avatars des anciens messages restent calmes)
  const custom = "";
  return `<svg class="mascot ${react ? "react" : ""}" data-skin="${skin}"${custom} viewBox="0 0 120 120" aria-hidden="true">
  <ellipse class="m-shadow" cx="60" cy="112" rx="27" ry="5"/>
  <g class="m-stars"><path d="M14 30l2.200 5 5 2.200-5 2.200-2.200 5-2.200-5-5-2.200 5-2.200z"/><path d="M104 54l1.600 3.600 3.600 1.600-3.600 1.600-1.600 3.600-1.600-3.600-3.600-1.600 3.600-1.600z"/><path d="M22 74l1.400 3.200 3.200 1.400-3.200 1.400-1.400 3.200-1.400-3.200-3.200-1.400 3.200-1.400z"/></g>
  <g class="m-all">
    <path class="m-tail" d="M80 96c20 4 30-12 22-26-2 10-10 14-20 12z"/><path class="m-tail-tip" d="M100 76c2-3 2.500-5 2-6.500 2.500 3.500 3 7 1.800 10.500z"/>
    <g class="m-body">
      <rect class="m-torso" x="38" y="60" width="44" height="46" rx="21"/>
      <ellipse class="m-belly" cx="60" cy="86" rx="13.500" ry="16"/>
      <ellipse class="m-foot" cx="49" cy="106" rx="10" ry="5.500"/><ellipse class="m-foot" cx="71" cy="106" rx="10" ry="5.500"/>
      <g class="m-arm l"><rect x="29" y="66" width="13" height="28" rx="6.500"/></g>
      <g class="m-arm r"><rect x="78" y="66" width="13" height="28" rx="6.500"/></g>
    </g>
    <g class="m-head">
      <circle class="m-mane" cx="60" cy="40" r="35"/>
      <path class="m-ear l" d="M35 30 29 6l22 13z"/><path class="m-ear r" d="M85 30 91 6 69 19z"/>
      <path class="m-ear-in l" d="M36 25 33 12l11 7z"/><path class="m-ear-in r" d="M84 25 87 12 76 19z"/>
      <path class="m-antenna" d="M60 12V3" /><circle class="m-antenna-tip" cx="60" cy="3" r="3"/>
      <ellipse class="m-face" cx="60" cy="40" rx="31" ry="27"/>
      <ellipse class="m-patch" cx="47" cy="39" rx="8" ry="9.500"/><ellipse class="m-patch" cx="73" cy="39" rx="8" ry="9.500"/>
      <ellipse class="m-muzzle" cx="60" cy="50" rx="19" ry="13"/>
      <g class="m-eyes"><ellipse class="m-eye" cx="47.500" cy="39" rx="4.200" ry="5.200"/><ellipse class="m-eye" cx="72.500" cy="39" rx="4.200" ry="5.200"/>
        <circle class="m-glint" cx="49" cy="37" r="1.400"/><circle class="m-glint" cx="74" cy="37" r="1.400"/></g>
      <circle class="m-cheek" cx="40" cy="49" r="4.500"/><circle class="m-cheek" cx="80" cy="49" r="4.500"/>
      <path class="m-beak" d="M56 45h8l-4 7z"/>
      <ellipse class="m-nose" cx="60" cy="47" rx="3.400" ry="2.400"/>
      <path class="m-mouth" d="M54 52.500q6 5 12 0"/>
      <g class="m-phones"><path class="m-band" d="M29 40a31 31 0 0 1 62 0"/><rect x="22" y="33" width="11" height="18" rx="5.500"/><rect x="87" y="33" width="11" height="18" rx="5.500"/>
        <path class="m-note" d="M104 20v-9l7-2v9"/><circle class="m-note-h" cx="102" cy="20" r="2.400"/><circle class="m-note-h" cx="109" cy="18" r="2.400"/></g>
    </g>
    <g class="m-laptop"><path class="m-lap-base" d="M28 108h64l-3 5H31z"/><rect class="m-lap-lid" x="33" y="82" width="54" height="27" rx="4.500"/><rect class="m-screen" x="37" y="86" width="46" height="19" rx="2.500"/>
      <path class="m-code" d="M41 91h14M41 95h22M41 99h10M58 99h16"/></g>
    <g class="m-loupe"><circle class="m-lens" cx="90" cy="58" r="12"/><circle class="m-lens-rim" cx="90" cy="58" r="12"/><path class="m-handle" d="M99 67l11 11"/></g>
  </g>
  <g class="m-dots"><circle cx="93" cy="22" r="3"/><circle cx="103" cy="13" r="4.200"/><circle cx="114" cy="6" r="2.400"/></g>
  <g class="m-waves"><path d="M102 34q7 7 0 14"/><path d="M109 27q13 14 0 28"/></g>
  <g class="m-bang"><circle cx="98" cy="20" r="13"/><path d="M98 12.500v9"/><circle class="m-bang-dot" cx="98" cy="26.500" r="1.500"/></g>
  <g class="m-letter"><rect x="84" y="9" width="27" height="19" rx="3.500"/><path d="M85.500 11.500 97.500 21l12-9.500"/></g>
  <path class="m-heart" d="M99 19c-3-5.500-10.500-2-8.500 3.500 1.200 3.200 5.200 6.200 8.500 8.500 3.300-2.300 7.300-5.300 8.500-8.500 2-5.500-5.500-9-8.500-3.500z"/>
  <path class="m-drop" d="M88 20c3 5 4.200 7.200 4.200 9.200a4.200 4.200 0 0 1-8.400 0c0-2 1.200-4.200 4.200-9.200z"/>
  <g class="m-ask"><circle cx="98" cy="20" r="13"/><path d="M93.500 16.500a4.500 4.500 0 1 1 6.500 4c-1.300.7-2 1.500-2 2.900"/><circle class="m-ask-dot" cx="98" cy="27.500" r="1.300"/></g>
</svg>`;
}


let moodTimer = 0;
export function setMood(mood) {
  if (!MOODS[mood]) mood = "repos";
  document.body.dataset.mood = mood;
  clearTimeout(moodTimer);
  if (HOLD[mood]) moodTimer = setTimeout(() => setMood("repos"), HOLD[mood]);
}
/** Humeur déduite de ce que dit l'utilisateur : un merci réjouit, un reproche rend attentif. */
export function moodFromText(t) {
  t = (t || "").toLowerCase();
  if (/\b(merci|bravo|parfait|super|g[ée]nial|excellent|top|nickel|magnifique|j'adore)\b/.test(t)) return "content";
  if (/\b(nul|foire|marche pas|fonctionne pas|plant[ée]|trop lent|n'importe quoi|pas bon|d[ée]ception)\b/.test(t)) return "desole";
  return null;
}
let ticking = false;
function ticks() {
  if (ticking) return; ticking = true;
  setInterval(() => {
    if (document.hidden || (document.body.dataset.mood || "repos") !== "repos") return;
    document.body.dataset.tic = ["salut", "saut", "regard", "etire"][Math.floor(Math.random() * 4)];
    setTimeout(() => { delete document.body.dataset.tic; }, 1700);
  }, 11000);
  document.addEventListener("mousemove", (e) => {
    const st = document.querySelector(".compagnon-stage"); if (!st) return;
    const r = st.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height * 0.36), d = Math.hypot(dx, dy) || 1;
    document.body.style.setProperty("--ex", (2.6 * dx / d).toFixed(2) + "px"); document.body.style.setProperty("--ey", (2 * dy / d).toFixed(2) + "px");
  });
}

// Panda de Spark Local (dégradés volumétriques, nœud papillon rouge) — animé selon l'état réel de Nova.
function pandaSVG(accessoire, opts = {}) {
  const k = opts.k || "";
  return `<svg class="masc masc-panda" viewBox="0 0 160 170" aria-hidden="true">
<defs>
  <!-- Dégradés volumétriques SVG pour la fourrure et les membres -->
  <radialGradient id="bodyGrad${k}" cx="35%" cy="30%" r="65%">
    <stop offset="0%" stop-color="#FFFFFF"/>
    <stop offset="65%" stop-color="#F2EFE9"/>
    <stop offset="100%" stop-color="#D9D4C7"/>
  </radialGradient>
  <radialGradient id="darkGrad${k}" cx="35%" cy="30%" r="65%">
    <stop offset="0%" stop-color="#3A3D45"/>
    <stop offset="60%" stop-color="#1B1C22"/>
    <stop offset="100%" stop-color="#0B0C0E"/>
  </radialGradient>
  <radialGradient id="redTie${k}" cx="40%" cy="35%" r="65%">
    <stop offset="0%" stop-color="#FF4D4D"/>
    <stop offset="55%" stop-color="#C00000"/>
    <stop offset="100%" stop-color="#7A0002"/>
  </radialGradient>
  <radialGradient id="eyeGlint${k}" cx="35%" cy="35%" r="50%">
    <stop offset="0%" stop-color="#FFFFFF"/>
    <stop offset="80%" stop-color="#D0D0D0"/>
    <stop offset="100%" stop-color="#A0A0A0"/>
  </radialGradient>
  <!-- Ombre flottante au sol -->
  <radialGradient id="shadowFloor${k}" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="rgba(0,0,0,0.45)"/>
    <stop offset="60%" stop-color="rgba(0,0,0,0.18)"/>
    <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
  </radialGradient>
  <!-- Aura d'humeur active -->
  <filter id="auraGlow${k}" x="-25%" y="-25%" width="150%" height="150%">
    <feGaussianBlur stdDeviation="3.5" result="blur"/>
    <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
</defs>

<!-- Ombre projetée flottante -->
<ellipse class="comp-floor-shadow" cx="80" cy="162" rx="36" ry="6" fill="url(#shadowFloor${k})"/>

<!-- Groupe de l'être vivant entier (porteur de la physique flottante) -->
<g class="comp-body-group">
  <!-- Oreille gauche -->
  <circle class="comp-ear comp-ear-l" cx="50" cy="42" r="16" fill="url(#darkGrad${k})"/>
  <circle cx="50" cy="42" r="8" fill="#FF8595" opacity="0.35"/>
  
  <!-- Oreille droite -->
  <circle class="comp-ear comp-ear-r" cx="110" cy="42" r="16" fill="url(#darkGrad${k})"/>
  <circle cx="110" cy="42" r="8" fill="#FF8595" opacity="0.35"/>

  <!-- Corps / Buste rond en soie blanche -->
  <ellipse class="comp-torso" cx="80" cy="112" rx="38" ry="34" fill="url(#bodyGrad${k})" stroke="#D0CBC0" stroke-width="1.2"/>

  <!-- Pied gauche avec coussinet -->
  <g class="comp-foot comp-foot-l">
    <ellipse cx="60" cy="144" rx="14" ry="10" fill="url(#darkGrad${k})"/>
    <ellipse cx="60" cy="144" rx="7" ry="5" fill="#FF8595" opacity="0.4"/>
  </g>

  <!-- Pied droit avec coussinet -->
  <g class="comp-foot comp-foot-r">
    <ellipse cx="100" cy="144" rx="14" ry="10" fill="url(#darkGrad${k})"/>
    <ellipse cx="100" cy="144" rx="7" ry="5" fill="#FF8595" opacity="0.4"/>
  </g>

  <!-- Bras gauche / Main gauche mobile -->
  <g class="comp-arm comp-arm-l">
    <path d="M 46 96 C 30 102 24 116 34 126 C 42 132 50 120 52 108 Z" fill="url(#darkGrad${k})"/>
    <!-- Paume et doigts -->
    <circle cx="34" cy="124" r="7" fill="url(#darkGrad${k})"/>
  </g>

  <!-- Bras droit / Main droite mobile -->
  <g class="comp-arm comp-arm-r">
    <path d="M 114 96 C 130 102 136 116 126 126 C 118 132 110 120 108 108 Z" fill="url(#darkGrad${k})"/>
    <!-- Paume et doigts -->
    <circle cx="126" cy="124" r="7" fill="url(#darkGrad${k})"/>
  </g>

  <g class="comp-face">
  <!-- Tête expressive et joufflue -->
  <ellipse class="comp-head" cx="80" cy="68" rx="42" ry="36" fill="url(#bodyGrad${k})" stroke="#D0CBC0" stroke-width="1.2"/>

  <!-- Taches noires caractéristiques des yeux -->
  <ellipse cx="64" cy="68" rx="13" ry="17" fill="url(#darkGrad${k})" transform="rotate(-12 64 68)"/>
  <ellipse cx="96" cy="68" rx="13" ry="17" fill="url(#darkGrad${k})" transform="rotate(12 96 68)"/>

  <!-- Yeux vifs et brillants avec pupilles et reflets -->
  <circle class="comp-eye comp-eye-l" cx="65" cy="68" r="6" fill="#111115"/>
  <circle class="comp-glint" cx="63" cy="66" r="2.5" fill="url(#eyeGlint${k})"/>
  
  <circle class="comp-eye comp-eye-r" cx="95" cy="68" r="6" fill="#111115"/>
  <circle class="comp-glint" cx="93" cy="66" r="2.5" fill="url(#eyeGlint${k})"/>

  <!-- Museau et nez noir en relief -->
  <ellipse cx="80" cy="79" rx="11" ry="8" fill="#FBF9F5"/>
  <ellipse cx="80" cy="76" rx="5" ry="3.5" fill="#1A1A1E"/>
  <!-- Petit sourire bienveillant -->
  <path class="comp-mouth" d="M 76 80 Q 80 84 84 80" stroke="#1A1A1E" stroke-width="1.4" fill="none" stroke-linecap="round"/>
  <ellipse class="comp-mouth-open" cx="80" cy="82" rx="4.6" ry="3.4" fill="#5a1a26" opacity="0" style="transform-box:fill-box;transform-origin:50% 0%;transform:scaleY(.1)"/>

  <!-- Pommettes rosées d'empathie -->
  <ellipse cx="50" cy="78" rx="7" ry="4" fill="#FF8595" opacity="0.45"/>
  <ellipse cx="110" cy="78" rx="7" ry="4" fill="#FF8595" opacity="0.45"/>
  </g>

  <!-- Nœud papillon rouge -->
  <g class="comp-tie" transform="translate(0, 0)">
    <polygon points="68,96 80,102 68,108" fill="url(#redTie${k})"/>
    <polygon points="92,96 80,102 92,108" fill="url(#redTie${k})"/>
    <circle cx="80" cy="102" r="4.5" fill="#FF4D4D"/>
  </g>
</g>
</svg>`;
}


const ETAT_OF = { idle: "repos", listening: "ecoute", thinking: "pense", tool: "travail", speaking: "parle", error: "erreur" };

import { vivant } from "./vivant.js";
/** Même interface que les autres avatars (setState / setLevel / lookAt / react / destroy). */
export function createCompagnon(host, skin) {
  const holder = document.createElement("div"); holder.dataset.avatarHolder = "1"; holder.className = "compagnon-stage";
  holder.style.cssText = "position:absolute;inset:0;display:grid;place-items:center;pointer-events:none";
  const spark = skin === "spark";
  holder.innerHTML = spark ? pandaSVG("noeud", { k: "n" + Math.random().toString(36).slice(2, 6) }) : mascotSvg(skin, true);
  if (spark) holder.classList.add("masc-wrap");
  const svg = holder.firstElementChild; svg.style.cssText = "width:100%;height:100%;overflow:visible";
  host.appendChild(holder); ticks();
  let state = "idle";
  const v = spark ? vivant(holder) : null;
  return {
    setState(s) { state = s; if (spark) { holder.dataset.etat = ETAT_OF[s] || "repos"; v.setState(s); } else setMood(MOOD_OF[s] || "repos"); },
    setLevel(x) { if (v) v.setLevel(x); }, setTheme() {}, lookAt(x, y) { if (v) v.lookAt(x, y); }, react(m) { if (v) v.react(m); }, get state() { return state; },
    destroy() { if (v) v.destroy(); holder.remove(); setMood("repos"); },
  };
}
