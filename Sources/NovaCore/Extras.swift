import Foundation
#if canImport(FoundationXML)
import FoundationXML
#endif
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// V10 — routes des onglets « outils » : chaque onglet de l'interface s'appuie sur une route réelle ici.
extension NovaApp {
    func extraRoutes() {
        mediaRoutes()
        vaultRoutes()
        ameRoutes()
        let s = server
        let notes = JSONFile("notes.json")

        // Outils en lecture (jamais d'envoi, de suppression ni d'écriture) — utilisables directement depuis les onglets.
        // Instantané texte d'une boîte web (Outlook « ol », Gmail « gm ») envoyé par l'interface ; sert à mail_unread quand Mail.app ne répond pas.
        s.on("POST", "/api/webmail") { req, res in
            WebMail.put(id: (req.json["id"] as? String) ?? "", text: (req.json["text"] as? String) ?? "")
            res.json(["ok": true])
        }
        s.on("POST", "/api/tool") { [self] req, res in
            let name = (req.json["name"] as? String) ?? "", arg = (req.json["arg"] as? String) ?? ""
            guard ["web_search", "web_fetch", "mail_unread", "calendar", "reminders", "read_file", "recall", "know", "system", "nova_self", "remember", "draft_reply", "transcribe", "notes", "contacts", "find", "clipboard", "today", "shortcut", "ui", "momo"].contains(name),
                  !(name == "momo" && !["", "list"].contains(arg.trimmingCharacters(in: .whitespaces).lowercased())),
                  !(name == "shortcut" && arg.trimmingCharacters(in: .whitespaces).lowercased() != "list"),
                  !(name == "ui" && !["windows", "screens"].contains(arg.trimmingCharacters(in: .whitespaces).lowercased())) else {
                res.json(["error": "outil inconnu ou non autorisé"], status: 400); return }
            let out = tools.run(name, arg, why: "Demande directe depuis l'interface", actor: "Toi")
            res.json(["name": name, "output": out])
        }

        // Veille : articles réels des flux RSS configurés
        s.on("GET", "/api/feed") { [self] _, res in
            var items: [[String: Any]] = []; var errs: [String] = []
            let g = DispatchGroup(); let lock = NSLock()
            for f in settings.get("feeds", [String]()) {
                g.enter()
                Thread.detachNewThread {
                    defer { g.leave() }
                    let (st, body) = Tools.get(f, timeout: 10)
                    guard st == 200, let d = body.data(using: .utf8) else { lock.lock(); errs.append("\(f) (HTTP \(st))"); lock.unlock(); return }
                    let p = RSSParser(); let x = XMLParser(data: d); x.delegate = p; x.parse()
                    let host = URL(string: f)?.host ?? f
                    lock.lock()
                    for it in p.items.prefix(12) { items.append(["title": it.0, "link": it.1, "date": it.2, "source": host]) }
                    lock.unlock()
                }
            }
            _ = g.wait(timeout: .now() + 14)
            res.json(["items": items, "errors": errs])
        }

        s.on("GET", "/api/ls") { req, res in
            var path = req.query["path"] ?? "~"; if path.hasPrefix("~") { path = NSHomeDirectory() + path.dropFirst() }
            let home = NSHomeDirectory()
            path = (URL(fileURLWithPath: path).standardized.resolvingSymlinksInPath().path)   // « .. » et liens symboliques résolus avant le contrôle
            let bad = ["/.ssh", "/.gnupg", "/library", "/.bionic-tools", "/.aws", "/.config", "/nova-finances"]
            guard (path == home || path.hasPrefix(home + "/")), !bad.contains(where: { path.lowercased().contains($0) }) else { res.json(["error": "dossier refusé (hors de ton espace personnel ou sensible)"]); return }
            guard let names = try? FileManager.default.contentsOfDirectory(atPath: path) else { res.json(["error": "dossier illisible ou inexistant"]); return }
            let items: [[String: Any]] = names.filter { !$0.hasPrefix(".") }.sorted().prefix(300).map { n in
                var isDir: ObjCBool = false; let full = path + "/" + n; FileManager.default.fileExists(atPath: full, isDirectory: &isDir)
                let a = (try? FileManager.default.attributesOfItem(atPath: full)) ?? [:]
                return ["name": n, "dir": isDir.boolValue, "size": (a[.size] as? NSNumber)?.intValue ?? 0, "mtime": ((a[.modificationDate] as? Date).map { ISO8601DateFormatter().string(from: $0) }) ?? ""] }
            res.json(["path": path, "items": items])
        }
        // Connaissances : indexation locale + recherche
        s.on("GET", "/api/knowledge/status") { [self] _, res in
            res.json(["status": Knowledge.shared.status(), "roots": settings.get("knowledge_roots", Knowledge.defaultRoots)])
        }
        s.on("POST", "/api/knowledge/roots") { [self] req, res in
            let r = (req.json["roots"] as? [String] ?? []).map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }.prefix(12)
            settings.set(["knowledge_roots": Array(r)]); res.json(["ok": true, "roots": Array(r)])
        }
        s.on("POST", "/api/knowledge/scan") { [self] _, res in
            Knowledge.shared.scan(roots: settings.get("knowledge_roots", Knowledge.defaultRoots)); res.json(["ok": true])
        }
        s.on("GET", "/api/knowledge/search") { req, res in res.json(["items": Knowledge.shared.search(req.query["q"] ?? "", limit: 8)]) }
        s.on("GET", "/api/system") { _, res in res.json(SystemInfo.snapshot()) }
        s.on("GET", "/api/engines") { [self] _, res in
            res.json(["items": router.engines(force: true).map { ["name": $0.name, "base": $0.base, "models": $0.models] as [String: Any] }, "preferred": settings.get("local_model", "")])
        }
        // Notes
        s.on("GET", "/api/notes") { _, res in res.json(["items": notes.read(default: [[String: Any]]())]) }
        s.on("POST", "/api/notes/save") { req, res in
            var l = notes.read(default: [[String: Any]]())
            let id = (req.json["id"] as? String) ?? String(UUID().uuidString.prefix(8)).lowercased()
            let n: [String: Any] = ["id": id, "title": (req.json["title"] as? String) ?? "", "body": (req.json["body"] as? String) ?? "", "updated": nowISO(),
                                  "kind": (req.json["kind"] as? String) ?? "note", "done": (req.json["done"] as? Bool) ?? false]
            if let i = l.firstIndex(where: { ($0["id"] as? String) == id }) { l[i] = n } else { l.insert(n, at: 0) }
            notes.write(l); res.json(["item": n])
        }
        s.on("POST", "/api/notes/remove") { req, res in
            let id = (req.json["id"] as? String) ?? ""
            notes.write(notes.read(default: [[String: Any]]()).filter { ($0["id"] as? String) != id }); res.json(["ok": true])
        }

        // Conseil : plusieurs IA répondent en parallèle, puis un président synthétise (désaccords signalés).
        s.on("POST", "/api/council") { [self] req, res in
            let q = ((req.json["question"] as? String) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            guard !q.isEmpty else { res.json(["error": "question vide"], status: 400); return }
            var wanted = (req.json["members"] as? [String]) ?? []
            if wanted.isEmpty {   // auto : jusqu'à 4 cerveaux joignables, de fournisseurs différents
                var seen = Set<String>()
                for b in router.plan(mode: "deep", preferred: nil) where !router.disabled.contains(b.id) && !router.isDead(b.id) && b.kind != .local && b.keys.resolve(keys) != nil {
                    let fam = b.model.split(separator: "/").first.map(String.init) ?? b.id
                    if seen.insert(fam).inserted { wanted.append(b.id) }
                    if wanted.count >= 4 { break }
                }
            }
            res.sseStart()
            let specs = wanted.compactMap { id in router.brains.first { $0.id == id } }
            res.sse("members", ["items": specs.map { ["id": $0.id, "label": $0.label] }])
            let sys = Persona.system(name: settings.get("name", "Nova"), title: settings.get("user_title", "Utilisateur"), memory: memory.promptBlock(), voice: false, tools: false)
            var answers: [String: String] = [:]; let lock = NSLock(); let g = DispatchGroup()
            for sp in specs {
                g.enter()
                Thread.detachNewThread {
                    defer { g.leave() }
                    var txt = ""
                    do {
                        try router.runner.stream(sp, messages: [ChatMsg("user", q)], system: sys, maxTokens: 700, mode: "deep", firstTokenTimeout: 25, cancel: { res.clientGone }, onDelta: { d in
                            txt += d; lock.lock(); _ = res.sse("mdelta", ["id": sp.id, "t": d]); lock.unlock()
                        }, onUsage: { _, _ in })
                        lock.lock(); answers[sp.id] = txt; _ = res.sse("mdone", ["id": sp.id, "ok": true]); lock.unlock()
                    } catch {
                        let m = (error as? BrainFailure)?.message ?? "échec"
                        lock.lock(); _ = res.sse("mdone", ["id": sp.id, "ok": false, "error": m]); lock.unlock()
                    }
                }
            }
            _ = g.wait(timeout: .now() + 120)
            let got = specs.filter { answers[$0.id] != nil && !(answers[$0.id]!.isEmpty) }
            if got.isEmpty { res.sse("error", ["message": "Aucun membre du conseil n'a pu répondre (voir Routeur & santé)."]); res.sse("done", ["ok": false]); return }
            let digest = got.map { "### \($0.label)\n\(answers[$0.id]!)" }.joined(separator: "\n\n")
            let chairSys = "Tu présides un conseil d'IA pour \(settings.get("name", "Nova")). Tu reçois les avis de \(got.count) membres. Rends : 1) la réponse recommandée, nette et actionnable ; 2) les points d'accord ; 3) les désaccords ou incertitudes, nommément. N'invente rien qui ne figure dans aucun avis ou dans ta connaissance sûre. Français."
            res.sse("chair", ["start": true])
            _ = router.chat(messages: [ChatMsg("user", "Question : \(q)\n\nAvis du conseil :\n\(digest)")], system: chairSys, mode: "deep", maxTokens: 1000, cancel: { res.clientGone }) { ev in
                switch ev {
                case .start(_, let l): res.sse("chairbrain", ["label": l])
                case .delta(let t): res.sse("delta", ["t": t])
                case .error(let m): res.sse("error", ["message": m])
                default: break
                }
            }
            res.sse("done", ["ok": true, "members": got.count])
        }
    }
}

final class PodParser: NSObject, XMLParserDelegate {
    var eps: [[String: String]] = []; var channelTitle = ""
    var cur = "", title = "", url = "", date = "", dur = "", inItem = false
    func parser(_ p: XMLParser, didStartElement e: String, namespaceURI: String?, qualifiedName: String?, attributes: [String: String] = [:]) {
        cur = ""; if e == "item" { inItem = true; title = ""; url = ""; date = ""; dur = "" }
        if e == "enclosure", inItem, let u = attributes["url"] { url = u }
    }
    func parser(_ p: XMLParser, foundCharacters s: String) { cur += s }
    func parser(_ p: XMLParser, foundCDATA b: Data) { cur += String(decoding: b, as: UTF8.self) }
    func parser(_ p: XMLParser, didEndElement e: String, namespaceURI: String?, qualifiedName: String?) {
        let t = cur.trimmingCharacters(in: .whitespacesAndNewlines)
        if inItem { if e == "title" { title = t } else if e == "pubDate" { date = t } else if e == "itunes:duration" { dur = t } }
        else if e == "title", channelTitle.isEmpty { channelTitle = t }
        if e == "item" { inItem = false; if !url.isEmpty { eps.append(["title": title, "url": url, "date": date, "duration": dur]) } }
    }
}

extension NovaApp {
    func mediaRoutes() {
        let s = server
        func publicHost(_ u: URL) -> Bool { guard let h = u.host, u.scheme == "https" else { return false }
            return !(["localhost", "127.0.0.1", "0.0.0.0"].contains(h) || h.hasPrefix("192.168.") || h.hasPrefix("10.") || h.hasPrefix("172.16.") || h.hasPrefix("169.254.") || h.hasSuffix(".local")) }
        s.on("GET", "/api/podcast/search") { req, res in
            let q = (req.query["q"] ?? "").addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
            let (st, body) = Tools.get("https://itunes.apple.com/search?media=podcast&limit=12&term=" + q, timeout: 10)
            guard st == 200, let o = parseJSON(Data(body.utf8)), let arr = o["results"] as? [[String: Any]] else { res.json(["error": "recherche indisponible (HTTP \(st))", "items": [] as [Any]]); return }
            res.json(["items": arr.compactMap { r -> [String: Any]? in guard let f = r["feedUrl"] as? String else { return nil }
                return ["name": (r["collectionName"] as? String) ?? "", "artist": (r["artistName"] as? String) ?? "", "feed": f, "art": (r["artworkUrl100"] as? String) ?? ""] }])
        }
        s.on("GET", "/api/podcast/episodes") { req, res in
            guard let f = req.query["feed"], let u = URL(string: f), publicHost(u) else { res.json(["error": "flux refusé"], status: 400); return }
            let (st, body) = Tools.get(f, timeout: 12)
            guard st == 200, let d = body.data(using: .utf8) else { res.json(["error": "flux illisible (HTTP \(st))", "items": [] as [Any]]); return }
            let p = PodParser(); let x = XMLParser(data: d); x.delegate = p; x.parse()
            res.json(["title": p.channelTitle, "items": Array(p.eps.prefix(25))])
        }
    }
}
