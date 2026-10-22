#!/usr/bin/env python3
"""Faux fournisseurs pour tester le routeur sans réseau ni argent : 402 avec « can only afford », 401, 429, silence (timeout), flux OpenAI et Anthropic réels en forme."""
import json, sys, time, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import struct, math
STT_CALLS = []; STT_TEXT = ["Bonjour Nova, quelle heure est-il ?"]
def _wav(sec=0.9, sr=22050):
    n = int(sr * sec); pcm = b"".join(struct.pack("<h", int(9000 * math.sin(2 * math.pi * 330 * i / sr) * (1 if i % 5500 < 4500 else 0.5))) for i in range(n))
    return b"RIFF" + struct.pack("<I", 36 + len(pcm)) + b"WAVEfmt " + struct.pack("<IHHIIHH", 16, 1, 1, sr, sr * 2, 2, 16) + b"data" + struct.pack("<I", len(pcm)) + pcm
TONE = _wav(6.0)
BEHAVIOR = {}   # id -> comportement
CALLS = []

def sse_openai(w, words):
    w.send_response(200); w.send_header("Content-Type", "text/event-stream"); w.end_headers()
    for x in words:
        w.wfile.write(("data: " + json.dumps({"choices": [{"delta": {"content": x}}]}) + "\n\n").encode()); w.wfile.flush(); time.sleep(0.02)
    w.wfile.write(("data: " + json.dumps({"choices": [], "usage": {"prompt_tokens": 11, "completion_tokens": len(words)}}) + "\n\n").encode())
    w.wfile.write(b"data: [DONE]\n\n"); w.wfile.flush()

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        if self.path.endswith("/models"):
            body = json.dumps({"data": [{"id": "qwen-test:7b"}, {"id": "nomic-embed"}]}).encode()
            self.send_response(200); self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(body)
        else:
            self.send_response(404); self.end_headers()
    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0)); raw = self.rfile.read(n)
        try: body = json.loads(raw or b"{}")
        except Exception: body = {}
        if self.path.startswith("/eleven/"):
            if "speech-to-text" in self.path:
                STT_CALLS.append(n); out = json.dumps({"text": STT_TEXT[0]}).encode(); self.send_response(200); self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(out); return
            self.send_response(200); self.send_header("Content-Type", "audio/mpeg"); self.end_headers(); self.wfile.write(TONE); return
        parts = self.path.strip("/").split("/"); bid = parts[0] if parts[0] not in ("v1",) else "local"
        beh = BEHAVIOR.get(bid, "ok"); CALLS.append((bid, beh, body.get("max_tokens")))
        if self.path == "/__behavior":
            BEHAVIOR.clear(); BEHAVIOR.update(body); self.send_response(200); self.end_headers(); return
        if self.path == "/__calls":
            self.send_response(200); self.end_headers(); self.wfile.write(json.dumps(CALLS).encode()); return
        msgs0 = body.get("messages") or []
        if msgs0 and "RÉSULTAT DE L'OUTIL" in (msgs0[-1].get("content") or ""):
            return sse_openai(self, ["Voici ", "le résultat : ", msgs0[-1]["content"].split("\n")[1][:40]])
        if beh == "402":
            self.send_response(402); self.send_header("Content-Type", "application/json"); self.end_headers()
            self.wfile.write(json.dumps({"error": {"message": "Insufficient credits"}}).encode()); return
        if beh == "afford":
            if (body.get("max_tokens") or 0) > 400:
                self.send_response(402); self.send_header("Content-Type", "application/json"); self.end_headers()
                self.wfile.write(json.dumps({"error": {"message": "This request requires more credits, or fewer max_tokens. You requested up to 8200 tokens, but can only afford 300"}}).encode()); return
            return sse_openai(self, ["Bonjour ", "depuis ", "le solde réduit."])
        if beh == "401":
            self.send_response(401); self.end_headers(); self.wfile.write(b'{"error":{"message":"bad key"}}'); return
        if beh == "429":
            self.send_response(429); self.end_headers(); self.wfile.write(b'{"error":{"message":"rate"}}'); return
        if beh == "hang":
            time.sleep(8); return
        if beh == "keepalive":   # octets de maintien mais aucun mot : doit basculer au délai « premier mot »
            self.send_response(200); self.send_header("Content-Type", "text/event-stream"); self.end_headers()
            for _ in range(40):
                try: self.wfile.write(b": OPENROUTER PROCESSING\n\n"); self.wfile.flush()
                except Exception: return
                time.sleep(0.25)
            return
        if beh == "tool":
            return sse_openai(self, ["Je regarde. ", '<tool name="recall">', "test", "</tool>"])
        if bid.endswith("direct") and "claude" in bid:
            self.send_response(200); self.send_header("Content-Type", "text/event-stream"); self.end_headers()
            for t in ["Salut ", "de ", "Claude."]:
                self.wfile.write(("event: content_block_delta\ndata: " + json.dumps({"type": "content_block_delta", "delta": {"type": "text_delta", "text": t}}) + "\n\n").encode()); self.wfile.flush()
            self.wfile.write(("event: message_delta\ndata: " + json.dumps({"type": "message_delta", "usage": {"input_tokens": 5, "output_tokens": 3}}) + "\n\n").encode()); return
        msgs = body.get("messages") or []
        last = (msgs[-1].get("content") if msgs else "") or ""
        if "RÉSULTAT DE L'OUTIL" in last:
            return sse_openai(self, ["Voici ", "le résultat : ", last.split("\n")[1][:40]])
        sse_openai(self, [f"Réponse ", f"de {bid}."])

def serve(port):
    s = ThreadingHTTPServer(("127.0.0.1", port), H); threading.Thread(target=s.serve_forever, daemon=True).start(); return s

if __name__ == "__main__":
    serve(int(sys.argv[1]) if len(sys.argv) > 1 else 9100)
    try:
        serve(11434)
    except OSError: pass
    while True: time.sleep(3600)
