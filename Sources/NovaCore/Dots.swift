import Foundation

/// Un Dot = un agent permanent : rôle, outils autorisés (liste blanche appliquée à l'exécution), cerveau préféré, horaire facultatif.
public final class Dots {
    let router: Router, tools: Tools, settings: Settings
    let store = JSONFile("dots.json"), runs = JSONFile("dots_runs.json")
    public init(router: Router, tools: Tools, settings: Settings) { self.router = router; self.tools = tools; self.settings = settings }

    public static let defaults: [[String: Any]] = baseDefaults + extraDefaults
    static let extraDefaults: [[String: Any]] = [
        ["id": "brvm", "name": "BRVM", "emoji": "📈", "color": "#10b981", "role": "Surveille la Bourse Régionale (BRVM) : cours, variations et annonces de tes titres. Information seulement, aucun conseil d'achat ni d'ordre.",
         "tools": ["know", "recall", "web_search", "web_fetch", "momo"], "brain": "auto", "schedule": "lun-ven 09:30",
         "prompt": "Point BRVM du jour : cherche (web_search puis web_fetch sur une source officielle comme brvm.org ou sikafinance.com) l'indice BRVM Composite et les 3 plus fortes variations ; recoupe avec mes titres connus (recall, know). Donne chaque chiffre avec sa source et sa date ; si une donnée est introuvable, écris « non disponible ». Pas de conseil d'investissement, pas d'ordre. Ajoute un rappel si une échéance mobile money est en retard (momo)."],
        ["id": "analytics", "name": "Analytique", "emoji": "📊", "color": "#84cc16", "role": "Suit les indicateurs, analyse les données et les fichiers, repère les opportunités, prépare des rapports chiffrés.",
         "tools": ["know", "recall", "read_file", "web_search", "web_fetch", "system"], "brain": "auto", "schedule": "lun-ven 18:15",
         "prompt": "Analyse ce que tu peux MESURER : fichiers lisibles du dossier suivi (know), mémoire (recall), état du Mac (system), cours/indicateurs publics (web_search + web_fetch). Donne 3 constats chiffrés avec source et date, 1 opportunité, 1 risque. Aucun chiffre inventé."],
        ["id": "contenu", "name": "Contenu", "emoji": "✍️", "color": "#facc15", "role": "Articles, pages, contenus sociaux, optimisation SEO — en brouillon, dans ton ton.",
         "tools": ["know", "recall", "web_search", "web_fetch", "draft_reply"], "brain": "auto", "schedule": "lun-ven 10:00",
         "prompt": "Propose UN contenu utile aujourd'hui (idée tirée de la mémoire, de know ou d'une actualité vérifiée par web_search) : titre, accroche, plan en 4 points, premier paragraphe rédigé à mon ton, 3 mots-clés SEO. Enregistre le brouillon avec draft_reply. Ne publie rien."],
        ["id": "social", "name": "Social", "emoji": "💬", "color": "#f472b6", "role": "Prépare publications, réponses et planning pour tes réseaux ; suit les résultats. Ne publie jamais seul.",
         "tools": ["know", "recall", "web_search", "draft_reply"], "brain": "auto", "schedule": "lun-ven 11:00",
         "prompt": "Prépare 2 publications (LinkedIn / Facebook) alignées sur mon activité connue (recall, know), avec heure de publication proposée. Livre-les comme brouillons (draft_reply). Rappelle que je publie moi-même."],
        ["id": "code", "name": "Code", "emoji": "💻", "color": "#6366f1", "role": "Lit les projets, repère les bugs et la dette, propose des correctifs et des automatisations. Lecture seule.",
         "tools": ["read_file", "know", "recall", "web_search", "web_fetch"], "brain": "deep", "schedule": "lun-ven 09:00",
         "prompt": "Parcours le dossier suivi (know sur « projet », « erreur », « TODO ») et lis les fichiers pertinents. Signale 1 à 3 problèmes RÉELS (fichier, ligne si connue, cause probable) et la correction proposée. Ne modifie aucun fichier."],
        ["id": "projet", "name": "Projet", "emoji": "✅", "color": "#fb923c", "role": "Planifie, suit l'avancement, coordonne les échéances et te tient au courant.",
         "tools": ["calendar", "reminders", "recall", "remember", "know"], "brain": "auto", "schedule": "08:30",
         "prompt": "Fais le point projets : échéances des 7 prochains jours (calendar, reminders), ce qui est bloqué, la prochaine action pour chaque projet connu (recall, know). Liste courte, priorisée."],
        ["id": "ops", "name": "Opérations", "emoji": "⚙️", "color": "#38bdf8", "role": "Processus, fichiers, données, apps du Mac : surveille et range ce qui peut l'être. Rien n'est supprimé.",
         "tools": ["system", "processes", "read_file", "recall"], "brain": "auto", "schedule": "21:00",
         "prompt": "Vérifie l'état du Mac et les processus gourmands (system, processes). Propose au plus 3 actions de maintenance concrètes, sans rien exécuter. Si tout va bien, réponds « RAS ».", "quiet_ok": true],
    ]
    static let baseDefaults: [[String: Any]] = [
        ["id": "courrier", "name": "Courrier", "emoji": "✉️", "color": "#8b5cf6", "role": "Lit les mails non lus, classe par urgence, prépare des brouillons. N'envoie jamais.",
         "tools": ["mail_unread", "draft_reply", "recall", "remember"], "brain": "auto", "schedule": "lun-ven 08:00,12:30,17:00",
         "prompt": "Utilise mail_unread. Classe les mails en URGENT / À TRAITER / INFO selon des critères que tu expliques (expéditeur connu en mémoire, mot « urgent », échéance datée). Pour les 3 plus importants, prépare un brouillon de réponse avec draft_reply. Résume : combien, lesquels, ce qui est prêt à valider."],
        ["id": "agenda", "name": "Agenda", "emoji": "📅", "color": "#3b82f6", "role": "Plan du jour : rendez-vous, rappels, conflits.",
         "tools": ["calendar", "reminders", "recall"], "brain": "auto", "schedule": "07:45,13:00",
         "prompt": "Lis calendar et reminders. Donne le plan des prochaines 24 h, signale les chevauchements d'horaires que tu constates réellement, et ce qu'il faut préparer."],
        ["id": "veille", "name": "Veille", "emoji": "📡", "color": "#10b981", "role": "Cherche et synthétise l'actualité sur les sujets suivis, avec sources datées.",
         "tools": ["web_search", "web_fetch", "recall", "remember"], "brain": "auto", "schedule": "07:30,18:00",
         "prompt": "Pour chaque sujet suivi (cherche d'abord recall « sujets suivis »; sinon BRVM, Burkina Faso, IA), fais une web_search puis ouvre au besoin la meilleure page avec web_fetch. Résume en puces avec source ET date. Aucun chiffre sans source."],
        ["id": "chercheur", "name": "Chercheur", "emoji": "🔎", "color": "#f59e0b", "role": "Recherche approfondie sur une question, rapport sourcé.",
         "tools": ["web_search", "web_fetch", "read_file", "recall"], "brain": "deep", "schedule": "lun-ven 17:00",
         "prompt": "Réponds à la tâche donnée par une recherche rigoureuse : plusieurs requêtes, lecture des pages utiles, recoupement. Conclus par les sources."],
        ["id": "brvm", "name": "BRVM", "emoji": "📈", "color": "#22c55e", "role": "Veille factuelle du marché BRVM et des sociétés cotées. Aucun conseil d'investissement.", "quiet_ok": false,
         "tools": ["web_search", "web_fetch", "recall", "know"], "brain": "auto", "schedule": "lun-ven 09:30,16:30",
         "prompt": "Fais le point FACTUEL sur la BRVM : indice BRVM Composite et BRVM 10, plus fortes hausses/baisses, annonces de sociétés cotées (dividendes, résultats). Utilise web_search puis web_fetch sur la meilleure source. Chaque chiffre porte sa source ET sa date ; si un cours n'est pas trouvé, dis-le, ne l'invente jamais. Si recall ou know révèlent les valeurs suivies par l'utilisateur, commence par elles. Pas de conseil d'achat ou de vente : des faits."],
        ["id": "mac", "name": "Santé du Mac", "emoji": "🩺", "color": "#06b6d4", "role": "Surveille batterie, mémoire, disque, charge. Ne se manifeste que s'il y a un problème.", "quiet_ok": true,
         "tools": ["system"], "brain": "auto", "schedule": "08:00,14:00,20:00",
         "prompt": "Appelle l'outil system. S'il n'y a RIEN d'anormal (batterie > 20 % ou sur secteur, disque > 10 % libre, mémoire < 90 %), réponds uniquement « RAS ». Sinon, annonce en 2 phrases le problème mesuré et une action concrète. Ne signale que ce qui est mesuré."],
        ["id": "redacteur", "name": "Rédacteur", "emoji": "✍️", "color": "#ec4899", "role": "Rédige messages Teams et mails dans TA charte (salutation, contexte, points clés, action en gras, clôture). Brouillon uniquement.", "quiet_ok": false,
         "tools": ["know", "recall", "draft_reply", "web_search"], "brain": "auto", "schedule": "lun-ven 17:30",
         "prompt": "Rédige le message demandé. D'abord know(\"charte Teams messages format\") pour retrouver les règles de l'utilisateur. Format : salutation, UNE phrase de contexte, points clés en liste, action demandée en gras, ligne de clôture. Livre un HTML simple (<meta charset=\"utf-8\">, paragraphes courts, <b>, <ul>/<ol>, aucun CSS complexe). Enregistre avec draft_reply. N'ENVOIE RIEN : l'utilisateur valide et envoie lui-même."],
    ]
    public func list() -> [[String: Any]] {
        var l = store.read(default: [[String: Any]]()); if l.isEmpty { store.write(Dots.defaults); l = Dots.defaults }
        return l.map { var d = $0; d["persona"] = DotPersonas.persona(for: d); return d }
    }
    public func save(_ d: [String: Any]) {
        var l = list(); let id = d["id"] as? String ?? UUID().uuidString.prefix(8).lowercased().description
        var n = d; n["id"] = id
        if let i = l.firstIndex(where: { ($0["id"] as? String) == id }) { l[i] = n } else { l.append(n) }
        store.write(l)
    }
    public func remove(_ id: String) { store.write(list().filter { ($0["id"] as? String) != id }) }
    public func history(_ id: String? = nil) -> [[String: Any]] {
        let r = runs.read(default: [[String: Any]]()); return (id == nil ? r : r.filter { ($0["dot"] as? String) == id }).reversed()
    }

    @discardableResult
    public func run(id: String, task: String, cancel: @escaping () -> Bool, onEvent: @escaping (BrainEvent) -> Void) -> [String: Any]? {
        guard let d = list().first(where: { ($0["id"] as? String) == id }) else { onEvent(.error("Dot introuvable")); return nil }
        let allowed = Set((d["tools"] as? [String]) ?? [])
        let sys = Persona.system(name: d["name"] as? String ?? "Dot", title: settings.get("user_title", "Utilisateur"), memory: tools.memory.promptBlock(max: 15), voice: false, tools: true,
                                 extra: "TU ES LE DOT « \(d["name"] ?? "") ». RÔLE : \(d["role"] ?? ""). Outils autorisés : \(allowed.sorted().joined(separator: ", ")). Consigne permanente : \(d["prompt"] ?? "")\n" + DotPersonas.prompt(DotPersonas.persona(for: d)) + "\nFORMAT DE SORTIE : ne raconte JAMAIS ta démarche (« je commence par », « je vérifie »). Entre les appels d'outils, n'écris rien. Livre UNIQUEMENT le rapport final : chiffres réels, sources et dates, en puces courtes, 8 lignes maximum.")
        var text = ""; var steps: [[String: String]] = []; var brain = ""
        let t0 = Date()
        let agent = Agent(router: router, tools: tools)
        agent.run(messages: [ChatMsg("user", task.isEmpty ? "Exécute ta mission maintenant." : task)], system: sys,
                  mode: (d["brain"] as? String) == "deep" ? "deep" : "bulk", preferred: nil, maxTokens: 1400, useTools: true, maxSteps: 5, allowed: allowed, actor: "Dot " + (d["name"] as? String ?? ""), cancel: cancel) { ev in
            switch ev {
            case .delta(let t): text += t
            case .tool(let n, let i, let o): text = ""; steps.append(["tool": n, "input": String(i.prefix(200)), "output": String(o.prefix(400))])
            case .start(_, let l): brain = l
            default: break
            }
            onEvent(ev)
        }
        for mark in ["<｜DSML", "<|DSML", "< | DSML", "<｜ DSML", "<tool_call", "<function_calls"] { if let r = text.range(of: mark) { text = String(text[..<r.lowerBound]) } }   // balises d'appel d'outil mal formées (DeepSeek) : jamais dans un rapport
        text = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let item: [String: Any] = ["id": UUID().uuidString.prefix(8).lowercased().description, "dot": id, "task": task, "ts": nowISO(), "result": text, "steps": steps,
                                   "brain": brain, "ok": !text.isEmpty, "ms": Int(Date().timeIntervalSince(t0) * 1000), "read": false]
        var r = runs.read(default: [[String: Any]]()); r.append(item); runs.write(Array(r.suffix(300)))
        return item
    }
}
