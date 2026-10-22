// cartes générées : JSON seul, composants whitelistés, texte échappé. node tests/card_test.mjs
globalThis.document = { createElement() { return {}; } };
const { md } = await import(new URL("../web/core.js", import.meta.url));
const out = md("```nova-card\n{\"type\":\"bars\",\"title\":\"<script>x</script>\",\"items\":[{\"label\":\"A\",\"value\":50,\"max\":100}]}\n```");
const bad = md("```nova-card\n{\"type\":\"html\",\"items\":[]}\n```");
let ok = out.includes('class="ncard"') && !out.includes("<script>") && out.includes("--w:50.0%") && !bad.includes("ncard");
console.log(ok ? "  OK   cartes : rendu sûr, composants whitelistés\nTOUT VERT." : "  FAIL cartes"); process.exit(ok ? 0 : 1);
