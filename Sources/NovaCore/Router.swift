import Foundation

public struct BrainHealth {
    public var ok = 0, fail = 0
    public var lastLatencyMs: Int? = nil
    public var lastError: String? = nil
    public var lastKind: String? = nil
    public var deadUntil: Date? = nil
    public var lastOK: Date? = nil
}

/// Routeur : essaie les cerveaux dans l'ordre, bascule sur tout échec avant le premier mot,
/// mémorise les pannes (disjoncteur) et finit toujours par le moteur local s'il existe.
public final class Router {
    public let runner: BrainRunner
    public var brains: [BrainSpec]
    public let journal = Journal("cerveaux_journal.jsonl")
    let lock = NSLock()
    var health: [String: BrainHealth] = [:]
    var localCache: (Date, [LocalEngine]) = (.distantPast, [])
    public var localModelPref: String? = nil
    public var disabled: Set<String> = []
    public var firstTokenTimeout: TimeInterval = 9
    let creditLock = NSLock(); var creditDeadUntil: [String: Date] = [:]

    public init(keys: KeyStore, brains: [BrainSpec] = Catalog.defaults()) {
        runner = BrainRunner(keys: keys); self.brains = brains
    }

    public func engines(force: Bool = false) -> [LocalEngine] {
        lock.lock(); let c = localCache; lock.unlock()
        if !force && Date().timeIntervalSince(c.0) < (c.1.isEmpty ? 2 : 15) { return c.1 }
        let e = LocalProbe.detect()
        lock.lock(); localCache = (Date(), e); lock.unlock()
        return e
    }

    /// Spécification du cerveau local courant (premier moteur détecté, modèle préféré sinon premier modèle).
    public func localSpec() -> BrainSpec? {
        guard let e = engines().first else { return nil }
        let model = (localModelPref.flatMap { e.models.contains($0) ? $0 : nil }) ?? e.models.first!
        return BrainSpec(id: "local", label: "Local · \(model) (\(e.name))", kind: .local,
                         baseURL: e.base + "/v1/chat/completions", model: model, keys: KeyChain([]), tags: ["local"],
                         note: "Fonctionne sans réseau.")
    }

    public func spec(_ id: String) -> BrainSpec? { brains.first { $0.id == id } ?? (id == "local" ? localSpec() : nil) }

    func isDead(_ id: String) -> Bool {
        lock.lock(); defer { lock.unlock() }
        if let d = health[id]?.deadUntil, d > Date() { return true }
        return false
    }
    func note(_ id: String, ok: Bool, ms: Int?, err: BrainFailure?) {
        lock.lock(); defer { lock.unlock() }
        var h = health[id] ?? BrainHealth()
        if ok { h.ok += 1; h.lastLatencyMs = ms; h.lastOK = Date(); h.deadUntil = nil; h.lastError = nil; h.lastKind = nil }
        else if let e = err, e.kind != .canceled {
            h.fail += 1; h.lastError = e.message; h.lastKind = e.kind.rawValue
            let cool: TimeInterval = e.kind == .credit || e.kind == .auth ? 1800 : (e.kind == .model ? 3600 : (e.kind == .rate ? 45 : 30))
            h.deadUntil = Date().addingTimeInterval(cool)
        }
        health[id] = h
    }
    public func resetHealth(_ id: String? = nil) { lock.lock(); if let i = id { health[i] = nil } else { health.removeAll() }; lock.unlock() }

    public func status(_ s: BrainSpec) -> (String, String) {   // (état, détail)
        if disabled.contains(s.id) { return ("desactive", "désactivé par vous") }
        if s.kind != .local, s.keys.resolve(runner.keys) == nil { return ("sans_cle", "aucune clé trouvée dans le Trousseau") }
        lock.lock(); let h = health[s.id]; lock.unlock()
        if let d = h?.deadUntil, d > Date() { return ("panne", "\(h?.lastKind ?? "?") : \(h?.lastError ?? "") — nouvel essai dans \(Int(d.timeIntervalSinceNow)) s") }
        if h?.lastOK != nil { return ("ok", "répond (\(h?.lastLatencyMs ?? 0) ms)") }
        return ("non_teste", "clé présente, pas encore testé")
    }

    public func healthSnapshot() -> [[String: Any]] {
        var out: [[String: Any]] = []
        var all = brains
        if let l = localSpec() { all.append(l) }
        (runner.keys as? KeychainStore)?.warm(Array(Set(all.flatMap { $0.keys.refs })))   // lectures du Trousseau en parallèle
        for s in all {
            let (st, det) = s.id == "local" ? ("ok", "moteur local détecté") : status(s)
            lock.lock(); let h = health[s.id] ?? BrainHealth(); lock.unlock()
            out.append(["id": s.id, "label": s.label, "model": s.model, "kind": "\(s.kind)", "etat": st, "detail": det,
                        "ok": h.ok, "echecs": h.fail, "latence_ms": h.lastLatencyMs as Any? ?? NSNull(), "note": s.note, "tags": Array(s.tags).sorted()])
        }
        if all.last?.id != "local" { out.append(["id": "local", "label": "Local (aucun moteur détecté)", "model": "", "kind": "local",
                                                 "etat": "absent", "detail": "Lance Ollama ou LM Studio ; Nova le détecte seul.", "ok": 0, "echecs": 0,
                                                 "latence_ms": NSNull(), "note": "", "tags": ["local"]]) }
        return out
    }

    /// Ordre effectif : préféré en tête, puis l'ordre du mode, puis le reste, local à la fin. Les cerveaux sans clé ou en panne sont sautés.
    nonisolated(unsafe) public var bulkEconomy = true
    public func plan(mode: String, preferred: String?) -> [BrainSpec] {
        var ids: [String] = []
        if let p = preferred, !p.isEmpty, p != "auto" { ids.append(p) }
        ids += (mode == "deep" ? Catalog.deepOrder : (mode == "bulk" && bulkEconomy) ? Catalog.bulkOrder : Catalog.fastOrder)
        ids += brains.map { $0.id }
        var seen = Set<String>(); var out: [BrainSpec] = []
        for i in ids where !seen.contains(i) {
            seen.insert(i)
            guard let s = brains.first(where: { $0.id == i }), !disabled.contains(i) else { continue }
            if s.keys.resolve(runner.keys) == nil { continue }
            out.append(s)
        }
        return out
    }

    @discardableResult
    public func chat(messages: [ChatMsg], system: String?, mode: String = "fast", preferred: String? = nil,
                     maxTokens: Int = 1500, cancel: @escaping () -> Bool = { false },
                     onEvent: @escaping (BrainEvent) -> Void) -> String? {
        var chain = plan(mode: mode, preferred: preferred)
        // Un cerveau choisi explicitement par l'utilisateur est toujours essayé en premier, même s'il était en panne.
        let pinned = (preferred ?? "auto") == "auto" ? nil : preferred
        let skipDead = chain.filter { !isDead($0.id) || $0.id == pinned }
        // Si tout est « en panne » (ex. coupure réseau passée), on réessaie quand même plutôt que de rester muet.
        if !skipDead.isEmpty { chain = skipDead }
        if let l = localSpec() { if mode == "bulk" && bulkEconomy { chain.removeAll { $0.id == l.id }; chain.insert(l, at: 0) } else { chain.append(l) } }
        // Tâches de fond sur modèles légers/gratuits : consigne anti-invention stricte (jamais pour le chat et la voix de l'assistant).
        var system = system
        if mode == "bulk" { system = (system ?? "") + "\n\nRÈGLES STRICTES (anti-invention) : n'affirme que ce qui figure dans les données fournies ou dans un résultat d'outil. Si une information manque, écris « non disponible » au lieu de deviner. Ne fabrique ni chiffre, ni date, ni nom, ni source. Réponds en français, court et factuel." }
        if chain.isEmpty {
            onEvent(.error("Aucun cerveau disponible : aucune clé trouvée et aucun moteur local détecté. Ouvre Connexions pour ajouter une clé.")); return nil
        }
        var previous: BrainSpec? = nil
        var lastFail = ""
        var creditDeadHosts = Set<String>()   // crédit épuisé (402) : inutile d'essayer les autres modèles du même fournisseur
        creditLock.lock(); let now0 = Date(); for (h, t) in creditDeadUntil where t > now0 { creditDeadHosts.insert(h) }; creditLock.unlock()   // et on s'en souvient 30 min : plus de 10 essais perdus à chaque message
        for s in chain {
            if cancel() { onEvent(.error("annulé")); return nil }
            if s.kind != .local, creditDeadHosts.contains(URL(string: s.baseURL)?.host ?? s.baseURL) { continue }
            if let p = previous { onEvent(.failover(from: p.label, to: s.label, reason: lastFail, kind: "")) }
            onEvent(.start(id: s.id, label: s.label))
            var produced = false; var text = ""
            let t0 = Date()
            var inTok = 0, outTok = 0
            do {
                try runner.stream(s, messages: messages, system: system, maxTokens: maxTokens, mode: mode,
                                  firstTokenTimeout: s.kind == .local ? (messages.reduce((system ?? "").count) { $0 + $1.content.count } > 3500 ? 100 : 30) : firstTokenTimeout, cancel: cancel,   // un modèle local lit lentement un gros prompt (boîte mail entière) : on lui laisse le temps
                                  onDelta: { produced = true; text += $0; onEvent(.delta($0)) },
                                  onUsage: { inTok = $0; outTok = $1 })
                let ms = Int(Date().timeIntervalSince(t0) * 1000)
                note(s.id, ok: true, ms: ms, err: nil)
                journal.add(["brain": s.id, "model": s.model, "ok": true, "ms": ms, "chars": text.count, "in": inTok, "out": outTok])
                if inTok + outTok > 0 { onEvent(.usage(input: inTok, output: outTok)) }
                onEvent(.done(id: s.id, label: s.label))
                return s.id
            } catch let f as BrainFailure {
                if f.kind == .canceled { onEvent(.error("annulé")); return nil }
                note(s.id, ok: false, ms: nil, err: f)
                journal.add(["brain": s.id, "model": s.model, "ok": false, "kind": f.kind.rawValue, "err": shortError(f.message, 160)])
                if produced { onEvent(.error("Le cerveau « \(s.label) » s'est interrompu en cours de réponse.")); return s.id }
                lastFail = "\(s.label) : \(f.message)"
                if f.kind == .credit { let hh = URL(string: s.baseURL)?.host ?? s.baseURL; creditDeadHosts.insert(hh); creditLock.lock(); creditDeadUntil[hh] = Date().addingTimeInterval(1800); creditLock.unlock() }
                previous = s
            } catch { lastFail = "\(error)"; previous = s }
        }
        onEvent(.error("Tous les cerveaux ont échoué. Dernier : \(lastFail)"))
        return nil
    }

    /// Réponse complète en texte (briefs, dots, etc.).
    public func complete(messages: [ChatMsg], system: String?, mode: String = "deep", preferred: String? = nil, maxTokens: Int = 1800) -> (text: String, brain: String)? {
        var text = ""; var err: String? = nil
        let id = chat(messages: messages, system: system, mode: mode, preferred: preferred, maxTokens: maxTokens) { ev in
            switch ev { case .delta(let d): text += d; case .error(let e): err = e; default: break }
        }
        if let id = id, !text.isEmpty { return (text, id) }
        _ = err
        return nil
    }

    /// Diagnostic réel : un vrai appel minimal par cerveau, en parallèle. Aucune simulation.
    public func diagnose(ids: [String]? = nil) -> [[String: Any]] {
        var targets = brains
        if let l = localSpec() { targets.append(l) }
        if let ids = ids { targets = targets.filter { ids.contains($0.id) } }
        var out: [[String: Any]] = []; let lock2 = NSLock(); let g = DispatchGroup()
        for s in targets {
            g.enter()
            DispatchQueue.global().async {
                defer { g.leave() }
                var row: [String: Any] = ["id": s.id, "label": s.label, "model": s.model]
                if s.kind != .local, s.keys.resolve(self.runner.keys) == nil {
                    row["etat"] = "sans_cle"; row["detail"] = "aucune clé dans le Trousseau (\(s.keys.refs.map { $0.service }.joined(separator: ", ")))"
                } else {
                    let t0 = Date(); var text = ""
                    do {
                        try self.runner.stream(s, messages: [ChatMsg("user", "Réponds uniquement par le mot : ok")], system: nil, maxTokens: 24, mode: "fast",
                                               firstTokenTimeout: 20, cancel: { false }, onDelta: { text += $0 }, onUsage: { _, _ in })
                        let ms = Int(Date().timeIntervalSince(t0) * 1000)
                        self.note(s.id, ok: true, ms: ms, err: nil)
                        row["etat"] = "ok"; row["detail"] = "répond en \(ms) ms : « \(shortError(text.trimmingCharacters(in: .whitespacesAndNewlines), 40)) »"; row["latence_ms"] = ms
                    } catch let f as BrainFailure {
                        self.note(s.id, ok: false, ms: nil, err: f)
                        row["etat"] = "panne"; row["detail"] = "\(f.kind.rawValue) : \(shortError(f.message, 180))"
                    } catch { row["etat"] = "panne"; row["detail"] = "\(error)" }
                }
                lock2.lock(); out.append(row); lock2.unlock()
            }
        }
        g.wait()
        return out.sorted { ($0["id"] as! String) < ($1["id"] as! String) }
    }
}
