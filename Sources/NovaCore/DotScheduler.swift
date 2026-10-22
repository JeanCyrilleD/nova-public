import Foundation

/// V10 — Planificateur de Dots : à l'heure prévue le Dot s'exécute, puis « apparaît » dans l'interface (événement SSE « dot »),
/// livre son résultat et ATTEND : ouvrir, attendre, ou reporter (plus tard). Un Dot n'envoie jamais rien tout seul.
public final class DotScheduler: @unchecked Sendable {
    let dots: Dots, settings: Settings, briefs: Briefs
    let publish: (String, Any) -> Void
    let state = JSONFile("dots_etat.json")      // { dotId: { "last": "YYYY-MM-DDTHH:MM" } }
    let pending = JSONFile("dots_attente.json") // dots livrés, pas encore acquittés : [{run_id, dot, until?}]
    public let missions = Missions()
    private var running = Set<String>()
    private let lock = NSLock()

    public init(dots: Dots, settings: Settings, briefs: Briefs, publish: @escaping (String, Any) -> Void) {
        self.dots = dots; self.settings = settings; self.briefs = briefs; self.publish = publish
        migrate()
    }

    static let defaultSchedules: [String: String] = ["veille": "07:30", "agenda": "07:45", "courrier": "lun-ven 12:30", "bilan": "18:30"]
    static let bilan: [String: Any] = [
        "id": "bilan", "name": "Bilan du jour", "emoji": "🌙", "color": "#f59e0b", "role": "Fait le bilan de fin de journée : ce qui s'est passé, ce qui reste, ce qu'il faut préparer pour demain.",
        "tools": ["calendar", "reminders", "recall", "remember", "know", "today"], "brain": "auto", "schedule": "18:30",
        "prompt": "Fais le bilan de la journée de l'utilisateur en 3 blocs courts : 1) CE QUI S'EST PASSÉ (appuie-toi UNIQUEMENT sur les résultats des Dots du jour fournis dans la tâche et sur la mémoire), 2) CE QUI RESTE (rappels, agenda de demain via les outils), 3) À PRÉPARER POUR DEMAIN (3 points max). Ne dis rien que tu ne puisses pas appuyer sur ces données. Termine par une phrase chaleureuse."]

    /// Ajoute le Dot « bilan » et des horaires par défaut (une seule fois ; l'utilisateur peut tout modifier ensuite).
    private func migrate() {
        if !settings.get("dots_migrated_v21b", false) {   // v21 : TOUS les Dots deviennent actifs (horaires par défaut), sans écraser un horaire choisi
            var l = dots.list(); let defs = Dictionary(uniqueKeysWithValues: Dots.defaults.compactMap { d in (d["id"] as? String).map { ($0, d["schedule"] as? String ?? "") } })
            for i in l.indices { if let id = l[i]["id"] as? String, (l[i]["schedule"] as? String ?? "").isEmpty, let s = defs[id], !s.isEmpty { l[i]["schedule"] = s } }
            for i in l.indices { l[i].removeValue(forKey: "persona") }
            for nd in Dots.defaults where !l.contains(where: { ($0["id"] as? String) == (nd["id"] as? String) }) { l.append(nd) }
            dots.store.write(l); settings.set(["dots_migrated_v21b": true])
        }
        if !settings.get("dots_migrated_v47", false) {   // v47 : ajoute le Dot BRVM, sans toucher aux Dots existants
            var l = dots.list()
            for nd in Dots.defaults where !l.contains(where: { ($0["id"] as? String) == (nd["id"] as? String) }) { l.append(nd) }
            dots.store.write(l); settings.set(["dots_migrated_v47": true])
        }
        guard !settings.get("dots_migrated_v10b", false) else { return }
        var l = dots.list()
        for i in l.indices { if let id = l[i]["id"] as? String, (l[i]["schedule"] as? String ?? "").isEmpty, let s = DotScheduler.defaultSchedules[id] { l[i]["schedule"] = s } }
        for d in Dots.defaults + [DotScheduler.bilan] { if !l.contains(where: { ($0["id"] as? String) == (d["id"] as? String) }) { l.append(d) } }
        dots.store.write(l)
        settings.set(["dots_migrated_v10b": true])
    }

    /// "07:30" ou "07:30,12:00" ; préfixe facultatif "lun-ven " / "we ".
    static func slots(_ schedule: String, now: Date) -> [String] {
        var s = schedule.lowercased().trimmingCharacters(in: .whitespaces); if s.isEmpty { return [] }
        let cal = Calendar(identifier: .gregorian); let wd = (cal.component(.weekday, from: now) + 5) % 7   // 0 = lundi
        let names = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"]
        if let r = s.range(of: #"^([a-zé]{2,3}(-[a-zé]{3})?)\s+"#, options: .regularExpression) {
            let d = String(s[r]).trimmingCharacters(in: .whitespaces); s = String(s[r.upperBound...])
            let p = d.split(separator: "-").map(String.init)
            if p.count == 2, let a = names.firstIndex(of: p[0]), let b = names.firstIndex(of: p[1]) { if !(a <= b ? (wd >= a && wd <= b) : (wd >= a || wd <= b)) { return [] } }
            else if p.count == 1, let a = names.firstIndex(of: p[0]) { if wd != a { return [] } }
            else if d == "we" { if wd < 5 { return [] } }
        }
        return s.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { $0.range(of: #"^\d{1,2}:\d{2}$"#, options: .regularExpression) != nil }
    }

    /// À appeler toutes les ~20 s. Rattrape un créneau manqué (Mac en veille) jusqu'à 3 h après l'heure.
    public func tick(now: Date = Date()) {
        guard settings.get("dots_auto", true), !briefs.inQuietHours() else { releaseSnoozed(now); return }
        let cal = Calendar.current; let day = ISO8601DateFormatter().string(from: now).prefix(10)
        let mins = cal.component(.hour, from: now) * 60 + cal.component(.minute, from: now)
        var st = state.read(default: [String: Any]())
        for d in dots.list() {
            guard let id = d["id"] as? String else { continue }
            for slot in DotScheduler.slots(d["schedule"] as? String ?? "", now: now) {
                let p = slot.split(separator: ":"); guard p.count == 2, let h = Int(p[0]), let m = Int(p[1]) else { continue }
                let t = h * 60 + m; let key = "\(day)T\(slot)"
                let last = ((st[id] as? [String: Any])?["last"] as? [String]) ?? []
                if mins >= t, mins - t <= 180, !last.contains(key) {
                    lock.lock(); let busy = running.contains(id) || running.count >= 2; if !busy { running.insert(id) }; lock.unlock()
                    if busy { continue }   // plafond : 2 Dots planifiés en parallèle (les autres attendent le tick suivant, le créneau reste ouvert 3 h)
                    st[id] = ["last": Array((last + [key]).suffix(8))]; state.write(st)
                    launch(d, task: id == "bilan" ? bilanTask() : "")
                }
            }
        }
        tickMissions(now)
        releaseSnoozed(now)
    }

    /// Avance les missions dues (un pas à la fois, un Dot occupé attend son tour).
    func tickMissions(_ now: Date) {
        for m in missions.due(now: now) {
            guard let mid = m["id"] as? String, let did = m["dot"] as? String, let d = dots.list().first(where: { ($0["id"] as? String) == did }) else { continue }
            lock.lock(); let busy = running.contains(did) || running.count >= 3; if !busy { running.insert(did) }; lock.unlock()
            if busy { continue }
            missions.patch(mid, ["next_due": now.addingTimeInterval(600).timeIntervalSince1970])   // garde-fou si le pas échoue
            launch(d, task: missions.task(for: m), manual: false) { [missions] text in if !text.isEmpty { missions.apply(mid, result: text) } }
        }
    }

    /// Lancement manuel (bouton « Faire apparaître ») ou planifié.
    public func launch(_ d: [String: Any], task: String, manual: Bool = false, then: ((String) -> Void)? = nil) {
        let id = d["id"] as? String ?? ""
        Thread.detachNewThread { [self] in
            publish("dot", ["phase": "working", "dot": id, "name": d["name"] ?? "", "emoji": d["emoji"] ?? "●", "color": d["color"] ?? "#D93226"])
            let r = dots.run(id: id, task: task, cancel: { false }) { _ in }
            lock.lock(); running.remove(id); lock.unlock()
            let text = (r?["result"] as? String) ?? ""
            let ok = !text.isEmpty
            then?(text)
            if (d["quiet_ok"] as? Bool) == true, text.trimmingCharacters(in: .whitespacesAndNewlines).uppercased().hasPrefix("RAS") { publish("dot", ["phase": "idle", "dot": id]); return }   // rien à signaler : le Dot reste discret
            if !manual, !AmeSilence.allow(plafond: settings.get("dots_plafond", 6)) { publish("dot", ["phase": "idle", "dot": id]); return }   // silence : plafond d'interruptions atteint (le résultat reste dans l'onglet Dots)
            var p = pending.read(default: [[String: Any]]())
            let rid = (r?["id"] as? String) ?? UUID().uuidString.prefix(8).lowercased().description
            p.append(["run_id": rid, "dot": id, "ts": nowISO()]); pending.write(Array(p.suffix(30)))
            publish("dot", ["phase": "ready", "dot": id, "name": d["name"] ?? "", "emoji": d["emoji"] ?? "●", "color": d["color"] ?? "#D93226", "run_id": rid, "ok": ok,
                            "summary": ok ? String(text.replacingOccurrences(of: "\n", with: " ").prefix(240)) : "Je n'ai pas pu produire de résultat (aucun cerveau n'a répondu)."])
        }
    }

    func bilanTask() -> String {
        let today = String(ISO8601DateFormatter().string(from: Date()).prefix(10))
        let runs = dots.history().filter { (($0["ts"] as? String) ?? "").hasPrefix(today) && ($0["dot"] as? String) != "bilan" && ($0["ok"] as? Bool) == true }
        let body = runs.prefix(8).map { "• \($0["dot"] ?? "") (\(String((($0["ts"] as? String) ?? "").dropFirst(11).prefix(5)))) : " + String(($0["result"] as? String ?? "").replacingOccurrences(of: "\n", with: " ").prefix(500)) }.joined(separator: "\n")
        return "Fais le bilan de la journée du \(today). Résultats des Dots d'aujourd'hui :\n" + (body.isEmpty ? "(aucun Dot n'a livré de résultat aujourd'hui)" : body)
    }

    // MARK: attente / report
    public func snooze(runId: String, minutes: Int) {
        var p = pending.read(default: [[String: Any]]())
        if let i = p.firstIndex(where: { ($0["run_id"] as? String) == runId }) { p[i]["until"] = Date().addingTimeInterval(Double(max(1, min(minutes, 24 * 60)) * 60)).timeIntervalSince1970; pending.write(p) }
    }
    public func ack(runId: String) { pending.write(pending.read(default: [[String: Any]]()).filter { ($0["run_id"] as? String) != runId }) }
    public func waiting() -> [[String: Any]] {
        let now = Date().timeIntervalSince1970
        return pending.read(default: [[String: Any]]()).compactMap { p -> [String: Any]? in
            if let u = p["until"] as? Double, u > now { return nil }
            guard let rid = p["run_id"] as? String, let run = dots.history().first(where: { ($0["id"] as? String) == rid }),
                  let d = dots.list().first(where: { ($0["id"] as? String) == (p["dot"] as? String) }) else { return nil }
            return ["run_id": rid, "dot": p["dot"] ?? "", "name": d["name"] ?? "", "emoji": d["emoji"] ?? "●", "color": d["color"] ?? "#D93226",
                    "summary": String(((run["result"] as? String) ?? "").replacingOccurrences(of: "\n", with: " ").prefix(240)), "ts": run["ts"] ?? ""]
        }
    }
    private func releaseSnoozed(_ now: Date) {
        var p = pending.read(default: [[String: Any]]()); var changed = false
        for i in p.indices { if let u = p[i]["until"] as? Double, u <= now.timeIntervalSince1970 {
            p[i].removeValue(forKey: "until"); changed = true
            if let w = waiting().first(where: { ($0["run_id"] as? String) == (p[i]["run_id"] as? String) }) { var e = w; e["phase"] = "ready"; e["snoozed"] = true; publish("dot", e) } } }
        if changed { pending.write(p) }
    }
}
