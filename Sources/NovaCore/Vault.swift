import Foundation

/// Coffre Finances / Santé : verrouillé par défaut, code choisi par l'utilisateur (jamais stocké en clair : dérivation faite côté interface,
/// seul l'empreinte est conservée). Les routes de données refusent (423) tant que le coffre n'est pas déverrouillé.
/// Extraction de texte PDF fournie par la couche Mac (PDFKit) ; absente sous Linux.
public enum VaultHooks { nonisolated(unsafe) public static var pdfText: ((String) -> String?)? }

final class VaultState {
    let lock = NSLock()
    var tokens: [String: Date] = [:]
    var fails = 0
    var lockedUntil = Date.distantPast
}

extension NovaApp {
    func vaultRoutes() {
        let s = server
        let cfg = JSONFile("vault_config.json")
        let st = VaultState()
        func valid(_ req: Request) -> Bool {
            let t = req.headers["x-vault"] ?? ""
            st.lock.lock(); defer { st.lock.unlock() }
            st.tokens = st.tokens.filter { $0.value > Date() }
            return st.tokens[t] != nil
        }
        func store(_ d: String) -> JSONFile { JSONFile("vault_\(d == "sante" ? "sante" : "finance").json") }

        portfolioRoutes(valid: valid)
        s.on("GET", "/api/vault/status") { req, res in
            let c = cfg.read(default: [String: Any]())
            res.json(["configured": c["hash"] != nil, "unlocked": valid(req), "salt": (c["salt"] as? String) as Any? ?? NSNull(), "wait": max(0, Int(st.lockedUntil.timeIntervalSinceNow))])
        }
        s.on("POST", "/api/vault/setup") { req, res in
            var c = cfg.read(default: [String: Any]())
            if c["hash"] != nil && !(valid(req)) { res.json(["error": "coffre déjà configuré : déverrouille-le d'abord pour changer le code"], status: 423); return }
            guard let salt = req.json["salt"] as? String, let hash = req.json["hash"] as? String, salt.count >= 16, hash.count >= 32 else { res.json(["error": "code invalide"], status: 400); return }
            c["salt"] = salt; c["hash"] = hash; cfg.write(c); res.json(["ok": true])
        }
        s.on("POST", "/api/vault/unlock") { req, res in
            let c = cfg.read(default: [String: Any]())
            guard let h = c["hash"] as? String else { res.json(["error": "aucun code défini"], status: 400); return }
            st.lock.lock(); defer { st.lock.unlock() }
            if Date() < st.lockedUntil { res.json(["error": "trop d'essais, attends \(Int(st.lockedUntil.timeIntervalSinceNow)) s"], status: 429); return }
            if (req.json["hash"] as? String) == h {
                st.fails = 0; let t = UUID().uuidString; st.tokens[t] = Date().addingTimeInterval(15 * 60); res.json(["token": t, "ttl": 900])
            } else {
                st.fails += 1; if st.fails >= 5 { st.lockedUntil = Date().addingTimeInterval(60); st.fails = 0 }
                res.json(["error": "code incorrect"], status: 401)
            }
        }
        s.on("POST", "/api/vault/lock") { req, res in st.lock.lock(); st.tokens.removeValue(forKey: req.headers["x-vault"] ?? ""); st.lock.unlock(); res.json(["ok": true]) }
        s.on("GET", "/api/vault/data") { req, res in
            guard valid(req) else { res.json(["error": "coffre verrouillé"], status: 423); return }
            res.json(store(req.query["domain"] ?? "finance").read(default: ["sources": [] as [Any]]))
        }
        s.on("POST", "/api/vault/import") { req, res in
            guard valid(req) else { res.json(["error": "coffre verrouillé"], status: 423); return }
            let dom = (req.json["domain"] as? String) ?? "finance"
            var path = (req.json["path"] as? String) ?? ""
            if path.hasPrefix("~") { path = NSHomeDirectory() + path.dropFirst() }
            let home = NSHomeDirectory()
            let bad = ["/.ssh", "/.gnupg", "/Library/Keychains", "/.bionic-tools", "/.aws", "/.config/gcloud", ".key", ".pem", "secret", "token", "password", "motdepasse"]
            guard path.hasPrefix(home + "/"), !bad.contains(where: { path.lowercased().contains($0.lowercased()) }) else { res.json(["error": "chemin refusé (hors de ton dossier ou emplacement sensible)"], status: 400); return }
            var pdfLines: [String]? = nil
            if path.lowercased().hasSuffix(".pdf") { guard let t = VaultHooks.pdfText?(path), !t.isEmpty else { res.json(["error": "PDF sans texte lisible (scan/image ?) — exporte plutôt en CSV ou Excel depuis la plateforme"], status: 400); return }; pdfLines = t.split(whereSeparator: \.isNewline).map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty } }
            guard let data = FileManager.default.contents(atPath: path), data.count < 8_000_000, let text = pdfLines != nil ? "" : String(data: data, encoding: .utf8) else { res.json(["error": "fichier illisible ou trop gros (> 8 Mo)"], status: 400); return }
            var cols: [String] = []; var rows: [[String]] = []
            if let pl = pdfLines {
                let parts = pl.prefix(2000).map { l in l.components(separatedBy: "  ").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty } }
                let w = max(1, parts.map(\.count).max() ?? 1); cols = (1...w).map { "col\($0)" }; rows = parts.map { $0 + Array(repeating: "", count: w - $0.count) }
            } else if path.lowercased().hasSuffix(".json"), let j = try? JSONSerialization.jsonObject(with: data) {
                func str(_ v: Any?) -> String { if let s = v as? String { return s }; if let n = v as? NSNumber { return n.stringValue }; return v == nil ? "" : "\(v!)" }
                if let arr = j as? [[String: Any]] { cols = Array(Set(arr.flatMap { $0.keys })).sorted(); rows = arr.prefix(2000).map { o in cols.map { str(o[$0]) } } }
                else if let o = j as? [String: Any] { cols = ["clé", "valeur"]; rows = o.keys.sorted().map { [$0, str(o[$0])] } }
            } else {
                let lines = text.split(whereSeparator: \.isNewline).map(String.init)
                let delim: Character = (lines.first?.filter { $0 == ";" }.count ?? 0) > (lines.first?.filter { $0 == "," }.count ?? 0) ? ";" : ((lines.first?.contains("\t") ?? false) ? "\t" : ",")
                func split(_ l: String) -> [String] { var out: [String] = [], cur = "", q = false
                    for ch in l { if ch == "\"" { q.toggle() } else if ch == delim && !q { out.append(cur); cur = "" } else { cur.append(ch) } }
                    out.append(cur); return out.map { $0.trimmingCharacters(in: .whitespaces) } }
                if let f = lines.first { cols = split(f); rows = lines.dropFirst().prefix(2000).map(split) }
            }
            guard !cols.isEmpty else { res.json(["error": "format non reconnu (CSV, JSON ou PDF texte attendu)"], status: 400); return }
            let f = store(dom); var d = f.read(default: ["sources": [] as [Any]])
            var srcs = (d["sources"] as? [[String: Any]]) ?? []
            let id = String(UUID().uuidString.prefix(8)).lowercased()
            srcs.append(["id": id, "label": (req.json["label"] as? String) ?? (path as NSString).lastPathComponent, "path": path, "imported": nowISO(), "columns": cols, "rows": rows])
            d["sources"] = srcs; f.write(d); res.json(["ok": true, "id": id, "rows": rows.count, "columns": cols])
        }
        s.on("POST", "/api/vault/remove") { req, res in
            guard valid(req) else { res.json(["error": "coffre verrouillé"], status: 423); return }
            let f = store((req.json["domain"] as? String) ?? "finance"); var d = f.read(default: ["sources": [] as [Any]])
            d["sources"] = ((d["sources"] as? [[String: Any]]) ?? []).filter { ($0["id"] as? String) != (req.json["id"] as? String) }; f.write(d); res.json(["ok": true])
        }
    }
}
