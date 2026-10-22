import Foundation

public struct Settings {
    let f = JSONFile("settings.json")
    public init() {}
    public static let defaults: [String: Any] = [
        "brain": "auto", "voice_enabled": true, "voice_id": "", "voice_model": "eleven_multilingual_v2",
        "theme": "nova-imperial", "avatar": "panda", "name": "Nova", "full_name": "", "user_title": "Utilisateur",
        "city": "", "lat": 0.0, "lon": 0.0,
        "feeds": ["https://www.rfi.fr/fr/afrique/rss", "https://www.lemonde.fr/afrique/rss_full.xml"],
        "quiet_from": "22:00", "quiet_to": "07:00", "notify": true, "auto_speak_briefs": false,
        "briefs": [["id": "matin", "label": "Brief du matin", "time": "07:30", "enabled": true, "kind": "matin"],
                   ["id": "midi", "label": "Point de midi", "time": "12:30", "enabled": false, "kind": "midi"],
                   ["id": "soir", "label": "Fermeture du soir", "time": "18:00", "enabled": true, "kind": "soir"]],
        "voice_fallback_say": false, "economy_mode": true, "local_model": "", "firstTokenTimeout": 9, "knowledge_roots": [], "dots_migrated_v10": false, "dots_migrated_v21": false, "dots_migrated_v21b": false, "dots_migrated_v10b": false, "dots_auto": true, "corps_pause_min": 90, "corps_on": true, "dots_plafond": 6, "ui_prefs": [String: Any](), "bridge_enabled": false,
    ]
    public func all() -> [String: Any] {
        var d = Settings.defaults
        for (k, v) in f.read(default: [String: Any]()) { d[k] = v }
        return d
    }
    public func get<T>(_ k: String, _ def: T) -> T { (all()[k] as? T) ?? def }
    public func set(_ patch: [String: Any]) {
        var cur = f.read(default: [String: Any]())
        for (k, v) in patch where Settings.defaults[k] != nil { cur[k] = v }
        f.write(cur)
    }
}

/// Mémoire durable : faits écrits par l'utilisateur ou retenus à sa demande. Chaque fait a une source et une date.
public final class Memory {
    let f = JSONFile("memoire.json")
    let lock = NSLock()
    public init() {}
    public func list() -> [[String: Any]] { f.read(default: [[String: Any]]()) }

    // V15 — mémoire contrôlée : mode « sans mémoire » + rétention limitée par défaut pour les sujets sensibles (santé, finances).
    let cfg = JSONFile("memoire_reglages.json")
    static let sensitiveRx = try! NSRegularExpression(pattern: "sant[ée]|m[ée]dic|maladie|diagnostic|tension|poids|glyc|ordonnance|banque|compte|salaire|revenu|dette|cr[ée]dit|imp[ôo]t|portefeuille|solde|iban|virement|assurance", options: .caseInsensitive)
    public func settings() -> [String: Any] {
        let c = cfg.read(default: [String: Any]())
        return ["off": (c["off"] as? Bool) ?? false, "sensitive_days": (c["sensitive_days"] as? Int) ?? 90]
    }
    public func configure(off: Bool?, sensitiveDays: Int?) {
        var c = settings(); if let o = off { c["off"] = o }; if let d = sensitiveDays { c["sensitive_days"] = max(0, min(3650, d)) }; cfg.write(c)
    }
    public var isOff: Bool { (settings()["off"] as? Bool) ?? false }
    public static func isSensitive(_ t: String) -> Bool { sensitiveRx.firstMatch(in: t, range: NSRange(location: 0, length: (t as NSString).length)) != nil }
    /// Efface les souvenirs sensibles plus vieux que la durée choisie (0 = jamais d'expiration). Retourne le nombre effacé.
    @discardableResult public func purgeExpired() -> Int {
        let days = (settings()["sensitive_days"] as? Int) ?? 90; guard days > 0 else { return 0 }
        lock.lock(); defer { lock.unlock() }
        let limit = Date().addingTimeInterval(-Double(days) * 86400); let iso = ISO8601DateFormatter()
        let l = list(); let keep = l.filter { m in
            guard Memory.isSensitive(m["text"] as? String ?? ""), let ts = m["ts"] as? String, let d = iso.date(from: ts) ?? ISO8601DateFormatter().date(from: String(ts.prefix(19)) + "Z") else { return true }
            return d > limit }
        if keep.count != l.count { f.write(keep) }
        return l.count - keep.count
    }
    @discardableResult public func add(_ text: String, source: String = "utilisateur") -> [String: Any]? {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty, !isOff else { return nil }
        lock.lock(); defer { lock.unlock() }
        var l = list()
        if l.contains(where: { ($0["text"] as? String)?.lowercased() == t.lowercased() }) { return nil }
        let item: [String: Any] = ["id": UUID().uuidString.prefix(8).lowercased(), "text": t, "source": source, "ts": nowISO()]
        l.append(item); f.write(l); return item
    }
    public func remove(_ id: String) { lock.lock(); defer { lock.unlock() }; f.write(list().filter { ($0["id"] as? String) != id }) }
    @discardableResult public func update(_ id: String, text: String) -> Bool {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines); guard !t.isEmpty else { return false }
        lock.lock(); defer { lock.unlock() }
        var l = list(); guard let i = l.firstIndex(where: { ($0["id"] as? String) == id }) else { return false }
        l[i]["text"] = t; l[i]["edited"] = nowISO(); f.write(l); return true
    }
    public func search(_ q: String, limit: Int = 8) -> [[String: Any]] {
        let words = q.lowercased().split(separator: " ").filter { $0.count > 2 }
        let scored = list().map { m -> (Int, [String: Any]) in
            let t = (m["text"] as? String ?? "").lowercased(); return (words.filter { t.contains($0) }.count, m) }
        let hits = scored.filter { $0.0 > 0 }.sorted { $0.0 > $1.0 }.prefix(limit).map { $0.1 }
        return Array(hits)
    }
    /// Faits injectés dans le prompt : les plus récents (plafonnés) ; la recherche ciblée passe par l'outil recall.
    public func promptBlock(max: Int = 25) -> String {
        if isOff { return "" }
        let l = list().filter { ($0["forgiven"] as? Bool) != true }.suffix(max)
        if l.isEmpty { return "" }
        return "FAITS MÉMORISÉS (dits par " + "l'utilisateur, datés) :\n" + l.map { "- \($0["text"] as? String ?? "") (\(String(($0["ts"] as? String ?? "").prefix(10))))" }.joined(separator: "\n")
    }
}

public final class Conversations {
    let f = JSONFile("conversations.json")
    let lock = NSLock()
    public init() {}
    func load() -> [String: Any] { f.read(default: [String: Any]()) }
    public func list() -> [[String: Any]] {
        load().compactMap { (k, v) -> [String: Any]? in
            guard var c = v as? [String: Any] else { return nil }
            c["id"] = k; c["count"] = (c["messages"] as? [Any])?.count ?? 0; c.removeValue(forKey: "messages"); return c
        }.sorted { ($0["updated"] as? String ?? "") > ($1["updated"] as? String ?? "") }
    }
    public func get(_ id: String) -> [String: Any]? { load()[id] as? [String: Any] }
    public func create(title: String = "Nouvelle conversation") -> String {
        lock.lock(); defer { lock.unlock() }
        var d = load(); let id = UUID().uuidString.prefix(8).lowercased().description
        d[id] = ["title": title, "messages": [Any](), "updated": nowISO()]; f.write(d); return id
    }
    public func append(_ id: String, role: String, content: String, brain: String? = nil) {
        lock.lock(); defer { lock.unlock() }
        var d = load(); var c = (d[id] as? [String: Any]) ?? ["title": "Conversation", "messages": [Any]()]
        var m = (c["messages"] as? [[String: Any]]) ?? []
        var e: [String: Any] = ["role": role, "content": content, "ts": nowISO()]
        if let b = brain { e["brain"] = b }
        m.append(e); c["messages"] = m; c["updated"] = nowISO()
        if (c["title"] as? String) == "Nouvelle conversation", role == "user" { c["title"] = String(content.prefix(48)) }
        d[id] = c; f.write(d)
    }
    @discardableResult public func rename(_ id: String, title: String) -> Bool {
        let t = String(title.trimmingCharacters(in: .whitespacesAndNewlines).prefix(80)); guard !t.isEmpty else { return false }
        lock.lock(); defer { lock.unlock() }
        var d = load(); guard var c = d[id] as? [String: Any] else { return false }
        c["title"] = t; d[id] = c; f.write(d); return true
    }
    public func delete(_ id: String) { lock.lock(); defer { lock.unlock() }; var d = load(); d.removeValue(forKey: id); f.write(d) }
    public func history(_ id: String, limit: Int = 24) -> [ChatMsg] {
        let m = (get(id)?["messages"] as? [[String: Any]]) ?? []
        return m.suffix(limit).compactMap { e in
            guard let r = e["role"] as? String, let c = e["content"] as? String, r == "user" || r == "assistant" else { return nil }
            return ChatMsg(r, c) }
    }
}

public enum Persona {
    public static func system(name: String, title: String, memory: String, voice: Bool, tools: Bool, extra: String = "") -> String {
        let df = DateFormatter(); df.locale = Locale(identifier: "fr_FR"); df.dateFormat = "EEEE d MMMM yyyy 'à' HH:mm"
        let tz = TimeZone.current.identifier
        var s = """
        Tu es \(name), l'assistant personnel de \(title), sur son Mac. Tu parles français, de façon directe : la réponse d'abord, le détail ensuite, à la première personne, chaleureux mais sans flatterie ni sermon.
        DATE ET HEURE EXACTES (source : l'horloge du Mac) : \(df.string(from: Date())), fuseau \(tz). Ne devine jamais la date : utilise celle-ci.
        RÈGLES D'HONNÊTETÉ : n'invente aucun chiffre, aucun mail, aucun rendez-vous, aucune source. Si tu n'as pas la donnée, dis-le et propose de la chercher avec un outil. Si un outil échoue, dis-le tel quel. Tu n'envoies, ne paies et ne supprimes jamais rien sans un accord explicite sur le contenu exact ; tu peux seulement préparer un brouillon.
        Un ordre direct = tu l'exécutes (avec les outils) ou tu dis précisément ce qui t'en empêche.
        """
        if voice {
            s += "\nMODE VOCAL : tu parles à voix haute. Réponds en 1 à 3 phrases courtes, naturelles, comme à l'oral. Aucun markdown, aucune liste, aucun symbole, aucun émoji. Écris les nombres et unités comme on les dit."
        } else {
            s += "\nMise en forme : markdown léger (gras, listes courtes) seulement si cela aide ; pas de remplissage. Pour montrer des chiffres RÉELS que tu viens de lire (outil, document), tu peux ajouter une carte : un bloc ```nova-card contenant uniquement du JSON {\"type\":\"bars|stat|list\",\"title\":\"…\",\"items\":[{\"label\":\"…\",\"value\":12,\"max\":100,\"unit\":\"…\"}]} (12 éléments max). Jamais de chiffre inventé dans une carte."
        }
        s += "\nRÈGLES PERMANENTES DE L'UTILISATEUR : (1) tout message Teams ou mail que tu rédiges suit sa charte : salutation, une phrase de contexte, points clés en liste, action demandée en gras, ligne de clôture ; livré en HTML simple. (2) Tu n'envoies, ne supprimes et ne paies jamais rien sans son GO explicite sur le contenu exact. (3) Aucun conseil d'investissement : des faits sourcés. (4) Ses finances et sa santé restent dans le Coffre ; n'en parle que s'il le demande. (5) Cherche d'abord dans ses documents (outil know) avant de dire que tu ne sais pas."
        if tools { s += "\n" + Tools.protocolPrompt }
        if !memory.isEmpty { s += "\n" + memory }
        if !extra.isEmpty { s += "\n" + extra }
        return s
    }
}
