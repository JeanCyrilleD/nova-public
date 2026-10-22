import Foundation

/// V21 — Missions : un objectif confié à un Dot, qui avance par petits pas planifiés (même fenêtre fermée tant que Nova tourne),
/// garde un journal d'avancement, et revient vers l'utilisateur quand une décision est nécessaire. Aucun envoi automatique.
public final class Missions: @unchecked Sendable {
    let store = JSONFile("missions.json")
    private let lock = NSLock()
    public init() {}

    public func list() -> [[String: Any]] { store.read(default: [[String: Any]]()) }

    private func mutate(_ f: (inout [[String: Any]]) -> Void) {
        lock.lock(); defer { lock.unlock() }
        var l = store.read(default: [[String: Any]]()); f(&l); store.write(l)
    }

    @discardableResult
    public func add(dot: String, goal: String, everyMin: Int) -> [String: Any] {
        let m: [String: Any] = ["id": String(UUID().uuidString.prefix(8)).lowercased(), "dot": dot, "goal": goal, "status": "active",
                                "every_min": max(15, min(everyMin, 7 * 24 * 60)), "created": nowISO(), "next_due": Date().timeIntervalSince1970, "log": [[String: Any]](), "steps": 0]
        mutate { $0.append(m) }
        return m
    }

    public func patch(_ id: String, _ p: [String: Any]) {
        mutate { l in if let i = l.firstIndex(where: { ($0["id"] as? String) == id }) { for (k, v) in p { l[i][k] = v } } }
    }

    public func remove(_ id: String) { mutate { $0.removeAll { ($0["id"] as? String) == id } } }

    public func appendLog(_ id: String, who: String, text: String) {
        mutate { l in
            guard let i = l.firstIndex(where: { ($0["id"] as? String) == id }) else { return }
            var log = (l[i]["log"] as? [[String: Any]]) ?? []
            log.append(["ts": nowISO(), "who": who, "text": String(text.prefix(1500))])
            l[i]["log"] = Array(log.suffix(30))
        }
    }

    /// Missions dont le prochain pas est dû.
    public func due(now: Date = Date()) -> [[String: Any]] {
        list().filter { ($0["status"] as? String) == "active" && (($0["next_due"] as? Double) ?? 0) <= now.timeIntervalSince1970 }
    }

    /// Tâche donnée au Dot pour le prochain pas : but + journal récent + format de réponse attendu.
    public func task(for m: [String: Any]) -> String {
        let log = ((m["log"] as? [[String: Any]]) ?? []).suffix(6).map { "[\($0["who"] ?? "")] " + String(($0["text"] as? String ?? "").prefix(500)) }.joined(separator: "\n")
        return "MISSION PERMANENTE : \(m["goal"] ?? "")\n\nJournal d'avancement (récent) :\n" + (log.isEmpty ? "(premier pas)" : log) +
               "\n\nFais UN pas concret et vérifiable vers le but avec tes outils, sans refaire ce qui est déjà dans le journal. Rapport final court (6 lignes max) : ce qui est fait, ce qui reste. " +
               "Termine par une dernière ligne exactement de la forme « STATUT: en_cours », « STATUT: terminee » ou « STATUT: decision » ; dans ce dernier cas, ajoute avant elle une ligne « QUESTION: … » précise. N'envoie rien à personne."
    }

    /// Applique le résultat d'un pas : journal, statut, prochaine échéance.
    public func apply(_ id: String, result: String) {
        let lines = result.components(separatedBy: "\n")
        let st = lines.last(where: { $0.uppercased().contains("STATUT:") })?.lowercased() ?? ""
        var status = "active"
        if st.contains("terminee") || st.contains("terminée") { status = "done" } else if st.contains("decision") || st.contains("décision") { status = "waiting" }
        let q = lines.first(where: { $0.uppercased().hasPrefix("QUESTION:") }).map { String($0.dropFirst(9)).trimmingCharacters(in: .whitespaces) } ?? ""
        let body = lines.filter { !$0.uppercased().contains("STATUT:") }.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
        appendLog(id, who: "dot", text: body.isEmpty ? "(pas de rapport)" : body)
        let every = (list().first { ($0["id"] as? String) == id }?["every_min"] as? Int) ?? 240
        let steps = ((list().first { ($0["id"] as? String) == id }?["steps"] as? Int) ?? 0) + 1
        patch(id, ["status": status, "question": q, "steps": steps, "last_run": nowISO(), "next_due": Date().addingTimeInterval(Double(every) * 60).timeIntervalSince1970])
    }
}
