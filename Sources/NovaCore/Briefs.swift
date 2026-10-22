import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
#if canImport(FoundationXML)
import FoundationXML
#endif

/// Source de données : toujours (nom, ok, texte). Une source en échec est DITE, jamais remplacée par du texte inventé.
public struct SourceData { public var name: String; public var ok: Bool; public var text: String
    public func asDict() -> [String: Any] { ["name": name, "ok": ok, "detail": ok ? "ok" : text] } }

final class RSSParser: NSObject, XMLParserDelegate {
    var items: [(String, String, String)] = []   // titre, lien, date
    var cur = "", title = "", link = "", date = "", inItem = false
    func parser(_ p: XMLParser, didStartElement e: String, namespaceURI: String?, qualifiedName: String?, attributes: [String: String] = [:]) {
        cur = ""; if e == "item" || e == "entry" { inItem = true; title = ""; link = ""; date = "" }
        if e == "link", inItem, let h = attributes["href"] { link = h }
    }
    func parser(_ p: XMLParser, foundCharacters s: String) { cur += s }
    func parser(_ p: XMLParser, foundCDATA b: Data) { cur += String(decoding: b, as: UTF8.self) }
    func parser(_ p: XMLParser, didEndElement e: String, namespaceURI: String?, qualifiedName: String?) {
        let t = cur.trimmingCharacters(in: .whitespacesAndNewlines)
        if inItem { if e == "title" { title = t } else if e == "link", !t.isEmpty { link = t } else if e == "pubDate" || e == "updated" || e == "published" { date = t } }
        if e == "item" || e == "entry" { inItem = false; items.append((title, link, date)) }
    }
}

public final class Briefs {
    let router: Router, tools: Tools, settings: Settings
    let store = JSONFile("briefs.json")
    let state = JSONFile("briefs_etat.json")
    let log = Journal("briefs_journal.jsonl")
    public var onNew: (([String: Any]) -> Void)? = nil
    var running = Set<String>()
    let lock = NSLock()
    public init(router: Router, tools: Tools, settings: Settings) { self.router = router; self.tools = tools; self.settings = settings }

    public func list() -> [[String: Any]] { store.read(default: [[String: Any]]()).reversed() }
    public func markRead(_ id: String) {
        var l = store.read(default: [[String: Any]]()); for i in l.indices where (l[i]["id"] as? String) == id { l[i]["read"] = true }; store.write(l)
    }

    // MARK: connecteurs
    func weather() -> SourceData {
        let lat = settings.get("lat", 0.0), lon = settings.get("lon", 0.0), city = settings.get("city", "")
        let u = "https://api.open-meteo.com/v1/forecast?latitude=\(lat)&longitude=\(lon)&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=2"
        let (st, body) = Tools.get(u, timeout: 10)
        guard st == 200, let o = parseJSON(Data(body.utf8)), let cur = o["current"] as? [String: Any], let d = o["daily"] as? [String: Any] else {
            return SourceData(name: "Météo (Open-Meteo)", ok: false, text: "indisponible (HTTP \(st))") }
        func arr(_ k: String) -> [Double] { (d[k] as? [Any])?.compactMap { ($0 as? NSNumber)?.doubleValue } ?? [] }
        let mx = arr("temperature_2m_max"), mn = arr("temperature_2m_min"), pr = arr("precipitation_probability_max")
        let t = "\(city) — maintenant \(cur["temperature_2m"] ?? "?") °C ; aujourd'hui min \(mn.first.map { Int($0) } ?? 0) / max \(mx.first.map { Int($0) } ?? 0) °C, pluie \(pr.first.map { Int($0) } ?? 0) % ; demain max \(mx.dropFirst().first.map { Int($0) } ?? 0) °C (Open-Meteo, \(nowISO().prefix(10)))"
        return SourceData(name: "Météo (Open-Meteo)", ok: true, text: t)
    }
    func news() -> SourceData {
        var lines: [String] = []; var errs: [String] = []
        for f in settings.get("feeds", [String]()) {
            let (st, body) = Tools.get(f, timeout: 10)
            guard st == 200, let d = body.data(using: .utf8) else { errs.append("\(f) (HTTP \(st))"); continue }
            let p = RSSParser(); let x = XMLParser(data: d); x.delegate = p; x.parse()
            let host = URL(string: f)?.host ?? f
            for it in p.items.prefix(5) { lines.append("- \(it.0) [\(host), \(it.2.isEmpty ? "date n/c" : it.2)] \(it.1)") }
        }
        if lines.isEmpty { return SourceData(name: "Actualités (RSS)", ok: false, text: "aucun flux lisible : " + errs.joined(separator: " ; ")) }
        return SourceData(name: "Actualités (RSS)", ok: true, text: lines.joined(separator: "\n"))
    }
    func osaSource(_ name: String, _ tool: String) -> SourceData {
        let out = tools.run(tool, "")
        let bad = out.contains("indisponible") || out.contains("a échoué") || out.contains("délai")
        return SourceData(name: name, ok: !bad, text: out)
    }
    func collect(kind: String) -> [SourceData] {
        var s: [SourceData] = []
        let g = DispatchGroup(); let lock = NSLock()
        func add(_ f: @escaping () -> SourceData) { g.enter(); DispatchQueue.global().async { let r = f(); lock.lock(); s.append(r); lock.unlock(); g.leave() } }
        add { self.weather() }
        add { self.osaSource("Agenda (Calendar.app)", "calendar") }
        add { self.osaSource("Mails non lus (Mail.app)", "mail_unread") }
        add { self.osaSource("Rappels (Reminders.app)", "reminders") }
        if kind != "soir" { add { self.news() } }
        g.wait()
        let mem = tools.memory.list().suffix(10)
        if !mem.isEmpty { s.append(SourceData(name: "Mémoire Nova", ok: true, text: mem.map { "- " + ($0["text"] as? String ?? "") }.joined(separator: "\n"))) }
        let order = ["Météo (Open-Meteo)", "Agenda (Calendar.app)", "Mails non lus (Mail.app)", "Rappels (Reminders.app)", "Actualités (RSS)", "Mémoire Nova"]
        return s.sorted { (order.firstIndex(of: $0.name) ?? 9) < (order.firstIndex(of: $1.name) ?? 9) }
    }

    /// Produit un brief. Toujours un résultat : si aucun cerveau ne répond, on livre les données brutes en le disant.
    @discardableResult
    public func generate(kind: String, label: String, manual: Bool, catchUp: Bool = false) -> [String: Any] {
        lock.lock(); if running.contains(kind) { lock.unlock(); return ["error": "déjà en cours"] }; running.insert(kind); lock.unlock()
        defer { lock.lock(); running.remove(kind); lock.unlock() }
        let t0 = Date()
        let src = collect(kind: kind)
        let df = DateFormatter(); df.locale = Locale(identifier: "fr_FR"); df.dateFormat = "EEEE d MMMM yyyy, HH:mm"
        let data = src.map { "### \($0.name)\(($0.ok ? "" : " — INDISPONIBLE"))\n\($0.text)" }.joined(separator: "\n\n")
        let focus = kind == "soir" ? "Fais la fermeture de la journée : ce qui reste ouvert, ce qui est prévu demain, un conseil de repos si la journée a été chargée."
            : (kind == "midi" ? "Fais un point de mi-journée : ce qui change pour l'après-midi, mails/rappels à traiter."
               : "Fais le brief du matin : l'essentiel de la journée (agenda, mails à traiter, rappels), la météo en une ligne, 3 titres d'actualité utiles.")
        let sys = Persona.system(name: settings.get("name", "Nova"), title: settings.get("user_title", "Utilisateur"), memory: "", voice: false, tools: false,
                                 extra: "TÂCHE : \(focus) Format : titre court, puis 4 à 8 puces maximum, la plus urgente en premier. N'utilise QUE les données fournies ci-dessous ; pour une source marquée INDISPONIBLE, écris une seule ligne disant laquelle et pourquoi. Aucun chiffre ni fait hors données. Cite la source entre parenthèses.")
        let res = router.complete(messages: [ChatMsg("user", "Nous sommes le \(df.string(from: Date())).\n\nDONNÉES RÉELLES COLLECTÉES :\n\n\(data)")], system: sys, mode: "bulk", maxTokens: 900)
        var text: String; var brain: String
        if let r = res { text = r.text; brain = router.spec(r.brain)?.label ?? r.brain }
        else {
            brain = "aucun (cerveau hors-ligne)"
            text = "**\(label) — données brutes** (aucun cerveau n'a répondu : brief non rédigé)\n\n" + data
        }
        let item: [String: Any] = ["id": UUID().uuidString.prefix(8).lowercased().description, "kind": kind, "title": label, "ts": nowISO(), "text": text, "brain": brain,
                                   "sources": src.map { $0.asDict() }, "read": false, "manual": manual, "rattrapage": catchUp, "ms": Int(Date().timeIntervalSince(t0) * 1000)]
        var l = store.read(default: [[String: Any]]()); l.append(item); store.write(Array(l.suffix(200)))
        log.add(["kind": kind, "ok": res != nil, "brain": brain, "ms": item["ms"] ?? 0, "manual": manual, "rattrapage": catchUp, "sources_ok": src.filter { $0.ok }.count, "sources": src.count])
        onNew?(item)
        return item
    }

    // MARK: planificateur
    static func minutes(_ hhmm: String) -> Int? {
        let p = hhmm.split(separator: ":").compactMap { Int($0) }; return p.count == 2 ? p[0] * 60 + p[1] : nil
    }
    public func inQuietHours(_ now: Date = Date()) -> Bool {
        guard let a = Briefs.minutes(settings.get("quiet_from", "22:00")), let b = Briefs.minutes(settings.get("quiet_to", "07:00")) else { return false }
        let c = Calendar.current.dateComponents([.hour, .minute], from: now); let m = (c.hour ?? 0) * 60 + (c.minute ?? 0)
        return a > b ? (m >= a || m < b) : (m >= a && m < b)
    }
    /// À appeler toutes les ~20 s. Rattrape un brief manqué (Mac éteint/en veille) jusqu'à 10 h après l'heure prévue.
    public func tick(now: Date = Date()) {
        let cal = Calendar.current; let c = cal.dateComponents([.hour, .minute], from: now)
        let m = (c.hour ?? 0) * 60 + (c.minute ?? 0)
        let day = String(ISO8601DateFormatter().string(from: now).prefix(10))
        var st = state.read(default: [String: String]())
        for b in settings.get("briefs", [[String: Any]]()) {
            guard (b["enabled"] as? Bool) == true, let id = b["id"] as? String, let t = Briefs.minutes(b["time"] as? String ?? ""), st[id] != day else { continue }
            if m >= t && m - t <= 600 {
                st[id] = day; state.write(st)
                let late = m - t > 3
                let th = Thread { self.generate(kind: b["kind"] as? String ?? id, label: b["label"] as? String ?? id, manual: false, catchUp: late) }; th.stackSize = 16 << 20; th.start()
            }
        }
    }
    public func startScheduler() {
        Thread.detachNewThread { while true { Thread.sleep(forTimeInterval: 20); self.tick() } }
    }
}
