// Pipeline conversationnel : micro → VAD → STT → cerveau (flux) → phrases → TTS enchaîné → haut-parleur, avec barge-in à la voix.
// Tout état affiché vient d'ici (pas de bannière « opérationnel » sans test réel du micro).
export class Assistant extends EventTarget {
  constructor(api) {
    super(); this.api = api; this.state = "idle"; this.level = 0; this.convId = null;
    this.ctx = null; this.mic = null; this.voiceOn = false; this.abort = null; this.sources = []; this.playT = 0; this.ttsQ = []; this.speakingDone = true;
    this.noise = 0.01; this.pre = []; this.rec = null; this.hearMs = 0; this.silMs = 0; this.busy = false; this.engine = null; this.lastErr = "";
  }
  emit(t, d = {}) { this.dispatchEvent(new CustomEvent(t, { detail: d })); }
  set(s) { if (this.state !== s) { this.state = s; this.emit("state", { state: s }); this.api.post("/api/assistant/state", { state: s, convId: this.convId }).catch(() => {}); } }

  // ── audio de sortie
  ensureCtx() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; this.ctx = new AC();
      this.out = this.ctx.createGain(); this.an = this.ctx.createAnalyser(); this.an.fftSize = 512; this.out.connect(this.an); this.an.connect(this.ctx.destination);
      this.buf = new Uint8Array(this.an.fftSize);
      const lv = () => { requestAnimationFrame(lv); if (this.state !== "speaking") { if (this.state !== "listening") this.setLevel(0); return; }
        this.an.getByteTimeDomainData(this.buf); let s = 0; for (const b of this.buf) { const v = (b - 128) / 128; s += v * v; } this.setLevel(Math.min(1, Math.sqrt(s / this.buf.length) * 5)); };
      lv();
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  }
  setLevel(v) { this.level = v; this.emit("level", { level: v }); }

  // ── micro
  async startVoice() {
    if (this.voiceOn) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { this.fail("Micro indisponible : cette fenêtre n'expose pas navigator.mediaDevices (contexte non sécurisé)."); return; }
    this.ensureCtx();
    try { this.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } }); }
    catch (e) {
      const m = { NotAllowedError: "Accès au micro refusé : autorise Nova dans Réglages Système › Confidentialité › Microphone.", NotFoundError: "Aucun micro détecté.", NotReadableError: "Le micro est utilisé par une autre application." }[e.name] || ("Micro : " + e.name);
      this.fail(m); return;
    }
    const src = this.ctx.createMediaStreamSource(this.mic);
    const code = "class P extends AudioWorkletProcessor{process(i){const c=i[0][0];if(c)this.port.postMessage(c.slice(0));return true}}registerProcessor('pcm',P)";
    await this.ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([code], { type: "text/javascript" })));
    this.node = new AudioWorkletNode(this.ctx, "pcm"); src.connect(this.node);
    const silent = this.ctx.createGain(); silent.gain.value = 0; this.node.connect(silent); silent.connect(this.ctx.destination);
    this.acc = []; this.accN = 0; this.speech = false; this.hearMs = 0; this.silMs = 0; this.pre = [];
    this.node.port.onmessage = (e) => this.onPcm(e.data);
    this.voiceOn = true; this.micTested = true; this.emit("voice", { on: true });
    if (this.state === "idle") this.set("listening");
  }
  stopVoice() {
    this.voiceOn = false; this.rec = null; this.speech = false;
    try { this.node && this.node.disconnect(); } catch {}
    if (this.mic) this.mic.getTracks().forEach((t) => t.stop()); this.mic = null; this.node = null;
    this.emit("voice", { on: false }); if (this.state === "listening") this.set("idle");
  }
  onPcm(f) {
    this.acc.push(f); this.accN += f.length;
    const sr = this.ctx.sampleRate, win = Math.round(sr * 0.03);
    if (this.accN < win) return;
    let s = 0, n = 0; for (const a of this.acc) { for (let i = 0; i < a.length; i++) { s += a[i] * a[i]; n++; } }
    const rms = Math.sqrt(s / n); const chunk = this.acc; this.acc = []; this.accN = 0; const ms = n / sr * 1000;
    const speaking = this.state === "speaking";
    const thr = Math.max(0.014, this.noise * 3.4) * (speaking ? 1.8 : 1);
    const loud = rms > thr;
    if (!this.speech) {
      this.pre.push(...chunk); const keep = Math.round(sr * 0.45); let tot = this.pre.reduce((a, b) => a + b.length, 0);
      while (tot > keep && this.pre.length > 1) tot -= this.pre.shift().length;
      if (!loud) this.noise = this.noise * 0.97 + rms * 0.03;
      this.hearMs = loud ? this.hearMs + ms : Math.max(0, this.hearMs - ms);
      if (this.state === "listening") this.setLevel(Math.min(1, rms * 8));
      if (this.hearMs >= (speaking ? 240 : 120) && !this.busy) {
        if (speaking) this.interrupt("voix");
        this.speech = true; this.rec = [...this.pre]; this.pre = []; this.silMs = 0; this.recMs = 0; this.set("listening");
      }
    } else {
      this.rec.push(...chunk); this.recMs += ms; this.silMs = loud ? 0 : this.silMs + ms; this.setLevel(Math.min(1, rms * 8));
      if ((this.silMs > 800 && this.recMs > 450) || this.recMs > 25000) { const r = this.rec; this.rec = null; this.speech = false; this.hearMs = 0; this.transcribe(r, sr); }
    }
  }
  wav(chunks, sr) {
    const tot = chunks.reduce((a, b) => a + b.length, 0), f = new Float32Array(tot); let o = 0; for (const c of chunks) { f.set(c, o); o += c.length; }
    const ratio = sr / 16000, n = Math.floor(f.length / ratio), pcm = new Int16Array(n);
    for (let i = 0; i < n; i++) { const v = Math.max(-1, Math.min(1, f[Math.floor(i * ratio)])); pcm[i] = v < 0 ? v * 0x8000 : v * 0x7fff; }
    const b = new ArrayBuffer(44 + n * 2), d = new DataView(b), w = (p, s) => { for (let i = 0; i < s.length; i++) d.setUint8(p + i, s.charCodeAt(i)); };
    w(0, "RIFF"); d.setUint32(4, 36 + n * 2, true); w(8, "WAVEfmt "); d.setUint32(16, 16, true); d.setUint16(20, 1, true); d.setUint16(22, 1, true);
    d.setUint32(24, 16000, true); d.setUint32(28, 32000, true); d.setUint16(32, 2, true); d.setUint16(34, 16, true); w(36, "data"); d.setUint32(40, n * 2, true);
    new Int16Array(b, 44).set(pcm); return new Blob([b], { type: "audio/wav" });
  }
  async transcribe(chunks, sr) {
    this.busy = true; this.set("thinking"); const t0 = performance.now();
    try {
      const r = await fetch("/api/stt", { method: "POST", headers: { "Content-Type": "audio/wav" }, body: this.wav(chunks, sr) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error || "STT en échec");
      const text = (j.text || "").trim(); this.emit("stt", { ms: Math.round(performance.now() - t0), text });
      if (text.length < 2) { this.busy = false; this.set(this.voiceOn ? "listening" : "idle"); return; }
      if (/^(stop|arrête|arrete|tais-toi|silence|ça suffit)[\s.!]*$/i.test(text)) { this.interrupt("commande"); this.busy = false; this.set("listening"); return; }
      this.busy = false; await this.send(text, { voice: true });
    } catch (e) { this.busy = false; this.fail("Transcription impossible : " + e.message); }
  }

  // ── conversation en flux
  async send(text, { voice = false, brain, mode, depth, tools } = {}) {
    if (tools === undefined) { let m = "cowork"; try { m = localStorage.getItem("nova_mode") || "cowork"; } catch {} tools = m !== "simple"; }
    if (this.onCommand && this.onCommand(text)) { this.emit("user", { text }); return; }
    this.ensureCtx(); this.interrupt("nouveau message", true); this.lastErr = ""; this.lastUser = { text, voice, brain, mode, depth, tools };
    this.abort = new AbortController(); const ac = this.abort;
    this.emit("user", { text }); this.set("thinking"); this.speakingDone = false; this.pendingDone = null; this.revealT = []; this.ttsOrder = 0; this.buffer = ""; this.spokenFirst = false;
    let answer = "";
    try {
      const r = await fetch("/api/chat", { method: "POST", signal: ac.signal, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, conversation_id: this.convId, voice, brain, mode, depth, tools }) });
      if (!r.ok || !r.body) { let j = {}; try { j = await r.json(); } catch {} this.fail(j.error ? "Le moteur a refusé la demande : " + j.error : "Le moteur a répondu HTTP " + r.status + "."); return; }
      const rd = r.body.getReader(), dec = new TextDecoder(); let buf = "";
      while (true) {
        const { done, value } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true });
        let i; while ((i = buf.indexOf("\n\n")) >= 0) {
          const blk = buf.slice(0, i); buf = buf.slice(i + 2); let ev = "", data = "";
          for (const l of blk.split("\n")) { if (l.startsWith("event:")) ev = l.slice(6).trim(); else if (l.startsWith("data:")) data += l.slice(5).trim(); }
          if (!ev) continue; let d = {}; try { d = JSON.parse(data); } catch {}
          if (ev === "meta") { this.convId = d.conversation_id; this.emit("meta", d); }
          else if (ev === "brain") this.emit("brain", d);
          else if (ev === "failover") this.emit("failover", d);
          else if (ev === "tool") { this.set("tool"); this.emit("tool", d); }
          else if (ev === "delta") { answer += d.t; if (this.state !== "speaking" && !voice) this.set("thinking"); if (voice) { this.pendingFull = answer; this.feedTTS(d.t); } else this.emit("delta", { t: d.t, full: answer }); }
          else if (ev === "error") { this.emit("error", d); this.lastErr = d.message; }
          else if (ev === "done") { if (voice) this.pendingDone = d; else this.emit("done", d); }
        }
      }
      if (voice) this.flushTTS(true);
      if (!answer) { this.fail(this.lastErr || "Aucune réponse.", !!this.lastErr); return; }
      if (!voice) this.set(this.voiceOn ? "listening" : "idle");
    } catch (e) { if (e.name !== "AbortError") this.fail((/Failed to fetch|NetworkError|Load failed/i.test(e.message) ? "Le moteur Nova ne répond pas (réseau ou application arrêtée)" : "Connexion au moteur : " + e.message)); }
  }
  /** Rejoue le dernier message utilisateur (réessai après erreur, ou régénération de la réponse). */
  retry(over = {}) { const l = this.lastUser; if (!l) return false; return this.send(l.text, { ...l, ...over }), true; }
  /** Arrête génération + voix (alias lisible du bouton Stop). */
  stop() { this.interrupt("bouton"); }
  // ── phrases → TTS
  feedTTS(t) {
    this.buffer += t;
    const rx = this.spokenFirst ? /([.!?…]+["»)]?\s+|\n+)/ : /([.!?…,;:]\s+|\n+)/; const min = this.spokenFirst ? 28 : 14;
    while (true) {
      const m = rx.exec(this.buffer); if (!m) break; const end = m.index + m[0].length;
      if (end < min) { const m2 = rx.exec(this.buffer.slice(end)); if (!m2) break; const e2 = end + m2.index + m2[0].length; this.speakChunk(this.buffer.slice(0, e2)); this.buffer = this.buffer.slice(e2); continue; }
      this.speakChunk(this.buffer.slice(0, end)); this.buffer = this.buffer.slice(end);
    }
    if (this.buffer.length > 220) { const k = this.buffer.lastIndexOf(" ", 160); this.speakChunk(this.buffer.slice(0, k > 0 ? k : 160)); this.buffer = this.buffer.slice(k > 0 ? k : 160); }
  }
  flushTTS(final) { if (this.buffer.trim()) { this.speakChunk(this.buffer); this.buffer = ""; } if (final) this.endOfText = true; this.checkEnd(); }
  clean(t) { return t.replace(/[*_`#>]|\[(.*?)\]\(.*?\)/g, "$1").replace(/\s+/g, " ").trim(); }
  speakChunk(raw) {
    const t = this.clean(raw); if (t.length < 2) { this.reveal(raw, 0, 0); return; } if (t.length < 2) return; this.spokenFirst = true; const gen = this.gen = (this.gen || 0);
    const p = Promise.resolve().then(() => gen !== this.gen ? Promise.reject(new Error("annulé")) : fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: t }) }))
      .then(async (r) => { const eng = r.headers.get("X-Nova-Voice"); if (eng && eng !== this.engine) { this.engine = eng; this.emit("engine", { engine: eng, reason: r.headers.get("X-Nova-Voice-Reason") || "" }); }
        if (!r.ok) throw new Error("voix indisponible"); return this.ctx.decodeAudioData(await r.arrayBuffer()); });
    this.ttsQ.push({ p, gen, t, raw }); this.pump();
  }
  /** Affiche le texte d'un morceau au rythme de sa voix : début = début de l'audio, mot après mot sur sa durée. */
  reveal(raw, delayMs, durMs) {
    const gen = this.gen, words = raw.match(/\S+\s*/g) || [raw]; const step = durMs > 0 ? durMs / words.length : 0;
    words.forEach((w, i) => { const id = setTimeout(() => {
      if (gen !== this.gen) return; this.revealed = (this.revealed || "") + w; this.emit("delta", { t: w, full: this.revealed });
    }, delayMs + i * step); (this.revealT = this.revealT || []).push(id); });
  }
  async pump() {
    if (this.pumping) return; this.pumping = true;
    while (this.ttsQ.length) {
      const it = this.ttsQ.shift(); let buf;
      try { buf = await it.p; } catch (e) { if (it.gen === this.gen) { this.emit("error", { message: "Voix : " + e.message }); this.reveal(it.raw, 0, 0); } continue; }
      if (it.gen !== this.gen) continue;
      const s = this.ctx.createBufferSource(); s.buffer = buf; s.connect(this.out);
      const at = Math.max(this.ctx.currentTime + 0.03, this.playT); s.start(at); this.playT = at + buf.duration; this.sources.push(s); this.reveal(it.raw, Math.max(0, (at - this.ctx.currentTime) * 1000), buf.duration * 1000 * 0.92);
      if (this.state !== "speaking") this.set("speaking");
      s.onended = () => { this.sources = this.sources.filter((x) => x !== s); this.checkEnd(); };
    }
    this.pumping = false; this.checkEnd();
  }
  checkEnd() {
    if (this.endOfText && !this.ttsQ.length && !this.sources.length && !this.pumping) { this.endOfText = false; this.speakingDone = true; if (this.pendingDone) { const dd = this.pendingDone; this.pendingDone = null; setTimeout(() => this.emit("done", dd), 400); } this.set(this.voiceOn ? "listening" : "idle"); }
  }
  /** Coupe la parole ET la génération en cours. Utilisé par le barge-in, « stop » et le bouton. */
  interrupt(why = "", silent = false) {
    this.gen = (this.gen || 0) + 1; this.ttsQ = []; (this.revealT || []).forEach(clearTimeout); this.revealT = []; if (this.pendingFull && this.revealed !== this.pendingFull) { /* texte non lu : affiché en entier */ const rest = this.pendingFull.slice((this.revealed || "").length); if (rest) this.emit("delta", { t: rest, full: this.pendingFull }); if (this.pendingDone) { this.emit("done", this.pendingDone); } } this.pendingFull = ""; this.revealed = ""; this.pendingDone = null; this.endOfText = false; this.buffer = "";
    if (this.abort) { try { this.abort.abort(); } catch {} this.abort = null; }
    const had = this.sources.length > 0;
    for (const s of this.sources) { try { s.onended = null; s.stop(); } catch {} } this.sources = []; this.playT = 0;
    if (had || why === "voix") this.emit("barge", { why, t: performance.now() });
    if (!silent && (had || this.state === "thinking" || this.state === "speaking")) this.set(this.voiceOn ? "listening" : "idle");
  }
  fail(msg, quiet = false) { if (!quiet) this.emit("error", { message: msg }); this.set("error"); setTimeout(() => { if (this.state === "error") this.set(this.voiceOn ? "listening" : "idle"); }, 2500); }
}
