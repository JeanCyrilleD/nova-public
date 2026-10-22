import Foundation

/// Références de clés : on ne manipule JAMAIS une valeur en dehors de `KeyStore.value`, jamais loggée ni renvoyée à l'UI.
public struct KeyRef: Hashable {
    public let service: String
    public let accounts: [String]   // comptes essayés dans l'ordre ("" = n'importe lequel)
    public let envVars: [String]
    public init(service: String, accounts: [String] = [], envVars: [String] = []) {
        self.service = service; self.accounts = accounts; self.envVars = envVars
    }
}

public protocol KeyStore {
    func value(_ ref: KeyRef) -> String?
}

/// Trousseau macOS via /usr/bin/security (même mécanique que SparkLocal : les éléments existants restent lisibles).
public final class KeychainStore: KeyStore {
    var cache: [String: (String?, Date)] = [:]
    let lock = NSLock()
    public init() {}
    static var user: String { ProcessInfo.processInfo.environment["USER"] ?? NSUserName() }

    public func value(_ ref: KeyRef) -> String? {
        for v in ref.envVars {
            if let e = ProcessInfo.processInfo.environment[v], !e.trimmingCharacters(in: .whitespaces).isEmpty {
                return e.trimmingCharacters(in: .whitespacesAndNewlines)
            }
        }
        let ck = ref.service + "|" + ref.accounts.joined(separator: ",")
        lock.lock()
        if let c = cache[ck], Date().timeIntervalSince(c.1) < 300 { lock.unlock(); return c.0 }
        lock.unlock()
        var found: String? = nil
        #if os(macOS)
        var tries: [[String]] = ref.accounts.map { ["-a", $0 == "$USER" ? Self.user : $0, "-s", ref.service] }
        tries.append(["-s", ref.service])
        for t in tries {
            let (code, out) = runProcess("/usr/bin/security", ["find-generic-password"] + t + ["-w"], timeout: 3)
            let v = out.trimmingCharacters(in: .whitespacesAndNewlines)
            if code == 0 && !v.isEmpty { found = v; break }
        }
        #endif
        lock.lock(); cache[ck] = (found, Date()); lock.unlock()
        return found
    }

    /// Enregistre une clé saisie dans l'app (service "nova-…"). -U = mise à jour si elle existe.
    public static func save(service: String, value: String) -> Bool {
        #if os(macOS)
        let (c, _) = runProcess("/usr/bin/security", ["add-generic-password", "-U", "-a", user, "-s", service, "-w", value], timeout: 5)
        return c == 0
        #else
        return false
        #endif
    }
    public func forget() { lock.lock(); cache.removeAll(); lock.unlock() }
    /// Réchauffe le cache en PARALLÈLE (chaque lecture lance /usr/bin/security : en série, le premier affichage de Nova prenait ~20 s).
    public func warm(_ refs: [KeyRef]) {
        guard !refs.isEmpty else { return }
        DispatchQueue.concurrentPerform(iterations: refs.count) { i in _ = self.value(refs[i]) }
    }
}

/// Pour les tests et le mode démo explicite : clés injectées.
public final class MemoryKeyStore: KeyStore {
    public var map: [String: String]
    public init(_ m: [String: String] = [:]) { map = m }
    public func value(_ ref: KeyRef) -> String? { map[ref.service] }
}

/// Registre de toutes les références de clés connues (noms de services observés dans SparkLocal + conventions).
public enum KnownKeys {
    public static let openrouter = KeyRef(service: "openrouter-api-key", accounts: ["$USER", "bionic"], envVars: ["OPENROUTER_API_KEY"])
    public static let openrouterNova = KeyRef(service: "nova-openrouter", accounts: ["$USER"], envVars: [])
    public static let elevenlabs = KeyRef(service: "elevenlabs-api-key", accounts: ["$USER", "bionic"], envVars: ["ELEVENLABS_API_KEY"])
    public static let elevenlabsNova = KeyRef(service: "nova-elevenlabs", accounts: ["$USER"], envVars: [])
    public static let spark = KeyRef(service: "sparklocal-meta-api-key", accounts: ["$USER"], envVars: ["MODEL_API_KEY", "META_API_KEY"])
    public static let sparkOAuth = KeyRef(service: "ai.meta.dev.credentials", accounts: ["meta"], envVars: [])
    public static let sparkNova = KeyRef(service: "nova-spark", accounts: ["$USER"], envVars: [])
    public static let gateway = KeyRef(service: "perplexity-api-key", accounts: ["bionic", "$USER"], envVars: ["PERPLEXITY_API_KEY"])
    public static let gemini = KeyRef(service: "bionic-gemini-apikey", accounts: ["$USER", "ahadi", "bionic"], envVars: ["GEMINI_API_KEY"])
    public static let anthropic = KeyRef(service: "anthropic-api-key", accounts: ["$USER", "bionic"], envVars: ["ANTHROPIC_API_KEY"])
    public static let anthropicAlt = KeyRef(service: "claude-api-key", accounts: ["$USER"], envVars: [])
    public static let anthropicNova = KeyRef(service: "nova-anthropic", accounts: ["$USER"], envVars: [])
    public static let zai = KeyRef(service: "zai-api-key", accounts: ["$USER"], envVars: ["ZAI_API_KEY"])
    public static let zaiNova = KeyRef(service: "nova-zai", accounts: ["$USER"], envVars: [])
    public static let moonshotNova = KeyRef(service: "nova-moonshot", accounts: ["$USER"], envVars: [])
    public static let gatewayNova = KeyRef(service: "nova-gateway", accounts: ["$USER"], envVars: [])
    public static let geminiNova = KeyRef(service: "nova-gemini", accounts: ["$USER"], envVars: [])
    public static let openai = KeyRef(service: "openai-api-key", accounts: ["$USER"], envVars: ["OPENAI_API_KEY"])
    public static let openaiNova = KeyRef(service: "nova-openai", accounts: ["$USER"], envVars: [])
    public static let deepseek = KeyRef(service: "deepseek-api-key", accounts: ["$USER"], envVars: ["DEEPSEEK_API_KEY"])
    public static let deepseekNova = KeyRef(service: "nova-deepseek", accounts: ["$USER"], envVars: [])
    public static let groq = KeyRef(service: "groq-api-key", accounts: ["$USER"], envVars: ["GROQ_API_KEY"])
    public static let groqNova = KeyRef(service: "nova-groq", accounts: ["$USER"], envVars: [])
    public static let mistral = KeyRef(service: "mistral-api-key", accounts: ["$USER"], envVars: ["MISTRAL_API_KEY"])
    public static let mistralNova = KeyRef(service: "nova-mistral", accounts: ["$USER"], envVars: [])
    public static let cerebras = KeyRef(service: "cerebras-api-key", accounts: ["$USER"], envVars: ["CEREBRAS_API_KEY"])
    public static let cerebrasNova = KeyRef(service: "nova-cerebras", accounts: ["$USER"], envVars: [])
    public static let omniroute = KeyRef(service: "nova-omniroute", accounts: ["$USER"], envVars: ["OMNIROUTE_API_KEY"])
    public static let moonshot = KeyRef(service: "moonshot-api-key", accounts: ["$USER"], envVars: ["MOONSHOT_API_KEY"])
}

/// Un « coffre » de plusieurs références : la première qui répond gagne.
public struct KeyChain {
    public let refs: [KeyRef]
    public init(_ r: [KeyRef]) { refs = r }
    public func resolve(_ s: KeyStore) -> String? {
        for r in refs { if let v = s.value(r) { return v } }
        return nil
    }
}
