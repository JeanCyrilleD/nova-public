import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

public final class Voice {
    public static var base = "https://api.elevenlabs.io"   // surchargé uniquement par les tests
    let keys: KeyStore
    let settings: Settings
    let journal = Journal("voix_journal.jsonl")
    static let elKeys = KeyChain([KnownKeys.elevenlabs, KnownKeys.elevenlabsNova])
    /// ElevenLabs limite les requêtes simultanées (429) : on les met en file (2 max) au lieu de basculer sur une autre voix en pleine phrase.
    static let gate = DispatchSemaphore(value: 2)
    public init(keys: KeyStore, settings: Settings) { self.keys = keys; self.settings = settings }

    public func elevenKeyPresent() -> Bool { Voice.elKeys.resolve(keys) != nil }

    /// Diffuse l'audio vers le navigateur. ElevenLabs en flux ; en cas d'échec, repli `say` ANNONCÉ par l'en-tête X-Nova-Voice.
    public func speak(text: String, res: Response) {
        let clean = text.replacingOccurrences(of: "\\*|#|_|`", with: "", options: .regularExpression).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { res.json(["error": "texte vide"], status: 400); return }
        let t0 = Date()
        var reason = "clé ElevenLabs introuvable"
        if let key = Voice.elKeys.resolve(keys) {
            let voice = settings.get("voice_id", "")
            let model = settings.get("voice_model", "eleven_multilingual_v2")
            var req = URLRequest(url: URL(string: "\(Voice.base)/v1/text-to-speech/\(voice)/stream?output_format=mp3_44100_64")!)
            req.httpMethod = "POST"
            req.setValue(key, forHTTPHeaderField: "xi-api-key"); req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.setValue("audio/mpeg", forHTTPHeaderField: "Accept")
            req.httpBody = jsonData(["text": clean, "model_id": model,
                                     "voice_settings": ["stability": 0.45, "similarity_boost": 0.8, "style": 0.25, "use_speaker_boost": true]])
            var first: Int? = nil
            Voice.gate.wait(); defer { Voice.gate.signal() }
            var r = HTTPStream.run(req, firstByteTimeout: 8, idleTimeout: 10, totalTimeout: 60, cancel: { res.clientGone }) { d in
                if first == nil {
                    first = Int(Date().timeIntervalSince(t0) * 1000)
                    res.head(200, "audio/mpeg", extra: ["X-Nova-Voice": "elevenlabs"])
                }
                return res.chunk(d)
            }
            var attempt = 1
            while first == nil, attempt < 3, !res.clientGone {   // échec avant le 1er octet : on réessaie la MÊME voix
                Thread.sleep(forTimeInterval: 0.7 * Double(attempt)); attempt += 1
                r = HTTPStream.run(req, firstByteTimeout: 8, idleTimeout: 10, totalTimeout: 60, cancel: { res.clientGone }) { d in
                    if first == nil { first = Int(Date().timeIntervalSince(t0) * 1000); res.head(200, "audio/mpeg", extra: ["X-Nova-Voice": "elevenlabs"]) }
                    return res.chunk(d)
                }
            }
            if first != nil {   // flux commencé : on ne peut plus basculer proprement, on s'arrête là
                journal.add(["moteur": "elevenlabs", "ok": r.error == nil, "premier_octet_ms": first!, "total_ms": Int(Date().timeIntervalSince(t0) * 1000), "chars": clean.count])
                return
            }
            reason = r.error ?? "réponse vide"
            journal.add(["moteur": "elevenlabs", "ok": false, "raison": shortError(reason, 160)])
        }
        // Repli annoncé — désactivé par défaut : une voix robotique qui prend le relais en pleine phrase est pire que le silence.
        if !settings.get("voice_fallback_say", false) {
            journal.add(["moteur": "aucun", "ok": false, "raison": shortError(reason, 100)])
            res.json(["error": "voix indisponible", "raison": reason], status: 503, extra: ["X-Nova-Voice": "aucune"]); return
        }
        #if os(macOS)
        let tmp = NSTemporaryDirectory() + "nova-" + UUID().uuidString + ".wav"
        let (c, _) = runProcess("/usr/bin/say", ["-v", "Thomas", "-o", tmp, "--file-format=WAVE", "--data-format=LEI16@22050", clean], timeout: 30)
        defer { try? FileManager.default.removeItem(atPath: tmp) }
        if c == 0, let d = FileManager.default.contents(atPath: tmp) {
            res.data(d, type: "audio/wav", extra: ["X-Nova-Voice": "say", "X-Nova-Voice-Reason": shortError(reason, 100).replacingOccurrences(of: "\n", with: " ")])
            journal.add(["moteur": "say", "ok": true, "repli_de": "elevenlabs", "raison": shortError(reason, 100)])
            return
        }
        #endif
        res.json(["error": "voix indisponible", "raison": reason], status: 503, extra: ["X-Nova-Voice": "aucune"])
    }

    /// Transcription : ElevenLabs Scribe d'abord ; si indisponible (réseau coupé, clé absente), whisper.cpp LOCAL (whisper-cli + modèle ggml).
    public func transcribe(audio: Data, mime: String, language: String = "fra") -> (text: String?, error: String?) {
        let r = transcribeCloud(audio: audio, mime: mime, language: language)
        if r.text != nil { return (r.text, nil) }
        if let loc = transcribeLocal(audio: audio) { journal.add(["stt": "whisper-local", "ok": true, "repli_de": "elevenlabs"]); return (loc, nil) }
        return r
    }
    public static func whisperPaths() -> (bin: String, model: String)? {
        let fm = FileManager.default; let home = fm.homeDirectoryForCurrentUser.path
        guard let bin = ["/opt/homebrew/bin/whisper-cli", "/usr/local/bin/whisper-cli"].first(where: { fm.isExecutableFile(atPath: $0) }) else { return nil }
        let model = ["ggml-small.bin", "ggml-base.bin", "ggml-large-v3-turbo.bin"].map { home + "/.whisper-models/" + $0 }.first(where: { fm.fileExists(atPath: $0) })
        return model.map { (bin, $0) }
    }
    func transcribeLocal(audio: Data) -> String? {
        guard let w = Voice.whisperPaths() else { return nil }
        let tmp = NSTemporaryDirectory() + "nova-stt-" + UUID().uuidString + ".wav"
        guard (try? audio.write(to: URL(fileURLWithPath: tmp))) != nil else { return nil }
        defer { try? FileManager.default.removeItem(atPath: tmp) }
        let (c, out) = runProcess(w.bin, ["-m", w.model, "-f", tmp, "-l", "fr", "-nt", "-np", "-t", "6"], timeout: 40)
        let t = out.trimmingCharacters(in: .whitespacesAndNewlines)
        return c == 0 && !t.isEmpty ? t : nil
    }
    /// Transcrit un FICHIER audio (m4a, mp3, wav, mp4…) du dossier personnel ; écrit « <nom> - transcription.txt » à côté. Cloud d'abord (longs fichiers OK), puis whisper local.
    public func transcribeFile(_ rawPath: String) -> String {
        let fm = FileManager.default; let home = fm.homeDirectoryForCurrentUser.path
        var p: String = rawPath.trimmingCharacters(in: CharacterSet(charactersIn: " \n\"'"))
        let known: [String] = ["Desktop", "Downloads", "Documents"]
        if p.hasPrefix("~") { p = (p as NSString).expandingTildeInPath }
        else if !p.hasPrefix("/") {
            let top: String = p.components(separatedBy: "/").first ?? ""
            p = home + "/" + (known.contains(top) ? "" : "Desktop/") + p
        } else if !p.hasPrefix(home) {
            for k in known { if let r = p.range(of: "/" + k + "/") { p = home + String(p[r.lowerBound...]); break } }
        }
        let blocked: [String] = ["/.ssh", "/.aws", "/.gnupg", "Keychains"]
        guard p.hasPrefix(home), !blocked.contains(where: { p.contains($0) }) else { return "Chemin refusé (hors dossier personnel)." }
        guard let d = fm.contents(atPath: p) else { return "Fichier introuvable : \(p). Liste le dossier avec shell (ls) pour trouver le nom exact." }
        let ext = (p as NSString).pathExtension.lowercased()
        let mimes: [String: String] = ["wav": "audio/wav", "mp3": "audio/mpeg", "m4a": "audio/mp4", "mp4": "video/mp4", "ogg": "audio/ogg", "webm": "audio/webm", "aac": "audio/aac", "flac": "audio/flac"]
        let mime: String = mimes[ext] ?? "audio/mp4"
        var text: String? = nil; var via = "ElevenLabs Scribe"; var err: String? = nil
        let r = transcribeCloud(audio: d, mime: mime, language: "fra", total: 600)
        text = r.text; err = r.error
        #if os(macOS)
        if text == nil, let w = Voice.whisperPaths() {
            let wav = NSTemporaryDirectory() + "nova-stt-" + UUID().uuidString + ".wav"
            defer { try? fm.removeItem(atPath: wav) }
            let (c, _) = runProcess("/usr/bin/afconvert", ["-f", "WAVE", "-d", "LEI16@16000", "-c", "1", p, wav], timeout: 300)
            if c == 0 {
                let (c2, out) = runProcess(w.bin, ["-m", w.model, "-f", wav, "-l", "fr", "-nt", "-np", "-t", "6"], timeout: 1800)
                let t = out.trimmingCharacters(in: .whitespacesAndNewlines)
                if c2 == 0 && !t.isEmpty { text = t; via = "whisper local" }
            }
        }
        #endif
        guard let t = text, !t.isEmpty else {
            return "Transcription impossible : \(err ?? "aucun moteur disponible"). Cause probable : clé ElevenLabs absente/réseau coupé et whisper-cli non installé (brew install whisper-cpp). Ne prétends pas avoir transcrit."
        }
        let outPath = (p as NSString).deletingPathExtension + " - transcription.txt"
        try? t.write(toFile: outPath, atomically: true, encoding: .utf8)
        journal.add(["stt_fichier": (p as NSString).lastPathComponent, "via": via, "car": t.count])
        return "TRANSCRIPTION COMPLÈTE (\(t.count) caractères, via \(via)) — enregistrée dans « \((outPath as NSString).lastPathComponent) » à côté de l'audio.\n\n" + String(t.prefix(7000)) + (t.count > 7000 ? "\n[…suite dans le fichier ; lis-la avec read_file par tranches]" : "")
    }
    func transcribeCloud(audio: Data, mime: String, language: String, total: TimeInterval = 40) -> (text: String?, error: String?) {
        guard let key = Voice.elKeys.resolve(keys) else { return (nil, "clé ElevenLabs introuvable (Trousseau : elevenlabs-api-key)") }
        let b = "----nova" + UUID().uuidString
        var body = Data()
        func field(_ n: String, _ v: String) { body.append(Data("--\(b)\r\nContent-Disposition: form-data; name=\"\(n)\"\r\n\r\n\(v)\r\n".utf8)) }
        field("model_id", "scribe_v1"); field("language_code", language); field("tag_audio_events", "false")
        let ext = mime.contains("wav") ? "wav" : (mime.contains("mp4") ? "m4a" : (mime.contains("ogg") ? "ogg" : "webm"))
        body.append(Data("--\(b)\r\nContent-Disposition: form-data; name=\"file\"; filename=\"voix.\(ext)\"\r\nContent-Type: \(mime)\r\n\r\n".utf8))
        body.append(audio); body.append(Data("\r\n--\(b)--\r\n".utf8))
        var req = URLRequest(url: URL(string: "\(Voice.base)/v1/speech-to-text")!)
        req.httpMethod = "POST"; req.httpBody = body
        req.setValue(key, forHTTPHeaderField: "xi-api-key"); req.setValue("multipart/form-data; boundary=\(b)", forHTTPHeaderField: "Content-Type")
        var out = Data(); let t0 = Date()
        let r = HTTPStream.run(req, firstByteTimeout: total > 60 ? 300 : 20, idleTimeout: total > 60 ? 300 : 20, totalTimeout: total) { out.append($0); return true }
        if let e = r.error { journal.add(["stt": "elevenlabs", "ok": false, "err": shortError(e, 120)]); return (nil, e) }
        let txt = (parseJSON(out)?["text"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
        journal.add(["stt": "elevenlabs", "ok": txt != nil, "ms": Int(Date().timeIntervalSince(t0) * 1000), "bytes": audio.count])
        return (txt, txt == nil ? "réponse sans texte" : nil)
    }
}
