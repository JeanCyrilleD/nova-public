import Foundation

/// V10.5 — « Âme de Nova » : les idées du Programme 47 rendues vivantes.
/// Chaque fonction lit des données RÉELLES (conversations, mémoire, résultats des Dots, documents indexés, état du Mac) ; rien n'est inventé,
/// rien n'est envoyé, supprimé ou payé : tout ce qui est rédigé reste un brouillon.
enum AmeDocs { static let names: Set<String> = ["valeurs", "relations", "laisser", "plans", "reves", "pensee", "corps"] }

/// Silence (idée 15) : plafond d'interruptions par jour.
final class AmeSilence {
    static let f = JSONFile("ame_silence.json")
    static let lock = NSLock()
    static func today() -> String { String(nowISO().prefix(10)) }
    /// true si un Dot peut encore interrompre aujourd'hui (et compte l'interruption).
    static func allow(plafond: Int) -> Bool {
        lock.lock(); defer { lock.unlock() }
        var s = f.read(default: [String: Any]()); let d = today()
        var n = (s["day"] as? String) == d ? (s["n"] as? Int ?? 0) : 0
        if n >= plafond { return false }
        n += 1; s = ["day": d, "n": n]; f.write(s); return true
    }
    static func count() -> Int { let s = f.read(default: [String: Any]()); return (s["day"] as? String) == today() ? (s["n"] as? Int ?? 0) : 0 }
}

/// Exécution des plans du Chef d'orchestre (idée 1) : étapes en séquence, lecture seule, résultats consultables.
final class AmeRuns {
    static let shared = AmeRuns()
    let lock = NSLock()
    var runs: [String: [String: Any]] = [:]
    func set(_ id: String, _ v: [String: Any]) { lock.lock(); runs[id] = v; lock.unlock() }
    func get(_ id: String) -> [String: Any]? { lock.lock(); defer { lock.unlock() }; return runs[id] }
}

enum AmeBody {
    nonisolated(unsafe) static var streak = 0          // minutes d'activité continue
    nonisolated(unsafe) static var lastNudge = Date.distantPast
    nonisolated(unsafe) static var idle: Double? = nil
    static func idleSeconds() -> Double? {
        #if os(macOS)
        let (_, o) = runProcess("/usr/sbin/ioreg", ["-c", "IOHIDSystem", "-d", "4"], timeout: 4)
        if let m = SystemInfo.rx(#""HIDIdleTime"\s*=\s*(\d+)"#, o), let n = Double(m[1]) { return n / 1_000_000_000 }
        #endif
        return nil
    }
}

extension NovaApp {
    // MARK: données réelles
    func ameMessages(days: Int, role: String = "user", limit: Int = 80) -> [(Date, String)] {
        let since = Date().addingTimeInterval(-Double(days) * 86400); let iso = ISO8601DateFormatter(); var out: [(Date, String)] = []
        for c in convs.list().prefix(60) {
            guard let id = c["id"] as? String, let full = convs.get(id), let ms = full["messages"] as? [[String: Any]] else { continue }
            for m in ms where (m["role"] as? String) == role {
                guard let ts = (m["ts"] as? String).flatMap({ iso.date(from: $0) }), ts >= since, let t = m["content"] as? String else { continue }
                out.append((ts, t))
            }
        }
        return Array(out.sorted { $0.0 > $1.0 }.prefix(limit))
    }
    func ameDoc(_ name: String) -> Any { JSONFile("ame_\(name).json").read(default: ["valeurs", "relations", "laisser", "plans", "reves", "corps"].contains(name) ? [Any]() as Any : [String: Any]() as Any) }

    func ameContext(days: Int = 14) -> String {
        var s = ""
        let msgs = ameMessages(days: days, limit: 50)
        if !msgs.isEmpty { s += "MESSAGES RÉCENTS DE L'UTILISATEUR (daté, extrait) :\n" + msgs.map { "- \(String(ISO8601DateFormatter().string(from: $0.0).prefix(10))) : \(String($0.1.replacingOccurrences(of: "\n", with: " ").prefix(220)))" }.joined(separator: "\n") + "\n" }
        let mem = memory.list().suffix(60)
        if !mem.isEmpty { s += "MÉMOIRE (faits dits par l'utilisateur) :\n" + mem.map { "- \($0["text"] as? String ?? "")" }.joined(separator: "\n") + "\n" }
        let runs = dots.history().prefix(8).filter { ($0["ok"] as? Bool) == true }
        if !runs.isEmpty { s += "RÉSULTATS RÉCENTS DES DOTS :\n" + runs.map { "- \($0["dot"] ?? "") (\(String(($0["ts"] as? String ?? "").prefix(10)))) : \(String(($0["result"] as? String ?? "").replacingOccurrences(of: "\n", with: " ").prefix(260)))" }.joined(separator: "\n") + "\n" }
        if let v = ameDoc("valeurs") as? [[String: Any]], !v.isEmpty {
            s += "CONTRAT / VALEURS DE L'UTILISATEUR (actives) :\n" + v.filter { ($0["on"] as? Bool) != false }.map { "- \($0["text"] as? String ?? "")" }.joined(separator: "\n") + "\n" }
        return s
    }

    func ameAsk(_ system: String, _ user: String, deep: Bool = false, maxTokens: Int = 1400) -> (text: String, brain: String)? {
        let sys = Persona.system(name: settings.get("name", "Nova"), title: settings.get("user_title", "Utilisateur"), memory: "", voice: false, tools: false, extra: system)
        return router.complete(messages: [ChatMsg("user", user)], system: sys, mode: deep ? "deep" : "fast", preferred: nil, maxTokens: maxTokens)
    }

    static let stop: Set<String> = ["avec", "dans", "pour", "cette", "comme", "mais", "tout", "tous", "plus", "être", "avoir", "fait", "faire", "sont", "nous", "vous", "elle", "elles", "leur", "leurs", "très", "alors", "aussi", "donc", "ainsi", "entre", "sans", "sous", "chez", "cela", "celui", "ceux", "quel", "quelle", "quand", "dont", "même", "bien", "peut", "veux", "veut", "voir", "dire", "avez", "avons", "peux", "faut", "puis", "encore", "toujours", "depuis", "après", "avant", "autre", "autres", "ensuite", "pouvez", "aurait", "serait", "est-ce", "voici", "voilà", "nova", "merci", "bonjour", "salut", "stp", "please", "that", "this", "with", "have", "what"]

    func ameStats() -> [String: Any] {
        let cal = Calendar.current; let now = Date()
        let all = ameMessages(days: 60, limit: 2000)
        var hours = [Int](repeating: 0, count: 24); var days: [String: Int] = [:]
        let df = DateFormatter(); df.dateFormat = "yyyy-MM-dd"
        for (d, _) in all { hours[cal.component(.hour, from: d)] += 1; days[df.string(from: d), default: 0] += 1 }
        let last14: [[String: Any]] = (0..<14).reversed().map { i in let d = df.string(from: now.addingTimeInterval(-Double(i) * 86400)); return ["d": d, "n": days[d] ?? 0] }
        func words(_ from: Double, _ to: Double) -> [String: Int] {
            var w: [String: Int] = [:]
            for (d, t) in all { let age = now.timeIntervalSince(d) / 86400; guard age >= from, age < to else { continue }
                for x in t.lowercased().components(separatedBy: CharacterSet.letters.inverted) where x.count >= 5 && !NovaApp.stop.contains(x) { w[x, default: 0] += 1 } }
            return w
        }
        let a = words(0, 14), b = words(14, 28)
        let rising = a.filter { $0.value >= 2 }.map { (k: $0.key, d: $0.value - (b[$0.key] ?? 0), n: $0.value) }.filter { $0.d > 0 }.sorted { $0.d > $1.d }.prefix(8).map { ["mot": $0.k, "recent": $0.n, "avant": b[$0.k] ?? 0] as [String: Any] }
        let fading = b.filter { $0.value >= 2 && (a[$0.key] ?? 0) == 0 }.sorted { $0.value > $1.value }.prefix(8).map { ["mot": $0.key, "avant": $0.value] as [String: Any] }
        let steady = a.filter { $0.value >= 3 && (b[$0.key] ?? 0) >= 3 }.sorted { $0.value > $1.value }.prefix(8).map { ["mot": $0.key, "recent": $0.value, "avant": b[$0.key] ?? 0] as [String: Any] }
        // créneaux de travail profond : les deux heures consécutives les plus actives (d'après l'usage de Nova — limite annoncée)
        var best = (0, -1); for h in 0..<23 { let s = hours[h] + hours[h + 1]; if s > best.1 { best = (h, s) } }
        let dotRuns = dots.history().prefix(200); var per: [String: [String: Int]] = [:]
        for r in dotRuns { let id = r["dot"] as? String ?? "?"; per[id, default: ["n": 0, "ok": 0]]["n"]! += 1; if (r["ok"] as? Bool) == true { per[id]!["ok"]! += 1 } }
        return ["messages_60j": all.count, "heures": hours, "jours": last14, "montent": rising, "disparaissent": fading, "constants": steady,
                "pic": all.isEmpty ? NSNull() : ["debut": best.0, "fin": best.0 + 2, "messages": best.1] as Any, "dots": per,
                "souvenirs": memory.list().count, "interruptions_aujourdhui": AmeSilence.count(), "plafond": settings.get("dots_plafond", 6)]
    }

    static func extractJSONArray(_ t: String) -> [[String: Any]]? {
        guard let a = t.firstIndex(of: "["), let b = t.lastIndex(of: "]"), a < b, let d = String(t[a...b]).data(using: .utf8) else { return nil }
        return (try? JSONSerialization.jsonObject(with: d)) as? [[String: Any]]
    }

    // MARK: routes
    func ameRoutes() {
        let s = server

        s.on("GET", "/api/ame/doc") { [self] req, res in
            let n = req.query["name"] ?? ""; guard AmeDocs.names.contains(n) else { res.json(["error": "document inconnu"], status: 400); return }
            res.json(["data": ameDoc(n)])
        }
        s.on("POST", "/api/ame/doc") { req, res in
            let n = (req.json["name"] as? String) ?? ""; guard AmeDocs.names.contains(n), let d = req.json["data"] else { res.json(["error": "document inconnu"], status: 400); return }
            JSONFile("ame_\(n).json").write(d); res.json(["ok": true])
        }
        s.on("GET", "/api/ame/stats") { [self] _, res in res.json(ameStats()) }

        // Corps & présence (idées 11, 4)
        s.on("GET", "/api/ame/corps") { [self] _, res in
            res.json(["idle_s": AmeBody.idle as Any? ?? NSNull(), "streak_min": AmeBody.streak, "seuil_min": settings.get("corps_pause_min", 90), "actif": settings.get("corps_on", true),
                      "mesurable": AmeBody.idleSeconds() != nil, "batterie": (SystemInfo.snapshot()["battery"] as Any?) ?? NSNull(), "uptime_s": SystemInfo.snapshot()["uptime_s"] as Any? ?? NSNull()])
        }
        s.on("POST", "/api/ame/corps/test") { [self] _, res in bodyNudge(force: true); res.json(["ok": true]) }

        // Pardon (33) : un fait « pardonné » reste visible mais n'est plus injecté dans les réponses de Nova.
        s.on("POST", "/api/ame/pardon") { [self] req, res in
            let id = req.json["id"] as? String ?? ""; var l = memory.list(); guard let i = l.firstIndex(where: { ($0["id"] as? String) == id }) else { res.json(["error": "fait introuvable"], status: 404); return }
            l[i]["forgiven"] = !((l[i]["forgiven"] as? Bool) ?? false); JSONFile("memoire.json").write(l); res.json(["ok": true, "forgiven": l[i]["forgiven"] as Any])
        }
        s.on("GET", "/api/ame/memoire") { [self] _, res in res.json(["items": Array(memory.list().reversed())]) }

        // Cerveau : toutes les « intelligences » de l'Âme passent par ici, avec un contexte construit depuis de vraies données.
        s.on("POST", "/api/ame/llm") { [self] req, res in
            let kind = req.json["kind"] as? String ?? ""; let input = (req.json["input"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            let r = ameThink(kind: kind, input: input)
            if let e = r["error"] { res.json(["error": e], status: 400) } else { res.json(r) }
        }

        // Chef d'orchestre (1) : planifier puis exécuter, étape par étape, en lecture seule.
        s.on("POST", "/api/ame/orchestre/run") { [self] req, res in
            guard let steps = req.json["steps"] as? [[String: Any]], !steps.isEmpty else { res.json(["error": "aucune étape"], status: 400); return }
            let goal = req.json["goal"] as? String ?? ""; let id = UUID().uuidString.prefix(8).lowercased().description
            var st: [[String: Any]] = steps.prefix(8).map { ["titre": $0["titre"] ?? "", "task": $0["task"] ?? "", "status": "attente", "result": ""] }
            AmeRuns.shared.set(id, ["id": id, "goal": goal, "steps": st, "done": false])
            Thread.detachNewThread { [self] in
                let allowed: Set<String> = ["web_search", "web_fetch", "mail_unread", "calendar", "reminders", "read_file", "recall", "know", "system", "nova_self"]
                var memo = ""
                for i in st.indices {
                    st[i]["status"] = "en cours"; AmeRuns.shared.set(id, ["id": id, "goal": goal, "steps": st, "done": false])
                    let sys = Persona.system(name: "Orchestre", title: settings.get("user_title", "Utilisateur"), memory: memory.promptBlock(max: 15), voice: false, tools: true,
                                             extra: "TU ES UN SOUS-AGENT DU CHEF D'ORCHESTRE. Objectif global : \(goal). Tu exécutes UNE étape, en lecture seule (aucun envoi, aucune suppression, aucun paiement). Outils : \(allowed.sorted().joined(separator: ", ")).")
                    var text = ""
                    Agent(router: router, tools: tools).run(messages: [ChatMsg("user", "Étape \(i + 1) : \(st[i]["titre"] ?? "")\n\(st[i]["task"] ?? "")\n\nRésultats des étapes précédentes :\n\(memo.isEmpty ? "(aucun)" : memo)")], system: sys, mode: "fast", preferred: nil, maxTokens: 1200, useTools: true, maxSteps: 4, allowed: allowed, cancel: { false }) { ev in
                        if case .delta(let t) = ev { text += t } }
                    st[i]["result"] = text.isEmpty ? "(aucun cerveau n'a répondu)" : text; st[i]["status"] = text.isEmpty ? "échec" : "fait"
                    memo += "\n[\(st[i]["titre"] ?? "")] " + String(text.prefix(900))
                    AmeRuns.shared.set(id, ["id": id, "goal": goal, "steps": st, "done": false])
                }
                let fin = ameAsk("Tu fais la synthèse finale d'un plan exécuté. Appuie-toi UNIQUEMENT sur les résultats fournis ; signale ce qui a échoué ou manque.", "Objectif : \(goal)\n\nRésultats :\n\(memo)", deep: false, maxTokens: 900)
                AmeRuns.shared.set(id, ["id": id, "goal": goal, "steps": st, "done": true, "synthese": fin?.text ?? "(synthèse indisponible)"])
            }
            res.json(["id": id])
        }
        s.on("GET", "/api/ame/orchestre/run") { req, res in res.json(AmeRuns.shared.get(req.query["id"] ?? "") ?? ["error": "exécution inconnue"]) }

        // Héritage (8, 24) : paquet portable, sans aucune clé ni donnée du Coffre.
        s.on("POST", "/api/ame/heritage") { [self] _, res in
            let day = String(nowISO().prefix(10)); let home = ProcessInfo.processInfo.environment["HOME"] ?? NSHomeDirectory(); let dir = home + "/NOVA_ECHANGE/Heritage_Nova_" + day
            try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
            func put(_ n: String, _ o: Any) { try? jsonData(o).write(to: URL(fileURLWithPath: dir + "/" + n)) }
            put("memoire.json", memory.list()); put("valeurs.json", ameDoc("valeurs")); put("relations.json", ameDoc("relations")); put("reglages_sans_cles.json", settings.all().filter { !["voice_id"].contains($0.key) })
            let pensee = (ameDoc("pensee") as? [String: Any])?["text"] as? String ?? "(Génère d'abord « Ma manière de penser » dans l'onglet Héritage.)"
            try? ("# Manière de penser — \(day)\n\n" + pensee + "\n").write(toFile: dir + "/MANIERE_DE_PENSER.md", atomically: true, encoding: .utf8)
            try? "Paquet Nova du \(day). Contient : mémoire, valeurs, relations, réglages (sans clés), manière de penser. Ne contient AUCUNE clé API ni donnée du Coffre (finances/santé).\n".write(toFile: dir + "/LISEZ-MOI.txt", atomically: true, encoding: .utf8)
            res.json(["ok": true, "path": dir.replacingOccurrences(of: home, with: "~")])
        }

        // Skills « un fichier » (C2, S4) : un fichier texte = une compétence réutilisable.
        let sk = Paths.home.appendingPathComponent("skills")
        s.on("GET", "/api/ame/skills") { _, res in
            try? FileManager.default.createDirectory(at: sk, withIntermediateDirectories: true)
            let names = ((try? FileManager.default.contentsOfDirectory(atPath: sk.path)) ?? []).filter { $0.hasSuffix(".md") }.sorted()
            res.json(["items": names.map { n in ["name": String(n.dropLast(3)), "body": (try? String(contentsOfFile: sk.path + "/" + n, encoding: .utf8)) ?? ""] }])
        }
        s.on("POST", "/api/ame/skills/save") { req, res in
            let n = (req.json["name"] as? String ?? "").lowercased().replacingOccurrences(of: "[^a-z0-9-]+", with: "-", options: .regularExpression).trimmingCharacters(in: CharacterSet(charactersIn: "-"))
            guard !n.isEmpty, let b = req.json["body"] as? String, b.count < 20000 else { res.json(["error": "nom ou contenu invalide"], status: 400); return }
            try? FileManager.default.createDirectory(at: sk, withIntermediateDirectories: true)
            try? b.write(toFile: sk.path + "/" + n + ".md", atomically: true, encoding: .utf8); res.json(["ok": true, "name": n])
        }
        s.on("POST", "/api/ame/skills/run") { [self] req, res in
            let n = (req.json["name"] as? String ?? ""); guard !n.contains("/"), let b = try? String(contentsOfFile: sk.path + "/" + n + ".md", encoding: .utf8) else { res.json(["error": "skill introuvable"], status: 404); return }
            guard let r = ameAsk("COMPÉTENCE « \(n) » — applique ces instructions à la lettre :\n\(b)", (req.json["input"] as? String) ?? "Applique la compétence.", deep: false, maxTokens: 1600) else { res.json(["error": "aucun cerveau n'a répondu"], status: 502); return }
            res.json(["text": r.text, "brain": r.brain])
        }
    }

    // MARK: intelligences de l'Âme
    func ameThink(kind: String, input: String) -> [String: Any] {
        let ctx = ameContext()
        func out(_ r: (text: String, brain: String)?) -> [String: Any] { r.map { ["text": $0.text, "brain": $0.brain] } ?? ["error": "aucun cerveau n'a répondu (crédit épuisé ou hors ligne ?)"] }
        let honest = " Appuie-toi UNIQUEMENT sur les données fournies ; cite des extraits courts et datés ; si les données sont trop maigres pour conclure, dis-le franchement. Pas de flatterie, pas de diagnostic médical ou psychologique, aucun conseil d'investissement."
        switch kind {
        case "miroir":   // 3, 23, 29 : miroir des habitudes + miroir moral face au contrat de valeurs
            return out(ameAsk("TU ES LE MIROIR. Montre à l'utilisateur ce qu'il fait vraiment : 1) ce qu'il répète, 2) ce qu'il repousse ou évite, 3) où ses actes contredisent son contrat de valeurs (miroir moral), 4) une question honnête à se poser." + honest, ctx.isEmpty ? "Aucune donnée." : ctx, deep: true))
        case "archeo":   // 30 : archéologue — l'évolution d'une idée dans le temps
            let hits = ameSearch(input)
            return out(ameAsk("TU ES L'ARCHÉOLOGUE. Retrace l'ÉVOLUTION de la pensée de l'utilisateur sur le sujet demandé, dans l'ordre chronologique, avec les dates, et dis ce qui a changé." + honest, "Sujet : \(input)\n\nTraces retrouvées :\n\(hits.isEmpty ? "(aucune trace)" : hits)", deep: true))
        case "serendipite":   // 12
            var pieces = memory.list().shuffled().prefix(3).map { $0["text"] as? String ?? "" }
            if let w = memory.list().randomElement()?["text"] as? String, let k = w.split(separator: " ").filter({ $0.count > 5 }).randomElement(), let h = Knowledge.shared.search(String(k), limit: 1).first { pieces.append((h["text"] as? String) ?? "") }
            return out(ameAsk("TU ES LA SÉRENDIPITÉ. Trouve un lien inattendu mais RÉEL entre ces éléments de la vie de l'utilisateur et propose une action concrète de 10 minutes. N'invente aucun fait." , pieces.map { "• " + String($0.prefix(400)) }.joined(separator: "\n")))
        case "jumeau":   // 6 : simulation de décision, hypothèses explicites
            guard !input.isEmpty else { return ["error": "décris la décision à simuler"] }
            return out(ameAsk("TU ES LE JUMEAU : une simulation de l'utilisateur bâtie sur sa mémoire, ses valeurs et ses habitudes. Pour la décision proposée, donne : 3 scénarios (favorable, probable, défavorable) avec leurs HYPOTHÈSES explicites, ce que son jumeau ferait à sa place et pourquoi, 3 signaux à surveiller. Ce sont des estimations qualitatives, jamais des certitudes." + honest, "Décision : \(input)\n\n\(ctx)", deep: true, maxTokens: 1800))
        case "sparring":   // 25 : le maître-sparring
            guard !input.isEmpty else { return ["error": "donne ta position à challenger"] }
            return out(ameAsk("TU ES LE SPARRING-PARTNER. Attaque la position de l'utilisateur avec respect et rigueur : ses 3 points les plus faibles, le meilleur contre-argument, ce qu'il ignore peut-être, et à quelle condition TU changerais d'avis. Ne cède pas par politesse." + honest, "Position : \(input)\n\n\(ctx)", deep: true, maxTokens: 1500))
        case "reve":   // 5, C1 : distillation nocturne → propositions (jamais enregistrées sans accord)
            let t = ameMessages(days: 1, limit: 40); if t.isEmpty { return ["text": "Aucune conversation aujourd'hui : rien à distiller.", "items": [String](), "brain": ""] }
            guard let r = ameAsk("TU ES LE RÊVE : tu distilles la journée. Propose au maximum 5 faits DURABLES à retenir (préférences, décisions, règles, noms, échéances), UN PAR LIGNE, commençant par « - », formulés tels que l'utilisateur les a dits. Rien d'inventé, rien de sensible (santé, finances, secrets).", t.map { "- " + String($0.1.replacingOccurrences(of: "\n", with: " ").prefix(300)) }.joined(separator: "\n")) else { return out(nil) }
            let items = r.text.split(separator: "\n").map { $0.trimmingCharacters(in: .whitespaces) }.filter { $0.hasPrefix("- ") }.map { String($0.dropFirst(2)) }
            return ["text": r.text, "items": items, "brain": r.brain]
        case "pensee":   // 24 : manière de penser à transmettre
            return out(ameAsk("TU RÉDIGES « MA MANIÈRE DE PENSER » : un document de transmission (markdown) — principes, règles de décision, style de travail, ce qu'il refuse, ses priorités — tiré de sa mémoire, de son contrat de valeurs et de ses doctrines." + honest, ctx + "\n" + Knowledge.shared.promptBlock(query: "charte règles principes politique"), deep: true, maxTokens: 2000))
        case "relation":   // 10, 16 : brouillon uniquement
            guard !input.isEmpty else { return ["error": "indique la personne et le contexte"] }
            return out(ameAsk("TU ES L'AMBASSADEUR. Rédige un BROUILLON de message pour reprendre contact (jamais envoyé par toi), au format de sa charte : salutation, une phrase de contexte, points clés en liste, action demandée en gras, clôture. HTML simple (<p>, <b>, <ul>). Aucun fait inventé sur la personne.", input))
        case "plan":   // 1 : chef d'orchestre
            guard !input.isEmpty else { return ["error": "décris l'objectif"] }
            guard let r = ameAsk("TU ES LE CHEF D'ORCHESTRE. Découpe l'objectif en 2 à 6 étapes EXÉCUTABLES en lecture seule (recherche web, agenda, rappels, mails non lus, documents de l'utilisateur, état du Mac). Réponds UNIQUEMENT par un tableau JSON : [{\"titre\":\"…\",\"task\":\"consigne précise\"}]. Aucune étape ne doit envoyer, payer ou supprimer.", "Objectif : \(input)\n\n\(ctx)", deep: true, maxTokens: 1200) else { return out(nil) }
            guard let steps = NovaApp.extractJSONArray(r.text) else { return ["error": "le plan n'a pas pu être lu : " + String(r.text.prefix(200))] }
            return ["steps": steps, "brain": r.brain]
        case "rituel_matin", "rituel_soir":   // 20, 26 : trois tuiles
            let cal = tools.run("calendar", ""), rem = tools.run("reminders", "")
            let laisser = ((ameDoc("laisser") as? [[String: Any]]) ?? []).suffix(6).map { "- \($0["text"] as? String ?? "") (\(String(($0["ts"] as? String ?? "").prefix(10))))" }.joined(separator: "\n")
            let morning = kind == "rituel_matin"
            return out(ameAsk("TU ES LE RITUEL \(morning ? "DU MATIN" : "DU SOIR"). Compose EXACTEMENT 3 tuiles courtes en markdown : **À commencer** (\(morning ? "la chose la plus importante de la journée" : "ce qui a avancé aujourd'hui")), **À laisser** (ce qu'on ne reprend pas \(morning ? "aujourd'hui, en t'appuyant sur ce qu'il a lui-même choisi de laisser" : "ce soir : l'autorisation explicite de lâcher")), **À préparer** (\(morning ? "à anticiper" : "pour demain")). Données réelles uniquement." + honest, "AGENDA :\n\(cal)\n\nRAPPELS :\n\(rem)\n\nCE QU'IL A CHOISI DE LAISSER :\n\(laisser.isEmpty ? "(rien)" : laisser)\n\n\(ctx)"))
        default: return ["error": "intelligence inconnue : \(kind)"]
        }
    }

    func ameSearch(_ q: String) -> String {
        var lines: [String] = []; let words = q.lowercased().split(separator: " ").filter { $0.count > 2 }.map(String.init); let iso = ISO8601DateFormatter()
        for c in convs.list().prefix(80) {
            guard let id = c["id"] as? String, let full = convs.get(id), let ms = full["messages"] as? [[String: Any]] else { continue }
            for m in ms { let t = (m["content"] as? String) ?? ""; let low = t.lowercased()
                if !words.isEmpty, words.contains(where: { low.contains($0) }) { let d = (m["ts"] as? String).flatMap { iso.date(from: $0) }.map { String(iso.string(from: $0).prefix(10)) } ?? "?"
                    lines.append("[conversation \(d), \((m["role"] as? String) ?? "")] " + String(t.replacingOccurrences(of: "\n", with: " ").prefix(240))) } }
        }
        for m in memory.search(q, limit: 6) { lines.append("[mémoire \(String((m["ts"] as? String ?? "").prefix(10)))] " + (m["text"] as? String ?? "")) }
        for h in Knowledge.shared.search(q, limit: 4) { lines.append("[document \(h["path"] as? String ?? "")] " + String(((h["text"] as? String) ?? "").replacingOccurrences(of: "\n", with: " ").prefix(240))) }
        return lines.prefix(30).joined(separator: "\n")
    }

    // MARK: veille de fond (corps, relations, rêve)
    func bodyNudge(force: Bool = false) {
        let tips = ["Lève-toi une minute, bois un verre d'eau.", "Règle 20-20-20 : regarde au loin pendant 20 secondes.", "Étire la nuque et les épaules, puis marche jusqu'à la fenêtre.", "Respire lentement 5 fois avant de reprendre."]
        let m = AmeBody.streak
        publishDot(id: "corps", name: "Gardien du corps", emoji: "🧘", color: "#10b981", summary: (force ? "Test. " : "") + "Tu es devant l'écran depuis environ \(m) min sans pause de 5 min détectée. " + tips.randomElement()!)
        AmeBody.lastNudge = Date()
    }
    func publishDot(id: String, name: String, emoji: String, color: String, summary: String) {
        guard AmeSilence.allow(plafond: settings.get("dots_plafond", 6)) else { return }
        bus.publish("dot", ["phase": "ready", "dot": id, "name": name, "emoji": emoji, "color": color, "run_id": "ame-\(id)-\(Int(Date().timeIntervalSince1970))", "ok": true, "summary": summary])
    }

    func ameStart() {
        Thread.detachNewThread { [self] in
            var lastDay = ""; var lastRel = ""; var lastDream = ""
            while true {
                Thread.sleep(forTimeInterval: 60)
                // Gardien du corps : une minute d'activité de plus tant que l'inactivité reste < 5 min ; une vraie pause remet le compteur à zéro.
                if let idle = AmeBody.idleSeconds() {
                    AmeBody.idle = idle
                    if idle < 300 { AmeBody.streak += 1 } else { AmeBody.streak = 0 }
                    let th = settings.get("corps_pause_min", 90)
                    if settings.get("corps_on", true), AmeBody.streak >= th, !briefs.inQuietHours(), Date().timeIntervalSince(AmeBody.lastNudge) > Double(th) * 60 { bodyNudge() }
                }
                let now = Date(); let cal = Calendar.current; let day = String(nowISO().prefix(10)); let hh = cal.component(.hour, from: now), mm = cal.component(.minute, from: now)
                // Gardien des relations : une fois par jour dès 9 h, seulement s'il y a quelqu'un à relancer.
                if hh >= 9, lastRel != day, !briefs.inQuietHours() {
                    lastRel = day
                    let rels = (ameDoc("relations") as? [[String: Any]]) ?? []; let iso = ISO8601DateFormatter()
                    let due = rels.filter { ($0["deuil"] as? Bool) != true }.compactMap { r -> String? in
                        guard let n = r["name"] as? String, let cad = r["cadence"] as? Int, cad > 0 else { return nil }
                        let last = (r["last"] as? String).flatMap { iso.date(from: $0) } ?? Date.distantPast
                        return now.timeIntervalSince(last) > Double(cad) * 86400 ? n : nil }
                    if !due.isEmpty { publishDot(id: "relations", name: "Gardien des relations", emoji: "🤝", color: "#8b5cf6", summary: "Pas de nouvelles depuis un moment : " + due.prefix(5).joined(separator: ", ") + ". Ouvre l'onglet Relations pour un brouillon de message (rien n'est envoyé).") }
                }
                // Rêve : à 23 h 30, distille la journée en propositions (à valider dans l'onglet Rituels).
                if hh == 23, mm >= 30, lastDream != day {
                    lastDream = day
                    let r = ameThink(kind: "reve", input: "")
                    if let items = r["items"] as? [String], !items.isEmpty {
                        var l = (ameDoc("reves") as? [[String: Any]]) ?? []
                        for t in items { l.append(["id": UUID().uuidString.prefix(8).lowercased().description, "text": t, "ts": nowISO(), "status": "proposé"]) }
                        JSONFile("ame_reves.json").write(Array(l.suffix(60)))
                    }
                }
                _ = lastDay; lastDay = day
            }
        }
    }
}

extension NovaApp {
    /// Profondeurs (14) : 0 surface · 1 courant · 2 profond · 3 nuit — change la forme de la réponse, pas l'honnêteté.
    static func depthPrompt(_ d: Int) -> String {
        switch d {
        case 0: return "\nPROFONDEUR : SURFACE — une à deux phrases, la réponse seule."
        case 2: return "\nPROFONDEUR : PROFOND — analyse structurée : faits, hypothèses, risques, recommandation, et ce que tu ne sais pas."
        case 3: return "\nPROFONDEUR : NUIT — mode réflexion lente et chaleureuse : prends du recul, relie à ses valeurs et à ses échéances, pose une question juste ; aucune urgence, aucune liste de tâches."
        default: return ""
        }
    }
}
