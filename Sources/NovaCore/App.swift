import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

final class TVBox { var a: [Bool]; init(_ n: Int) { a = [Bool](repeating: false, count: n) } }
final class Bus {
    var subs: [Response] = []; let lock = NSLock()
    func add(_ r: Response) { lock.lock(); subs.append(r); lock.unlock() }
    func publish(_ ev: String, _ o: Any) {
        lock.lock(); subs = subs.filter { $0.sse(ev, o) }; lock.unlock()
    }
    func heartbeat() { lock.lock(); subs = subs.filter { $0.chunk(Data(": ping\n\n".utf8)) }; lock.unlock() }
}

public final class NovaApp {
    static var tvCache: [String: (Date, [[String: Any]])] = [:]
    static func tvFetch(_ u: String, timeout: TimeInterval) -> (Int, Data) {
        guard let url = URL(string: u) else { return (0, Data()) }
        var r = URLRequest(url: url)
        r.setValue("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15", forHTTPHeaderField: "User-Agent")
        if let h = url.host, let sc = url.scheme { r.setValue("\(sc)://\(h)/", forHTTPHeaderField: "Referer"); r.setValue("\(sc)://\(h)", forHTTPHeaderField: "Origin") }
        return syncGet(r, timeout: timeout)
    }
    public let keys: KeyStore
    public let settings = Settings()
    public let memory = Memory()
    public let convs = Conversations()
    public let router: Router
    public let tools: Tools
    public let voice: Voice
    public let briefs: Briefs
    public let dots: Dots
    public let server: HTTPServer
    let bus: Bus
    public let scheduler: DotScheduler
    public static let version = "1.0.0"

    public init(keys: KeyStore, webDir: String?, token: String? = nil) {
        self.keys = keys
        let bus = Bus(); self.bus = bus
        router = Router(keys: keys)
        tools = Tools(memory: memory)
        voice = Voice(keys: keys, settings: settings)
        let vv = voice; Tools.transcriber = { p in vv.transcribeFile(p) }
        briefs = Briefs(router: router, tools: tools, settings: settings)
        dots = Dots(router: router, tools: tools, settings: settings)
        scheduler = DotScheduler(dots: dots, settings: settings, briefs: briefs, publish: { ev, o in bus.publish(ev, o) })
        do {   // commandes internes de Nova pilotables par l'assistant (outil « app »)
            let st = settings, sch = scheduler, ds = dots, br = briefs, bs = bus
            Tools.appHook = { cmd in
                let p = cmd.split(separator: " ", maxSplits: 2, omittingEmptySubsequences: true).map(String.init); guard let verb = p.first?.lowercased() else { return "Commande vide." }
                switch verb {
                case "go": guard p.count > 1 else { return "go <onglet>" }; bs.publish("nav", ["tab": p[1]]); return "Onglet « \(p[1]) » ouvert."
                case "dot":
                    guard p.count > 1, let d = ds.list().first(where: { ($0["id"] as? String) == p[1] || ($0["name"] as? String)?.lowercased() == p[1].lowercased() }) else { return "Dot introuvable. Dots : " + ds.list().compactMap { $0["id"] as? String }.joined(separator: ", ") }
                    sch.launch(d, task: p.count > 2 ? p[2] : "", manual: true); return "Dot « \(d["name"] ?? "") » lancé."
                case "set":
                    guard p.count > 2 else { return "set <réglage> <valeur>" }
                    // Liste blanche : l'assistant ne touche jamais au pont téléphone, aux racines de fichiers ni aux clés.
                    guard ["theme", "avatar", "notify", "voice", "economy_mode", "brain", "user_title", "name", "dots_auto", "corps_on", "dots_plafond"].contains(p[1]) else { return "Réglage « \(p[1]) » non modifiable par l'assistant." }
                    let v: Any = p[2] == "true" ? true : p[2] == "false" ? false : (Double(p[2]).map { $0 as Any } ?? p[2]); st.set([p[1]: v]); return "Réglage \(p[1]) = \(p[2])."
                case "brief":
                    let kind = p.count > 1 ? p[1] : "matin"; let label = (st.get("briefs", [[String: Any]]()).first { ($0["kind"] as? String) == kind }?["label"] as? String) ?? "Brief"
                    _ = br.generate(kind: kind, label: label, manual: true); return "Brief « \(label) » généré."
                case "status": return "Nova \(NovaApp.version) — \(ds.list().count) Dots."
                default: return "Commandes : go, dot, set, brief, status."
                }
            }
        }
        server = token.map { HTTPServer(token: $0) } ?? HTTPServer()
        server.staticDir = webDir
        Tools.selfDocsDir = webDir
        router.localModelPref = { let m = settings.get("local_model", ""); return m.isEmpty ? nil : m }(); router.bulkEconomy = settings.get("economy_mode", true)
        router.firstTokenTimeout = TimeInterval(settings.get("firstTokenTimeout", 9))
        briefs.onNew = { [bus, settings, briefs] b in
            bus.publish("brief", b)
            #if os(macOS)
            if settings.get("notify", true), (b["manual"] as? Bool) != true, !briefs.inQuietHours() {
                let t = ((b["title"] as? String) ?? "Brief").replacingOccurrences(of: "\"", with: "'")
                _ = Tools.osa("display notification \"Votre \(t) est prêt.\" with title \"Nova\" sound name \"Glass\"", timeout: 5)
            }
            #endif
        }
        routes()
    }

    @discardableResult public func start(port: Int = 0) throws -> Int {
        let p = try server.start(port: port)
        DispatchQueue.global().async { [self] in _ = keyStatus() }   // réchauffe le Trousseau en parallèle pendant que la fenêtre se charge
        bridgeInstall()   // pont téléphone (désactivé tant que l'utilisateur ne l'active pas)
        briefs.startScheduler()
        ameStart()
        Thread.detachNewThread { [memory] in while true { _ = memory.purgeExpired(); Thread.sleep(forTimeInterval: 6 * 3600) } }
        Thread.detachNewThread { [scheduler] in while true { Thread.sleep(forTimeInterval: 20); scheduler.tick() } }
        Thread.detachNewThread { [settings] in   // la base de connaissances se met à jour toute seule : au démarrage puis toutes les 6 h
            Thread.sleep(forTimeInterval: 10)
            while true { Knowledge.shared.scan(roots: settings.get("knowledge_roots", Knowledge.defaultRoots)); Thread.sleep(forTimeInterval: 6 * 3600) }
        }
        DispatchQueue.global().async { [router] in _ = router.engines(force: true) }   // réchauffe la détection du LLM local
        Thread.detachNewThread { [bus] in while true { Thread.sleep(forTimeInterval: 15); bus.heartbeat() } }
        return p
    }

    static let keySlots: [(String, String, String)] = [   // (id, libellé, service Nova)
        ("openrouter", "OpenRouter (GLM, Kimi, Claude, GPT, DeepSeek…)", "nova-openrouter"),
        ("elevenlabs", "ElevenLabs (voix)", "nova-elevenlabs"),
        ("anthropic", "Claude — API Anthropic directe", "nova-anthropic"),
        ("spark", "Spark / Muse AI", "nova-spark"),
        ("zai", "Z.ai (GLM direct)", "nova-zai"),
        ("moonshot", "Moonshot (Kimi direct)", "nova-moonshot"),
        ("openai", "OpenAI — GPT (API directe)", "nova-openai"),
        ("deepseek", "DeepSeek (API directe)", "nova-deepseek"),
        ("gemini", "Gemini — Google (API directe / clé Bionic)", "nova-gemini"),
        ("gateway", "Perplexity — passerelle Bionic", "nova-gateway"),
        ("omniroute", "OmniRoute — passerelle locale de modèles gratuits (127.0.0.1:20128)", "nova-omniroute"),
    ]

    func keyStatus() -> [[String: Any]] {
        let m: [String: [KeyRef]] = [
            "openrouter": [KnownKeys.openrouter, KnownKeys.openrouterNova], "elevenlabs": [KnownKeys.elevenlabs, KnownKeys.elevenlabsNova],
            "anthropic": [KnownKeys.anthropic, KnownKeys.anthropicAlt, KnownKeys.anthropicNova],
            "spark": [KnownKeys.spark, KnownKeys.sparkNova, KnownKeys.sparkOAuth], "zai": [KnownKeys.zai, KnownKeys.zaiNova], "moonshot": [KnownKeys.moonshot, KnownKeys.moonshotNova], "openai": [KnownKeys.openai, KnownKeys.openaiNova], "deepseek": [KnownKeys.deepseek, KnownKeys.deepseekNova], "gemini": [KnownKeys.geminiNova, KnownKeys.gemini], "gateway": [KnownKeys.gatewayNova, KnownKeys.gateway], "omniroute": [KnownKeys.omniroute]]
        (keys as? KeychainStore)?.warm(m.values.flatMap { $0 })
        var out: [[String: Any]] = []
        for (id, label, svc) in NovaApp.keySlots {
            let found = (m[id] ?? []).first { keys.value($0) != nil }
            out.append(["id": id, "label": label, "present": found != nil, "service": found?.service ?? svc, "services_cherches": (m[id] ?? []).map { $0.service }])
        }
        return out
    }

    func routes() {
        extraRoutes()
        let s = server
        // /api/state : réponse instantanée depuis un instantané (clés + cerveaux) gardé sur disque ; le Trousseau est relu en arrière-plan.
        let stateCache = JSONFile("state_cache.json"); let stateLock = NSLock(); var snap: [String: Any]? = nil
        func refreshSnap() { let f: [String: Any] = ["brains": router.healthSnapshot(), "keys": keyStatus()]; stateLock.lock(); snap = f; stateLock.unlock(); stateCache.write(f) }
        s.on("GET", "/api/state") { [self] _, res in
            stateLock.lock(); var cur = snap; stateLock.unlock()
            if cur == nil { let d = stateCache.read(default: [String: Any]()); if d["brains"] != nil { cur = d; stateLock.lock(); snap = d; stateLock.unlock() } }
            let first = cur == nil
            if first { refreshSnap(); stateLock.lock(); cur = snap; stateLock.unlock() } else { DispatchQueue.global().async { refreshSnap() } }
            res.json(["version": NovaApp.version, "settings": settings.all(), "brains": cur?["brains"] ?? [], "keys": cur?["keys"] ?? [],
                      "voice": ["elevenlabs_key": voice.elevenKeyPresent()], "unread_briefs": briefs.list().filter { ($0["read"] as? Bool) != true }.count,
                      "quiet": briefs.inQuietHours()])
        }
        s.on("POST", "/api/settings") { [self] req, res in
            settings.set(req.json)
            router.localModelPref = { let m = settings.get("local_model", ""); return m.isEmpty ? nil : m }(); router.bulkEconomy = settings.get("economy_mode", true)
            router.firstTokenTimeout = TimeInterval(settings.get("firstTokenTimeout", 9))
            res.json(["ok": true, "settings": settings.all()])
        }
        s.on("POST", "/api/keys") { [self] req, res in
            let j = req.json
            guard let id = j["id"] as? String, let v = (j["value"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines), v.count > 8,
                  let slot = NovaApp.keySlots.first(where: { $0.0 == id }) else { res.json(["error": "clé invalide"], status: 400); return }
            let ok = KeychainStore.save(service: slot.2, value: v)
            (keys as? KeychainStore)?.forget(); router.resetHealth()
            res.json(["ok": ok, "service": slot.2, "error": ok ? NSNull() : "écriture Trousseau impossible"])
        }
        s.on("POST", "/api/brains/toggle") { [self] req, res in
            let j = req.json; guard let id = j["id"] as? String else { res.json(["error": "id"], status: 400); return }
            if (j["enabled"] as? Bool) == false { router.disabled.insert(id) } else { router.disabled.remove(id) }
            res.json(["ok": true])
        }
        s.on("POST", "/api/brains/reset") { [self] _, res in router.resetHealth(); res.json(["ok": true]) }
        s.on("GET", "/api/discover") { [self] _, res in
            // Liste les VRAIS identifiants de modèles que chaque fournisseur accepte (évite de deviner « spark-1.4 »).
            var out: [[String: Any]] = []
            func probe(_ id: String, _ url: String, _ kr: KeyChain) {
                guard let k0 = kr.resolve(keys), let u = URL(string: url) else { out.append(["id": id, "etat": "sans_cle", "modeles": []]); return }
                var k = k0
                if let d = k.data(using: .utf8), d.first == UInt8(ascii: "{"), let o = parseJSON(d) { k = (o["api_key"] as? String) ?? (o["access_token"] as? String) ?? k }
                var rq = URLRequest(url: u); rq.setValue("Bearer " + k, forHTTPHeaderField: "Authorization")
                let (st, d) = syncGet(rq, timeout: 10)
                let arr = ((parseJSON(d)?["data"] as? [[String: Any]]) ?? []).compactMap { $0["id"] as? String }
                out.append(["id": id, "etat": st == 200 ? "ok" : "HTTP \(st)", "modeles": arr])
            }
            probe("spark", "https://api.meta.ai/v1/models", KeyChain([KnownKeys.spark, KnownKeys.sparkNova, KnownKeys.sparkOAuth]))
            probe("gemini", "https://generativelanguage.googleapis.com/v1beta/openai/models", KeyChain([KnownKeys.geminiNova, KnownKeys.gemini]))
            res.json(["fournisseurs": out])
        }
        s.on("POST", "/api/diagnose") { [self] req, res in
            let ids = req.json["ids"] as? [String]
            var rows = router.diagnose(ids: ids)
            // Voix : test réel (aucun son produit : on lit seulement les métadonnées de la voix choisie)
            var v: [String: Any] = ["id": "elevenlabs", "label": "ElevenLabs (voix)"]
            if let k = Voice.elKeys.resolve(keys) {
                var rq = URLRequest(url: URL(string: "\(Voice.base)/v1/voices/\(settings.get("voice_id", ""))")!); rq.setValue(k, forHTTPHeaderField: "xi-api-key")
                let (st, d) = syncGet(rq, timeout: 10)
                v["etat"] = st == 200 ? "ok" : "panne"; v["detail"] = st == 200 ? "voix \(settings.get("voice_id", "")) trouvée (\((parseJSON(d)?["name"] as? String) ?? "?"))" : "HTTP \(st) \(shortError(String(data: d, encoding: .utf8) ?? "", 120))"
            } else { v["etat"] = "sans_cle"; v["detail"] = "aucune clé elevenlabs-api-key dans le Trousseau" }
            rows.append(v)
            let eng = router.engines(force: true)
            rows.append(["id": "local-engine", "label": "Moteurs locaux", "etat": eng.isEmpty ? "absent" : "ok",
                         "detail": eng.isEmpty ? "ni Ollama (11434) ni LM Studio (1234) ne répondent" : eng.map { "\($0.name): \($0.models.joined(separator: ", "))" }.joined(separator: " ; ")])
            res.json(["rows": rows, "ts": nowISO()])
        }

        // Conversation en flux
        s.on("POST", "/api/chat") { [self] req, res in
            let j = req.json
            guard let text = (j["text"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else { res.json(["error": "texte vide"], status: 400); return }
            let cid = (j["conversation_id"] as? String).flatMap { convs.get($0) != nil ? $0 : nil } ?? convs.create()
            let spoken = (j["voice"] as? Bool) == true
            let remote = req.headers["x-nova-remote"] == "1"   // depuis le téléphone : jamais d'outils (pas d'actions sur le Mac)
            let useTools = remote ? false : ((j["tools"] as? Bool) ?? true)
            convs.append(cid, role: "user", content: text)
            res.sseStart(); res.sse("meta", ["conversation_id": cid])
            let sys = Persona.system(name: settings.get("name", "Nova"), title: settings.get("user_title", "Utilisateur"), memory: memory.promptBlock(), voice: spoken, tools: useTools, extra: Knowledge.shared.promptBlock(query: text) + NovaApp.depthPrompt((j["depth"] as? Int) ?? 1))
            let agent = Agent(router: router, tools: tools)
            var answer = ""; var brainLabel = ""
            let pref = (j["brain"] as? String) ?? settings.get("brain", "auto")
            let mode = (j["mode"] as? String) ?? (spoken ? "fast" : "fast")
            agent.run(messages: convs.history(cid), system: sys, mode: mode, preferred: pref, maxTokens: spoken ? 500 : 1800, useTools: useTools, maxSteps: spoken ? 3 : 5, cancel: { res.clientGone }) { ev in
                switch ev {
                case .start(let id, let l): brainLabel = l; res.sse("brain", ["id": id, "label": l])
                case .delta(let t): answer += t; res.sse("delta", ["t": t])
                case .failover(let f, let t, let r, _): res.sse("failover", ["from": f, "to": t, "reason": r])
                case .tool(let n, let i, let o): res.sse("tool", ["name": n, "input": String(i.prefix(300)), "output": String(o.prefix(600))])
                case .usage(let i, let o): res.sse("usage", ["in": i, "out": o])
                case .error(let m): res.sse("error", ["message": m])
                case .done(let id, let l): res.sse("done", ["brain": id, "label": l])
                }
            }
            if !answer.isEmpty { convs.append(cid, role: "assistant", content: answer, brain: brainLabel) }
        }
        Tools.confirmHook = { [bus] e in bus.publish("confirm", e) }
        s.on("POST", "/api/confirm") { req, res in res.json(["message": Tools.decide(id: req.json["id"] as? String ?? "", ok: req.json["ok"] as? Bool ?? false, freeMinutes: req.json["free_minutes"] as? Int ?? 0)]) }
        s.on("GET", "/api/conversations") { [self] _, res in res.json(["items": convs.list()]) }
        // Télé en ligne (IPTV) : listes publiques iptv-org (GitHub) par pays ou par langue ; on les lit à la demande, rien n'est stocké.
        s.on("GET", "/api/tv/channels") { req, res in
            let key = (req.query["country"] ?? "bf").lowercased()
            guard key.range(of: "^[a-z]{2,3}$", options: .regularExpression) != nil else { res.json(["error": "pays invalide"], status: 400); return }
            let path = key == "fra" || key == "eng" || key == "por" || key == "ara" ? "languages/\(key)" : "countries/\(key)"
            var r = URLRequest(url: URL(string: "https://iptv-org.github.io/iptv/\(path).m3u")!); r.setValue("Nova/1.0", forHTTPHeaderField: "User-Agent")
            let (st, d) = syncGet(r, timeout: 15)
            guard st == 200, let txt = String(data: d, encoding: .utf8) else { res.json(["error": "Liste de chaînes injoignable (HTTP \(st))", "items": [Any]()], status: 502); return }
            var items: [[String: Any]] = []; var meta: [String: String]? = nil
            func attr(_ l: String, _ k: String) -> String { guard let r = l.range(of: k + "=\"[^\"]*\"", options: .regularExpression) else { return "" }; return String(l[r].dropFirst(k.count + 2).dropLast()) }
            for raw in txt.split(whereSeparator: \.isNewline) {
                let l = raw.trimmingCharacters(in: .whitespaces)
                if l.hasPrefix("#EXTINF") { meta = ["name": l.split(separator: ",", maxSplits: 1).last.map(String.init)?.trimmingCharacters(in: .whitespaces) ?? "", "logo": attr(l, "tvg-logo"), "group": attr(l, "group-title")] }
                else if l.hasPrefix("http"), let m = meta { items.append(["name": m["name"] ?? "", "logo": m["logo"] ?? "", "group": m["group"] ?? "", "url": l]); meta = nil }
            }
            if key == "bf" {   // Favoris Burkina épinglés (liens GitHub iptv-org vérifiés), toujours en tête
                let pins: [(String, String)] = [("RTB (Télévision nationale)", "https://edge12.vedge.infomaniak.com/livecast/ik:rtblive1_8/manifest.m3u8"), ("RTB 3", "https://edge13.vedge.infomaniak.com/livecast/ik:rtb3-1/manifest.m3u8"), ("Savane TV", "https://savane24.tv:5443/LiveApp/streams/Y4fyif69Q0ll6MeH2190896734859843.m3u8"), ("Filinfo TV", "https://d2iqjnqfr8pv3b.cloudfront.net/out/v1/d09d2fc718404cd8bccd3eba2444dd70/index.m3u8"), ("Impact TV", "https://edge11.vedge.infomaniak.com/livecast/ik:impacttv-2/manifest.m3u8"), ("Canal 3", "https://cs2.push2stream.com/CANAL3BENIN/playlist.m3u8")]
                for p in pins.reversed() { items.removeAll { ($0["url"] as? String) == p.1 }; items.insert(["name": p.0, "logo": "", "group": "Burkina", "url": p.1], at: 0) }
            }
            let qf = (req.query["q"] ?? "").trimmingCharacters(in: .whitespaces)
            if !qf.isEmpty, let rx = try? NSRegularExpression(pattern: String(qf.prefix(200)), options: .caseInsensitive) {
                items = items.filter { o in let n = ((o["name"] as? String) ?? "") + " " + ((o["group"] as? String) ?? ""); return rx.firstMatch(in: n, range: NSRange(n.startIndex..., in: n)) != nil }
            }
            // Test automatique : on ne garde que les chaînes qui répondent vraiment (en parallèle, 6 s max), les favorites d'abord.
            let ck = key + "|" + qf
            if let c = Self.tvCache[ck], Date().timeIntervalSince(c.0) < 600 { res.json(["items": c.1, "source": "iptv-org (GitHub) — chaînes testées"]); return }
            let fav = try? NSRegularExpression(pattern: "france ?24|tv5|africa ?24|africanews|euronews|rtb|bf1|rti|canal ?3|savane|filinfo|impact|2m|ortm|crtv|lcm|tele ?sahel|tm1|bbc|cnn|al ?jazeera|dw", options: .caseInsensitive)
            var cand = items
            cand.sort { a, b in
                func f(_ o: [String: Any]) -> Int { let n = (o["name"] as? String) ?? ""; return fav?.firstMatch(in: n, range: NSRange(n.startIndex..., in: n)) != nil ? 0 : 1 }
                return f(a) < f(b)
            }
            cand = Array(cand.prefix(qf.isEmpty ? 80 : 120))
            let box = TVBox(cand.count); let lock = NSLock()
            let urls: [String] = cand.map { ($0["url"] as? String) ?? "" }
            let grp = DispatchGroup(); let tq = OperationQueue(); tq.maxConcurrentOperationCount = 48
            for i in 0..<cand.count {
                grp.enter()
                tq.addOperation {
                    defer { grp.leave() }
                    let (st, d) = Self.tvFetch(urls[i], timeout: 5)
                    guard st == 200, d.count > 7, String(data: d.prefix(7), encoding: .utf8) == "#EXTM3U" else { return }
                    lock.lock(); box.a[i] = true; lock.unlock()
                }
            }
            _ = grp.wait(timeout: .now() + 16)
            lock.lock(); let alive = box.a; lock.unlock(); tq.cancelAllOperations()
            var ok: [[String: Any]] = []
            for (i, o) in cand.enumerated() where alive[i] {
                var o = o; let u = urls[i]
                o["url"] = "/api/tv/stream?u=" + (u.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? ""); ok.append(o)
            }
            if !ok.isEmpty { Self.tvCache[ck] = (Date(), ok) }
            res.json(["items": ok, "tested": cand.count, "source": "iptv-org (GitHub) — chaînes testées", "error": ok.isEmpty ? "Aucune chaîne de cette liste ne répond pour l'instant — essaie un autre pays ou « Toutes chaînes en français »." : ""])
        }
        // Relais vidéo local : ajoute les en-têtes que les chaînes exigent et réécrit les listes HLS pour que tout passe par Nova.
        s.on("GET", "/api/tv/stream") { req, res in
            guard let u = req.query["u"], let url = URL(string: u), ["http", "https"].contains(url.scheme ?? ""), let host = url.host, !Tools.isInternalHost(host) else { res.json(["error": "url invalide"], status: 400); return }
            let (st, d) = Self.tvFetch(u, timeout: 15)
            guard st == 200 else { res.data(Data(), type: "text/plain", status: st == 0 ? 502 : st); return }
            let isPl = String(data: d.prefix(7), encoding: .utf8) == "#EXTM3U"
            if !isPl { res.data(d, type: u.contains(".m3u8") ? "application/vnd.apple.mpegurl" : (u.contains(".ts") ? "video/mp2t" : "application/octet-stream")); return }
            func prox(_ ref: String) -> String { guard let abs = URL(string: ref, relativeTo: url)?.absoluteURL.absoluteString else { return ref }; return "/api/tv/stream?u=" + (abs.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? "") }
            var out: [String] = []
            for raw in (String(data: d, encoding: .utf8) ?? "").components(separatedBy: .newlines) {
                let l = raw.trimmingCharacters(in: .whitespaces)
                if l.isEmpty { continue }
                if l.hasPrefix("#") {
                    if let r = l.range(of: "URI=\"[^\"]*\"", options: .regularExpression) {
                        let inner = String(l[r].dropFirst(5).dropLast()); out.append(l.replacingCharacters(in: r, with: "URI=\"" + prox(inner) + "\""))
                    } else { out.append(l) }
                } else { out.append(prox(l)) }
            }
            res.data(Data(out.joined(separator: "\n").utf8), type: "application/vnd.apple.mpegurl")
        }
        // Radios du monde (annuaire communautaire radio-browser.info) : recherche par pays (code ISO) et/ou nom ; on ne garde que les flux qui répondent bien.
        s.on("GET", "/api/radio/search") { req, res in
            func enc(_ v: String) -> String { v.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed)?.replacingOccurrences(of: "&", with: "%26") ?? "" }
            var q = "hidebroken=true&order=clickcount&reverse=true&limit=\(min(120, Int(req.query["limit"] ?? "") ?? 60))"
            let cc = (req.query["country"] ?? "").uppercased(), name = req.query["name"] ?? "", tag = req.query["tag"] ?? ""
            if cc.count == 2 { q += "&countrycode=" + enc(cc) }
            if !name.isEmpty { q += "&name=" + enc(name) }
            if !tag.isEmpty { q += "&tag=" + enc(tag) }
            if let off = Int(req.query["offset"] ?? ""), off > 0 { q += "&offset=\(off)" }
            var items: [[String: Any]]? = nil; var err = ""
            for host in ["de1", "de2", "nl1", "at1"] {
                guard let u = URL(string: "https://\(host).api.radio-browser.info/json/stations/search?" + q) else { continue }
                var r = URLRequest(url: u); r.setValue("Nova/1.0", forHTTPHeaderField: "User-Agent")
                let (st, d) = syncGet(r, timeout: 10)
                if st == 200, let arr = (try? JSONSerialization.jsonObject(with: d)) as? [[String: Any]] { items = arr; break }
                err = "HTTP \(st)"
            }
            guard let arr = items else { res.json(["error": "Annuaire radio injoignable (\(err))", "items": [Any]()], status: 502); return }
            var seen = Set<String>()
            let out: [[String: Any]] = arr.compactMap { o in
                let url = ((o["url_resolved"] as? String).flatMap { $0.isEmpty ? nil : $0 }) ?? (o["url"] as? String) ?? ""
                guard url.hasPrefix("http"), let n = (o["name"] as? String)?.trimmingCharacters(in: .whitespaces), !n.isEmpty, seen.insert(n.lowercased()).inserted else { return nil }
                return ["name": n, "url": url, "country": o["country"] ?? "", "cc": o["countrycode"] ?? "", "tags": o["tags"] ?? "", "codec": o["codec"] ?? "", "bitrate": o["bitrate"] ?? 0, "votes": o["votes"] ?? 0, "favicon": o["favicon"] ?? ""]
            }
            res.json(["items": out])
        }
        s.on("GET", "/api/conversation") { [self] req, res in res.json(convs.get(req.query["id"] ?? "") ?? [:]) }
        s.on("POST", "/api/conversation/delete") { [self] req, res in convs.delete(req.json["id"] as? String ?? ""); res.json(["ok": true]) }

        // Voix
        s.on("POST", "/api/tts") { [self] req, res in voice.speak(text: (req.json["text"] as? String) ?? "", res: res) }
        s.on("POST", "/api/stt") { [self] req, res in
            let r = voice.transcribe(audio: req.body, mime: req.headers["content-type"] ?? "audio/wav")
            res.json(r.text != nil ? ["text": r.text!] : ["error": r.error ?? "échec"], status: r.text != nil ? 200 : 502)
        }

        // Mémoire
        s.on("GET", "/api/memory") { [self] _, res in res.json(["items": memory.list()]) }
        s.on("POST", "/api/memory/add") { [self] req, res in res.json(["item": memory.add(req.json["text"] as? String ?? "") as Any? ?? NSNull()]) }
        s.on("POST", "/api/memory/remove") { [self] req, res in memory.remove(req.json["id"] as? String ?? ""); res.json(["ok": true]) }
        s.on("POST", "/api/memory/update") { [self] req, res in
            let ok = memory.update(req.json["id"] as? String ?? "", text: req.json["text"] as? String ?? ""); res.json(["ok": ok], status: ok ? 200 : 404) }
        s.on("POST", "/api/conversations/rename") { [self] req, res in
            let ok = convs.rename(req.json["id"] as? String ?? "", title: req.json["title"] as? String ?? ""); res.json(["ok": ok], status: ok ? 200 : 404) }
        s.on("POST", "/api/drafts/remove") { [self] req, res in   // supprime un brouillon (jamais un envoi) ; modifiable via /api/drafts/update
            let id = req.json["id"] as? String ?? ""; var l = tools.drafts.read(default: [[String: Any]]()); let n = l.count
            l.removeAll { ($0["id"] as? String) == id }; tools.drafts.write(l); res.json(["ok": l.count < n]) }
        s.on("POST", "/api/drafts/update") { [self] req, res in
            let id = req.json["id"] as? String ?? ""; var l = tools.drafts.read(default: [[String: Any]]())
            guard let i = l.firstIndex(where: { ($0["id"] as? String) == id }) else { res.json(["ok": false], status: 404); return }
            for k in ["subject", "body", "to"] { if let v = req.json[k] as? String { l[i][k] = v } }
            tools.drafts.write(l); res.json(["ok": true]) }
        s.on("POST", "/api/import/spark") { [self] req, res in
            let base = ((req.json["path"] as? String) ?? "~/spark-local/data") as NSString
            let dir = base.expandingTildeInPath; var n = 0
            for f in ["faits.json", "lecons.json", "memory.json", "objectifs.json"] {
                guard let d = FileManager.default.contents(atPath: dir + "/" + f), let o = try? JSONSerialization.jsonObject(with: d) else { continue }
                let arr: [Any] = (o as? [Any]) ?? ((o as? [String: Any]).map { Array($0.values) } ?? [])
                for it in arr {
                    var t: String? = nil
                    if let s = it as? String { t = s } else if let m = it as? [String: Any] { t = (m["texte"] ?? m["text"] ?? m["fait"] ?? m["titre"] ?? m["nom"] ?? m["lecon"] ?? m["objectif"]) as? String }
                    if let t = t, t.count > 3, memory.add(t, source: "import SparkLocal/" + f) != nil { n += 1 }
                }
            }
            res.json(["imported": n, "from": dir])
        }

        // Briefs
        s.on("GET", "/api/briefs") { [self] _, res in res.json(["items": briefs.list()]) }
        s.on("POST", "/api/briefs/run") { [self] req, res in
            let kind = (req.json["kind"] as? String) ?? "matin"
            let label = (settings.get("briefs", [[String: Any]]()).first { ($0["kind"] as? String) == kind }?["label"] as? String) ?? "Brief"
            res.json(briefs.generate(kind: kind, label: label, manual: true))
        }
        s.on("POST", "/api/briefs/read") { [self] req, res in briefs.markRead(req.json["id"] as? String ?? ""); res.json(["ok": true]) }
        s.on("POST", "/api/assistant/state") { [bus] req, res in bus.publish("assistant", req.json); res.json(["ok": true]) }
        s.on("GET", "/api/events") { [self] _, res in res.sseStart(); res.sse("hello", ["ts": nowISO()]); bus.add(res); while !res.clientGone { Thread.sleep(forTimeInterval: 1) } }

        // Dots
        s.on("GET", "/api/dots") { [self] _, res in res.json(["items": dots.list(), "runs": Array(dots.history().prefix(30))]) }
        s.on("GET", "/api/dots/waiting") { [self] _, res in res.json(["items": scheduler.waiting()]) }
        s.on("POST", "/api/dots/snooze") { [self] req, res in scheduler.snooze(runId: req.json["run_id"] as? String ?? "", minutes: (req.json["minutes"] as? Int) ?? 15); res.json(["ok": true]) }
        s.on("GET", "/api/memory/settings") { [self] _, res in res.json(memory.settings()) }
        s.on("POST", "/api/memory/settings") { [self] req, res in
            memory.configure(off: req.json["off"] as? Bool, sensitiveDays: req.json["sensitive_days"] as? Int)
            let n = memory.purgeExpired(); var o = memory.settings(); o["purged"] = n; res.json(o) }
        s.on("GET", "/api/memory/export") { [self] _, res in res.json(["exported": nowISO(), "items": memory.list(), "settings": memory.settings()]) }
        s.on("POST", "/api/dots/import") { [self] req, res in   // import idempotent : ne remplace jamais un Dot existant
            let have = Set(dots.list().compactMap { $0["id"] as? String }); var n = 0
            for d in (req.json["items"] as? [[String: Any]]) ?? [] { if let id = d["id"] as? String, id.hasPrefix("imp-"), !have.contains(id) { dots.save(d); n += 1 } }
            res.json(["imported": n]) }
        s.on("GET", "/api/actions") { _, res in res.json(["items": Array(Tools.actions.tail(300).reversed())]) }
        s.on("POST", "/api/actions/undo") { [self] req, res in res.json(["message": tools.undo(actionId: req.json["id"] as? String ?? "")]) }
        s.on("POST", "/api/dots/ack") { [self] req, res in scheduler.ack(runId: req.json["run_id"] as? String ?? ""); res.json(["ok": true]) }
        s.on("POST", "/api/dots/launch") { [self] req, res in
            guard let d = dots.list().first(where: { ($0["id"] as? String) == (req.json["id"] as? String) }) else { res.json(["error": "Dot introuvable"], status: 404); return }
            scheduler.launch(d, task: (d["id"] as? String) == "bilan" ? scheduler.bilanTask() : (req.json["task"] as? String) ?? "", manual: true); res.json(["ok": true])
        }
        s.on("GET", "/api/missions") { [self] _, res in res.json(["items": scheduler.missions.list()]) }
        s.on("POST", "/api/missions/add") { [self] req, res in
            let goal = (req.json["goal"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines), did = req.json["dot"] as? String ?? ""
            guard !goal.isEmpty, dots.list().contains(where: { ($0["id"] as? String) == did }) else { res.json(["error": "Dot ou objectif manquant"], status: 400); return }
            res.json(["item": scheduler.missions.add(dot: did, goal: goal, everyMin: (req.json["every_min"] as? Int) ?? 240)])
        }
        s.on("POST", "/api/missions/patch") { [self] req, res in
            let id = req.json["id"] as? String ?? ""; var p = [String: Any]()
            if let st = req.json["status"] as? String, ["active", "paused", "done"].contains(st) { p["status"] = st; if st == "active" { p["next_due"] = Date().timeIntervalSince1970 } }
            if let e = req.json["every_min"] as? Int { p["every_min"] = max(15, e) }
            scheduler.missions.patch(id, p); res.json(["ok": true])
        }
        s.on("POST", "/api/missions/answer") { [self] req, res in
            let id = req.json["id"] as? String ?? ""; let t = (req.json["text"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            guard !t.isEmpty else { res.json(["error": "Réponse vide"], status: 400); return }
            scheduler.missions.appendLog(id, who: "moi", text: t); scheduler.missions.patch(id, ["status": "active", "question": "", "next_due": Date().timeIntervalSince1970]); res.json(["ok": true])
        }
        s.on("POST", "/api/missions/remove") { [self] req, res in scheduler.missions.remove(req.json["id"] as? String ?? ""); res.json(["ok": true]) }
        s.on("POST", "/api/dots/save") { [self] req, res in dots.save(req.json); res.json(["ok": true]) }
        s.on("POST", "/api/dots/remove") { [self] req, res in dots.remove(req.json["id"] as? String ?? ""); res.json(["ok": true]) }
        s.on("POST", "/api/dots/run") { [self] req, res in
            res.sseStart()
            let r = dots.run(id: req.json["id"] as? String ?? "", task: req.json["task"] as? String ?? "", cancel: { res.clientGone }) { ev in
                switch ev {
                case .start(_, let l): res.sse("brain", ["label": l])
                case .delta(let t): res.sse("delta", ["t": t])
                case .tool(let n, let i, let o): res.sse("tool", ["name": n, "input": String(i.prefix(300)), "output": String(o.prefix(600))])
                case .failover(let f, let t, let rr, _): res.sse("failover", ["from": f, "to": t, "reason": rr])
                case .error(let m): res.sse("error", ["message": m])
                default: break
                }
            }
            res.sse("done", ["run": r ?? [:]])
        }
        s.on("GET", "/api/drafts") { [self] _, res in res.json(["items": tools.drafts.read(default: [[String: Any]]())] ) }
        s.on("GET", "/api/journal") { [self] _, res in res.json(["cerveaux": router.journal.tail(60), "voix": voice.journal.tail(40)]) }
    }
}
