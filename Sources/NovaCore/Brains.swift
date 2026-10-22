import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

public struct ChatMsg { public var role: String; public var content: String
    public init(_ r: String, _ c: String) { role = r; content = c } }

public enum BrainKind { case openai, anthropic, gateway, local }

public struct BrainSpec {
    public var id: String
    public var label: String
    public var kind: BrainKind
    public var baseURL: String           // URL complète du endpoint de chat
    public var model: String
    public var keys: KeyChain
    public var tags: Set<String>         // "rapide", "puissant", "local", "voix"
    public var note: String
    public var extraHeaders: [String: String] = [:]
    public init(id: String, label: String, kind: BrainKind, baseURL: String, model: String, keys: KeyChain,
                tags: Set<String>, note: String = "", extraHeaders: [String: String] = [:]) {
        self.id = id; self.label = label; self.kind = kind; self.baseURL = baseURL; self.model = model
        self.keys = keys; self.tags = tags; self.note = note; self.extraHeaders = extraHeaders
    }
}

public enum BrainEvent {
    case start(id: String, label: String)
    case delta(String)
    case failover(from: String, to: String, reason: String, kind: String)
    case usage(input: Int, output: Int)
    case done(id: String, label: String)
    case tool(name: String, input: String, output: String)
    case error(String)
}

public struct BrainFailure: Error { public let kind: ErrKind; public let message: String }

/// Catalogue par défaut. Tous les identifiants OpenRouter sont ceux présents dans le catalogue réel (or_models_cache.json).
public enum Catalog {
    static let or = "https://openrouter.ai/api/v1/chat/completions"
    static let orKeys = KeyChain([KnownKeys.openrouter, KnownKeys.openrouterNova])
    static let orHeaders = ["HTTP-Referer": "https://nova.local", "X-Title": "Nova"]
    static func orBrain(_ id: String, _ label: String, _ model: String, _ tags: Set<String>, _ note: String = "") -> BrainSpec {
        BrainSpec(id: id, label: label, kind: .openai, baseURL: or, model: model, keys: orKeys, tags: tags, note: note, extraHeaders: orHeaders)
    }
    public static func defaults() -> [BrainSpec] {
        let sparkKeys = KeyChain([KnownKeys.spark, KnownKeys.sparkNova, KnownKeys.sparkOAuth])
        return [
            BrainSpec(id: "spark-1.4", label: "Spark 1.4 (Muse)", kind: .openai, baseURL: "https://api.meta.ai/v1/chat/completions",
                      model: "muse-spark-1.4", keys: sparkKeys, tags: ["rapide", "puissant"],
                      note: "Identifiant 1.4 à confirmer par le diagnostic ; absent du catalogue OpenRouter."),
            BrainSpec(id: "spark-1.3", label: "Spark 1.3 (Muse)", kind: .openai, baseURL: "https://api.meta.ai/v1/chat/completions",
                      model: "muse-spark-1.3", keys: sparkKeys, tags: ["rapide", "puissant"]),
            orBrain("glm-5.3-flash", "GLM 5.3 Flash", "z-ai/glm-5.3-flash", ["rapide"]),
            orBrain("glm-5.3", "GLM 5.3", "z-ai/glm-5.3", ["puissant"]),
            orBrain("kimi-k3", "Kimi K3", "moonshotai/kimi-k3", ["puissant"]),
            BrainSpec(id: "claude-haiku-direct", label: "Claude Haiku 5.5", kind: .anthropic,
                      baseURL: "https://api.anthropic.com/v1/messages", model: "claude-haiku-5-5",
                      keys: KeyChain([KnownKeys.anthropic, KnownKeys.anthropicAlt, KnownKeys.anthropicNova]), tags: ["rapide"]),
            BrainSpec(id: "claude-sonnet-direct", label: "Claude Sonnet 5.5", kind: .anthropic,
                      baseURL: "https://api.anthropic.com/v1/messages", model: "claude-sonnet-5-5",
                      keys: KeyChain([KnownKeys.anthropic, KnownKeys.anthropicAlt, KnownKeys.anthropicNova]), tags: ["rapide", "puissant"]),
            BrainSpec(id: "claude-opus-direct", label: "Claude Opus 5.5", kind: .anthropic,
                      baseURL: "https://api.anthropic.com/v1/messages", model: "claude-opus-5-5",
                      keys: KeyChain([KnownKeys.anthropic, KnownKeys.anthropicAlt, KnownKeys.anthropicNova]), tags: ["puissant"]),
            orBrain("or-claude-haiku", "Claude Haiku 5.5 (OpenRouter)", "anthropic/claude-haiku-5.5", ["rapide"]),
            orBrain("or-claude-sonnet", "Claude Sonnet 5.5 (OpenRouter)", "anthropic/claude-sonnet-5.5", ["rapide", "puissant"]),
            orBrain("or-claude-opus", "Claude Opus 5.5 (OpenRouter)", "anthropic/claude-opus-5.5", ["puissant"]),
            orBrain("or-gemini-flash", "Gemini 2.5 Flash (OpenRouter)", "google/gemini-2.5-flash", ["rapide"]),
            orBrain("or-deepseek", "DeepSeek V4 Pro (OpenRouter)", "deepseek/deepseek-v4-pro", ["puissant"]),
            orBrain("or-deepseek-flash", "DeepSeek V4 Flash (OpenRouter)", "deepseek/deepseek-v4-flash", ["rapide"]),
            orBrain("or-gpt-luna", "GPT-6 Luna (OpenRouter)", "openai/gpt-6-luna", ["rapide"]),
            orBrain("or-gpt-sol", "GPT-6.1 Sol (OpenRouter)", "openai/gpt-6.1-sol", ["puissant"]),
            orBrain("or-gemini-35", "Gemini 3.5 Flash (OpenRouter)", "google/gemini-3.5-flash", ["rapide"]),
            orBrain("or-claude-fable", "Claude Fable 5.1 (OpenRouter)", "anthropic/claude-fable-5.1", ["puissant"]),
            orBrain("or-argon", "Gemini 4 Argon (OpenRouter)", "google/gemini-4-argon", ["puissant"]),
            BrainSpec(id: "gemini-direct", label: "Gemini (clé Bionic)", kind: .openai,
                      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", model: "gemini-flash-latest",
                      keys: KeyChain([KnownKeys.geminiNova, KnownKeys.gemini]), tags: ["rapide"]),
            BrainSpec(id: "zai-direct", label: "GLM 5.3 (Z.ai direct)", kind: .openai,
                      baseURL: "https://api.z.ai/api/paas/v4/chat/completions", model: "glm-5.3",
                      keys: KeyChain([KnownKeys.zai, KnownKeys.zaiNova]), tags: ["puissant"], note: "Actif seulement si une clé Z.ai est enregistrée."),
            BrainSpec(id: "moonshot-direct", label: "Kimi K3 (Moonshot direct)", kind: .openai,
                      baseURL: "https://api.moonshot.ai/v1/chat/completions", model: "kimi-k3",
                      keys: KeyChain([KnownKeys.moonshot, KnownKeys.moonshotNova]), tags: ["puissant"], note: "Actif seulement si une clé Moonshot est enregistrée."),
            BrainSpec(id: "openai-direct", label: "GPT (OpenAI direct)", kind: .openai,
                      baseURL: "https://api.openai.com/v1/chat/completions", model: "gpt-5",
                      keys: KeyChain([KnownKeys.openai, KnownKeys.openaiNova]), tags: ["puissant"], note: "Actif seulement si une clé OpenAI est enregistrée. Modèle ajustable via Diagnostics."),
            BrainSpec(id: "deepseek-direct", label: "DeepSeek (direct)", kind: .openai,
                      baseURL: "https://api.deepseek.com/chat/completions", model: "deepseek-chat",
                      keys: KeyChain([KnownKeys.deepseek, KnownKeys.deepseekNova]), tags: ["rapide"], note: "Actif seulement si une clé DeepSeek est enregistrée."),
            orBrain("or-free-auto", "OpenRouter · AUTO gratuit (choisit seul un modèle gratuit)", "openrouter/free", ["rapide","puissant"], "Gratuit via ta clé OpenRouter (limites du palier gratuit)."),
            orBrain("or-free-nemotron-ultra", "Nemotron 3 Ultra 550B (gratuit)", "nvidia/nemotron-3-ultra-550b-a55b:free", ["puissant"], "Gratuit via ta clé OpenRouter (limites du palier gratuit)."),
            orBrain("or-free-nemotron-super", "Nemotron 3 Super 120B (gratuit)", "nvidia/nemotron-3-super-120b-a12b:free", ["rapide","puissant"], "Gratuit via ta clé OpenRouter (limites du palier gratuit)."),
            orBrain("or-free-gemma31", "Gemma 4 31B (gratuit)", "google/gemma-4-31b-it:free", ["rapide"], "Gratuit via ta clé OpenRouter (limites du palier gratuit)."),
            orBrain("or-free-laguna", "Laguna S 2.1 (gratuit)", "poolside/laguna-s-2.1:free", ["rapide"], "Gratuit via ta clé OpenRouter (limites du palier gratuit)."),
            orBrain("or-free-north-code", "North Mini Code (gratuit)", "cohere/north-mini-code:free", ["rapide"], "Gratuit via ta clé OpenRouter (limites du palier gratuit)."),
            BrainSpec(id: "groq-free", label: "Groq · Llama 3.3 70B (gratuit)", kind: .openai,
                      baseURL: "https://api.groq.com/openai/v1/chat/completions", model: "llama-3.3-70b-versatile",
                      keys: KeyChain([KnownKeys.groq, KnownKeys.groqNova]), tags: ["rapide"], note: "Palier gratuit Groq : actif seulement si ta clé est enregistrée (nova-groq)."),
            BrainSpec(id: "mistral-free", label: "Mistral Small (palier gratuit)", kind: .openai,
                      baseURL: "https://api.mistral.ai/v1/chat/completions", model: "mistral-small-latest",
                      keys: KeyChain([KnownKeys.mistral, KnownKeys.mistralNova]), tags: ["rapide"], note: "Actif seulement si ta clé Mistral est enregistrée (nova-mistral)."),
            BrainSpec(id: "cerebras-free", label: "Cerebras · Llama 3.3 70B (gratuit)", kind: .openai,
                      baseURL: "https://api.cerebras.ai/v1/chat/completions", model: "llama-3.3-70b",
                      keys: KeyChain([KnownKeys.cerebras, KnownKeys.cerebrasNova]), tags: ["rapide"], note: "Actif seulement si ta clé Cerebras est enregistrée (nova-cerebras)."),
            BrainSpec(id: "omniroute-free", label: "OmniRoute · meilleur gratuit (auto/best-free)", kind: .openai,
                      baseURL: "http://127.0.0.1:20128/v1/chat/completions", model: "auto/best-free",
                      keys: KeyChain([KnownKeys.omniroute]), tags: ["rapide", "puissant"], note: "OmniRoute (github.com/diegosouzapw/OmniRoute) : choisit seul un fournisseur gratuit. Actif si la passerelle tourne en local et qu'une clé est enregistrée (nova-omniroute)."),
            BrainSpec(id: "omniroute-code", label: "OmniRoute · meilleur code (auto/best-coding)", kind: .openai,
                      baseURL: "http://127.0.0.1:20128/v1/chat/completions", model: "auto/best-coding",
                      keys: KeyChain([KnownKeys.omniroute]), tags: ["puissant"], note: "Même passerelle OmniRoute, alias orienté code."),
            BrainSpec(id: "omniroute-local", label: "OmniRoute local (secours gratuit)", kind: .openai,
                      baseURL: "http://127.0.0.1:20128/v1/chat/completions", model: "auto",
                      keys: KeyChain([KnownKeys.omniroute]), tags: ["rapide", "puissant"], note: "Passerelle locale OmniRoute (127.0.0.1 seulement) : actif si elle tourne et qu'une clé locale est enregistrée (nova-omniroute)."),
        ]
    }
    /// Ordres de repli par mode. Le local est TOUJOURS en dernier : c'est le filet quand le réseau tombe.
    public static let fastOrder = ["deepseek-direct", "spark-1.4", "spark-1.3", "glm-5.3-flash", "or-gpt-luna", "or-deepseek-flash", "or-claude-haiku", "claude-haiku-direct", "spark-1.4", "spark-1.3", "gemini-direct", "or-gemini-35", "or-gemini-flash", "claude-sonnet-direct", "or-claude-sonnet", "glm-5.3", "kimi-k3", "or-free-auto", "or-free-nemotron-ultra", "or-free-nemotron-super", "or-free-gemma31", "or-free-laguna", "or-free-north-code", "groq-free", "mistral-free", "cerebras-free", "omniroute-free", "omniroute-local"]
    /// Mode « bulk » : tâches longues, répétitives, de fond (Dots, briefs). Local d'abord, puis gratuits, puis économiques ; les cerveaux premium restent pour le chat et la réflexion.
    public static let bulkOrder = ["local", "or-free-auto", "or-free-nemotron-ultra", "or-free-nemotron-super", "or-free-gemma31", "or-free-laguna", "or-free-north-code", "groq-free", "mistral-free", "cerebras-free", "omniroute-free", "omniroute-local", "deepseek-direct", "glm-5.3-flash", "or-deepseek-flash", "claude-haiku-direct", "or-claude-haiku", "spark-1.4", "spark-1.3"]
    public static let deepOrder = ["deepseek-direct", "spark-1.4", "spark-1.3", "claude-opus-direct", "or-claude-opus", "kimi-k3", "glm-5.3", "or-claude-fable", "or-argon", "or-gpt-sol", "claude-sonnet-direct", "or-claude-sonnet", "spark-1.4", "spark-1.3", "or-deepseek", "zai-direct", "moonshot-direct", "openai-direct", "deepseek-direct", "glm-5.3-flash", "or-free-auto", "or-free-nemotron-ultra", "or-free-nemotron-super", "or-free-gemma31", "or-free-laguna", "or-free-north-code", "groq-free", "mistral-free", "cerebras-free", "omniroute-free", "omniroute-local"]
}

/// Détection des moteurs locaux (Ollama, LM Studio, llama.cpp server, MLX) : on interroge, on ne suppose rien.
public struct LocalEngine { public var name: String; public var base: String; public var models: [String] }

public enum LocalProbe {
    static let candidates: [(String, String)] = [("ollama", "http://127.0.0.1:11434"), ("lmstudio", "http://127.0.0.1:1234"),
                                                  ("llamacpp", "http://127.0.0.1:8080"), ("mlx", "http://127.0.0.1:8081")]
    public static func detect(timeout: TimeInterval = 1.5) -> [LocalEngine] {
        var res: [LocalEngine] = []
        let lock = NSLock(); let g = DispatchGroup()
        for (name, base) in candidates {
            g.enter()
            DispatchQueue.global().async {
                defer { g.leave() }
                guard let url = URL(string: base + "/v1/models") else { return }
                var req = URLRequest(url: url); req.timeoutInterval = timeout
                let (st, data) = syncGet(req, timeout: timeout)
                guard st == 200, let o = parseJSON(data), let arr = o["data"] as? [[String: Any]] else { return }
                let ids = arr.compactMap { $0["id"] as? String }.filter { !$0.lowercased().contains("embed") }
                if !ids.isEmpty { lock.lock(); res.append(LocalEngine(name: name, base: base, models: ids)); lock.unlock() }
            }
        }
        _ = g.wait(timeout: .now() + timeout + 1.0)
        return res.sorted { $0.name < $1.name }
    }
}

public func syncGet(_ req: URLRequest, timeout: TimeInterval = 5) -> (Int, Data) {
    var out = Data(); var status = 0
    let r = HTTPStream.run(req, firstByteTimeout: timeout, idleTimeout: timeout, totalTimeout: timeout + 2) { out.append($0); return true }
    status = r.status
    if r.status >= 400 { out = r.body }
    return (r.error != nil && r.status == 0 ? 0 : status, out)
}

/// Un appel de cerveau, bloquant, avec événements en direct. Lève BrainFailure si rien n'a abouti.
public final class BrainRunner {
    /// Extrait N de « … can only afford N » / « 1199 finançables ». nil si absent ou N trop petit pour être utile.
    static func affordable(_ body: Data) -> Int? {
        let t = String(data: body, encoding: .utf8) ?? ""
        guard let r = t.range(of: #"afford\s+(\d+)"#, options: .regularExpression) else { return nil }
        let n = Int(t[r].filter { $0.isNumber })
        if let n = n, n >= 150 { return n }
        return nil
    }
    public let keys: KeyStore
    public init(keys: KeyStore) { self.keys = keys }

    public func stream(_ spec: BrainSpec, messages: [ChatMsg], system: String?, maxTokens: Int, mode: String,
                       firstTokenTimeout: TimeInterval, cancel: @escaping () -> Bool, retried: Bool = false,
                       onDelta: @escaping (String) -> Void, onUsage: @escaping (Int, Int) -> Void) throws {
        var key = spec.keys.resolve(keys) ?? ""
        if spec.kind != .local && key.isEmpty { throw BrainFailure(kind: .auth, message: "clé introuvable dans le Trousseau") }
        if let d = key.data(using: .utf8), d.first == UInt8(ascii: "{"), let o = parseJSON(d) {   // grant OAuth JSON
            key = (o["api_key"] as? String) ?? (o["access_token"] as? String) ?? key
        }
        guard let url = URL(string: spec.baseURL) else { throw BrainFailure(kind: .other, message: "URL invalide") }
        var req = URLRequest(url: url); req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        for (k, v) in spec.extraHeaders { req.setValue(v, forHTTPHeaderField: k) }
        var body: [String: Any]
        switch spec.kind {
        case .anthropic:
            req.setValue(key, forHTTPHeaderField: "x-api-key"); req.setValue("2023-06-01", forHTTPHeaderField: "anthropic-version")
            body = ["model": spec.model, "max_tokens": maxTokens, "stream": true,
                    "messages": messages.filter { $0.role != "system" }.map { ["role": $0.role, "content": $0.content] }]
            if let s = system, !s.isEmpty { body["system"] = s }
        case .gateway:
            req.setValue("Bearer " + key, forHTTPHeaderField: "Authorization")
            body = ["model": spec.model, "stream": true, "max_output_tokens": maxTokens,
                    "input": messages.map { ["role": $0.role, "content": $0.content] }]
            if let s = system, !s.isEmpty { body["instructions"] = s }
        case .openai, .local:
            if !key.isEmpty { req.setValue("Bearer " + key, forHTTPHeaderField: "Authorization") }
            var msgs: [[String: String]] = []
            if let s = system, !s.isEmpty { msgs.append(["role": "system", "content": s]) }
            msgs += messages.map { ["role": $0.role, "content": $0.content] }
            // Les modèles à raisonnement (GLM, DeepSeek, Kimi…) dépensent d'abord des jetons à « réfléchir » : avec un plafond
            // trop bas, la réponse visible est vide. On garantit un plancher (1re tentative) et on demande un raisonnement court.
            let cap = (retried || spec.kind == .local) ? maxTokens : max(maxTokens, 320)
            body = ["model": spec.model, "max_tokens": cap, "stream": true, "messages": msgs]
            if spec.baseURL.contains("api.meta.ai") && mode != "deep" { body["reasoning_effort"] = "low" }
            if spec.baseURL.contains("openrouter.ai") { body["reasoning"] = mode != "deep" ? ["effort": "low"] : ["effort": "medium"] }
            if spec.baseURL.contains("bigmodel.cn") || spec.baseURL.contains("z.ai") { if mode != "deep" { body["thinking"] = ["type": "disabled"] } }
        }
        req.httpBody = jsonData(body)

        var parser = SSEParser()
        var gotDelta = false
        var gotThinking = false   // le modèle « réfléchit » (reasoning) : il est vivant, on lui laisse un peu plus de temps
        var failure: BrainFailure? = nil
        let started = Date()
        let hardCancel: () -> Bool = {
            if cancel() { return true }
            return !gotDelta && Date().timeIntervalSince(started) > (gotThinking ? firstTokenTimeout * 2.5 : firstTokenTimeout)
        }
        let res = HTTPStream.run(req, firstByteTimeout: firstTokenTimeout, idleTimeout: 25, totalTimeout: 180, cancel: hardCancel) { chunk in
            for ev in parser.feed(chunk) {
                if ev.data == "[DONE]" { continue }
                guard let o = parseJSON(Data(ev.data.utf8)) else { continue }
                switch spec.kind {
                case .anthropic:
                    let t = (o["type"] as? String) ?? ev.event ?? ""
                    if t == "content_block_delta", let d = o["delta"] as? [String: Any], let tx = d["text"] as? String, !tx.isEmpty { gotDelta = true; onDelta(tx) }
                    else if t == "message_delta", let u = o["usage"] as? [String: Any] { onUsage((u["input_tokens"] as? Int) ?? 0, (u["output_tokens"] as? Int) ?? 0) }
                    else if t == "error", let e = o["error"] as? [String: Any] {
                        let m = (e["message"] as? String) ?? "erreur"; let ty = (e["type"] as? String) ?? ""
                        failure = BrainFailure(kind: ty.contains("overloaded") ? .server : (ty.contains("auth") ? .auth : .other), message: m)
                        return false
                    }
                case .gateway:
                    let t = (o["type"] as? String) ?? ""
                    if t == "response.output_text.delta", let d = o["delta"] as? String, !d.isEmpty { gotDelta = true; onDelta(d) }
                    else if let r = o["response"] as? [String: Any], let st = r["status"] as? String, st == "failed" {
                        failure = BrainFailure(kind: .other, message: shortError(String(describing: r["error"] ?? "échec"))); return false
                    }
                case .openai, .local:
                    if let e = o["error"] as? [String: Any] {
                        let m = (e["message"] as? String) ?? "erreur fournisseur"
                        failure = BrainFailure(kind: classify(status: (e["code"] as? Int) ?? 0, body: m), message: shortError(m)); return false
                    }
                    if let u = o["usage"] as? [String: Any] { onUsage((u["prompt_tokens"] as? Int) ?? 0, (u["completion_tokens"] as? Int) ?? 0) }
                    for ch in (o["choices"] as? [[String: Any]]) ?? [] {
                        if let d = ch["delta"] as? [String: Any] {
                            if let tx = d["content"] as? String, !tx.isEmpty { gotDelta = true; onDelta(tx) }
                            else if let r = (d["reasoning"] as? String) ?? (d["reasoning_content"] as? String), !r.isEmpty { gotThinking = true }
                        }
                    }
                }
            }
            return true
        }
        if let f = failure, !gotDelta { throw f }
        if res.kind == .credit, !gotDelta, !retried, maxTokens > 300, let afford = Self.affordable(res.body) {
            // OpenRouter : « can only afford N » → on redemande avec ce que le solde finance, au lieu d'échouer.
            return try stream(spec, messages: messages, system: system, maxTokens: max(64, afford - 20), mode: mode,
                              firstTokenTimeout: firstTokenTimeout, cancel: cancel, retried: true, onDelta: onDelta, onUsage: onUsage)
        }
        if let e = res.error {
            if res.kind == .canceled && cancel() { throw BrainFailure(kind: .canceled, message: "annulé") }
            if res.kind == .canceled { throw BrainFailure(kind: .timeout, message: "aucun mot reçu après \(Int(firstTokenTimeout)) s") }
            if gotDelta { return }   // coupure en cours de réponse : on garde ce qui est arrivé
            throw BrainFailure(kind: res.kind ?? .other, message: e)
        }
        if !gotDelta { throw BrainFailure(kind: .other, message: "réponse vide") }
    }
}
