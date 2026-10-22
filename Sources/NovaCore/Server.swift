import Foundation
#if canImport(Darwin)
import Darwin
#elseif canImport(Glibc)
import Glibc
#endif

public struct Request {
    public var method: String, path: String, query: [String: String]
    public var headers: [String: String]   // clés en minuscules
    public var body: Data
    public var json: [String: Any] { parseJSON(body) ?? [:] }
    public var cookies: [String: String] {
        var o: [String: String] = [:]
        for p in (headers["cookie"] ?? "").split(separator: ";") {
            let kv = p.split(separator: "=", maxSplits: 1).map { $0.trimmingCharacters(in: .whitespaces) }
            if kv.count == 2 { o[kv[0]] = kv[1] }
        }
        return o
    }
}

public final class Response {
    let fd: Int32
    public private(set) var headersSent = false
    public private(set) var closed = false
    public init(fd: Int32) { self.fd = fd }

    @discardableResult
    func writeAll(_ d: Data) -> Bool {
        if closed { return false }
        var off = 0; let n = d.count
        return d.withUnsafeBytes { (p: UnsafeRawBufferPointer) -> Bool in
            while off < n {
                #if canImport(Glibc)
                let w = send(fd, p.baseAddress! + off, n - off, Int32(MSG_NOSIGNAL))
                #else
                let w = write(fd, p.baseAddress! + off, n - off)
                #endif
                if w <= 0 { closed = true; return false }
                off += w
            }
            return true
        }
    }
    public func head(_ status: Int, _ type: String, extra: [String: String] = [:], length: Int? = nil) {
        guard !headersSent else { return }
        headersSent = true
        var s = "HTTP/1.1 \(status) \(status == 200 ? "OK" : "Status")\r\nContent-Type: \(type)\r\nConnection: close\r\nCache-Control: no-store\r\nReferrer-Policy: no-referrer\r\nX-Content-Type-Options: nosniff\r\n"
        if let l = length { s += "Content-Length: \(l)\r\n" }
        for (k, v) in extra { s += "\(k): \(v)\r\n" }
        s += "\r\n"
        writeAll(Data(s.utf8))
    }
    public func json(_ obj: Any, status: Int = 200, extra: [String: String] = [:]) {
        let d = jsonData(obj); head(status, "application/json; charset=utf-8", extra: extra, length: d.count); writeAll(d)
    }
    public func data(_ d: Data, type: String, status: Int = 200, extra: [String: String] = [:]) {
        head(status, type, extra: extra, length: d.count); writeAll(d)
    }
    public func sseStart() { head(200, "text/event-stream; charset=utf-8", extra: ["X-Accel-Buffering": "no"]) }
    /// Renvoie false si le client est parti (annulation côté navigateur).
    @discardableResult
    public func sse(_ event: String, _ obj: Any) -> Bool {
        writeAll(Data("event: \(event)\ndata: \(jsonString(obj))\n\n".utf8))
    }
    @discardableResult public func chunk(_ d: Data) -> Bool { writeAll(d) }
    public var clientGone: Bool {
        if closed { return true }
        var b: UInt8 = 0
        let r = recv(fd, &b, 1, Int32(MSG_PEEK | MSG_DONTWAIT))
        if r == 0 { closed = true; return true }
        return false
    }
}

public final class HTTPServer {
    public typealias Handler = (Request, Response) -> Void
    var routes: [(String, String, Handler)] = []   // méthode, préfixe/chemin exact, handler
    public var staticDir: String? = nil
    public var token: String
    public var requireToken = true
    public private(set) var port: Int = 0
    // Pont téléphone : second serveur, joignable hors de la machine, qui n'accepte QUE les appareils appairés (jeton propre à chaque appareil).
    public var bindAddress = "127.0.0.1"
    public var remoteAuth: ((Request) -> Bool)? = nil          // non nil = mode pont (pas de contrôle d'hôte local, authentification par appareil)
    public var openPaths: Set<String> = []                      // chemins du pont accessibles sans jeton (appairage)
    public weak var parent: HTTPServer? = nil                   // le serveur principal : ses routes ne sont atteignables que si elles figurent dans remoteAllow
    public var remoteAllow: [String] = []
    var listenFD: Int32 = -1
    let q = DispatchQueue(label: "nova.http", attributes: .concurrent)

    public init(token: String = UUID().uuidString.replacingOccurrences(of: "-", with: "")) { self.token = token }

    public func on(_ method: String, _ path: String, _ h: @escaping Handler) { routes.append((method, path, h)) }

    public func start(port want: Int = 0) throws -> Int {
        signal(SIGPIPE, SIG_IGN)
        #if canImport(Glibc)
        let fd = socket(AF_INET, Int32(SOCK_STREAM.rawValue), 0)
        #else
        let fd = socket(AF_INET, SOCK_STREAM, 0)
        #endif
        guard fd >= 0 else { throw NSError(domain: "nova", code: 1, userInfo: [NSLocalizedDescriptionKey: "socket"]) }
        var one: Int32 = 1
        setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &one, socklen_t(MemoryLayout<Int32>.size))
        var addr = sockaddr_in()
        addr.sin_family = sa_family_t(AF_INET)
        addr.sin_port = in_port_t(UInt16(want).bigEndian)
        addr.sin_addr.s_addr = inet_addr(bindAddress)   // 127.0.0.1 par défaut : le serveur principal n'est JAMAIS exposé au réseau
        let ok = withUnsafePointer(to: &addr) { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { bind(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) } }
        guard ok == 0, listen(fd, 64) == 0 else { close(fd); throw NSError(domain: "nova", code: 2, userInfo: [NSLocalizedDescriptionKey: "port \(want) occupé"]) }
        var out = sockaddr_in(); var len = socklen_t(MemoryLayout<sockaddr_in>.size)
        _ = withUnsafeMutablePointer(to: &out) { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { getsockname(fd, $0, &len) } }
        port = Int(UInt16(bigEndian: out.sin_port))
        listenFD = fd
        Thread.detachNewThread { [self] in
            while true {
                let lf = listenFD; if lf < 0 { break }
                let c = accept(lf, nil, nil)
                if c < 0 { if errno == EINTR { continue }; break }
                #if canImport(Darwin)
                var on: Int32 = 1; setsockopt(c, SOL_SOCKET, SO_NOSIGPIPE, &on, socklen_t(MemoryLayout<Int32>.size))
                #endif
                let t = Thread { self.handle(c) }; t.stackSize = 16 << 20; t.start()   // pile large : les piles GCD (512 Ko) débordent en build debug
            }
        }
        return port
    }

    /// Ferme réellement le port d'écoute (le thread d'accept se termine).
    public func stop() { let fd = listenFD; listenFD = -1; if fd >= 0 { shutdown(fd, SHUT_RDWR); close(fd) } }

    func readRequest(_ fd: Int32) -> Request? {
        var buf = Data(); var tmp = [UInt8](repeating: 0, count: 16384)
        var tv = timeval(tv_sec: 15, tv_usec: 0)
        setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &tv, socklen_t(MemoryLayout<timeval>.size))
        var headEnd: Range<Data.Index>? = nil
        while headEnd == nil {
            let n = recv(fd, &tmp, tmp.count, 0)
            if n <= 0 { return nil }
            buf.append(contentsOf: tmp[0..<n])
            headEnd = buf.range(of: Data("\r\n\r\n".utf8))
            if buf.count > 2_000_000 { return nil }
        }
        let headStr = String(data: buf.subdata(in: buf.startIndex..<headEnd!.lowerBound), encoding: .utf8) ?? ""
        var lines = headStr.components(separatedBy: "\r\n")
        let first = lines.removeFirst().split(separator: " ")
        guard first.count >= 2 else { return nil }
        var headers: [String: String] = [:]
        for l in lines { if let i = l.firstIndex(of: ":") { headers[l[..<i].lowercased()] = l[l.index(after: i)...].trimmingCharacters(in: .whitespaces) } }
        var body = buf.subdata(in: headEnd!.upperBound..<buf.endIndex)
        let want = Int(headers["content-length"] ?? "0") ?? 0
        if want > 30_000_000 { return nil }
        while body.count < want {
            let n = recv(fd, &tmp, tmp.count, 0)
            if n <= 0 { break }
            body.append(contentsOf: tmp[0..<n])
        }
        let target = String(first[1])
        let parts = target.split(separator: "?", maxSplits: 1)
        var query: [String: String] = [:]
        if parts.count == 2 {
            for kv in parts[1].split(separator: "&") {
                let p = kv.split(separator: "=", maxSplits: 1).map { String($0) }
                query[p[0].removingPercentEncoding ?? p[0]] = p.count > 1 ? (p[1].replacingOccurrences(of: "+", with: " ").removingPercentEncoding ?? p[1]) : ""
            }
        }
        return Request(method: String(first[0]), path: (String(parts[0]).removingPercentEncoding ?? String(parts[0])), query: query, headers: headers, body: body)
    }

    func handle(_ fd: Int32) {
        let res = Response(fd: fd)
        defer { close(fd) }
        guard let req = readRequest(fd) else { return }
        if let auth = remoteAuth {   // pont téléphone
            guard req.path.hasPrefix("/api/") else { res.json(["error": "introuvable"], status: 404); return }
            if req.method == "OPTIONS" { res.head(204, "text/plain"); return }
            guard openPaths.contains(req.path) || auth(req) else { res.json(["error": "appareil non autorisé"], status: 401); return }
            for (m, p, h) in routes where m == req.method && (p == req.path || (p.hasSuffix("/") && req.path.hasPrefix(p))) { h(req, res); return }
            if let par = parent, remoteAllow.contains(where: { req.path == $0 || ($0.hasSuffix("/") && req.path.hasPrefix($0)) }) {
                var rq = req; rq.headers["x-nova-remote"] = "1"   // marque l'origine téléphone (le client ne peut pas la retirer)
                for (m, p, h) in par.routes where m == rq.method && (p == rq.path || (p.hasSuffix("/") && rq.path.hasPrefix(p))) { h(rq, res); return }
            }
            res.json(["error": "inconnu", "path": req.path], status: 404); return
        }
        // Garde-fous : hôte local uniquement (anti DNS-rebinding), jeton pour l'API (anti CSRF depuis une page web quelconque).
        let host = (req.headers["host"] ?? "").lowercased()
        let hostName = host.split(separator: ":", maxSplits: 1, omittingEmptySubsequences: false).first.map(String.init) ?? host
        guard hostName == "127.0.0.1" || hostName == "localhost" else { res.json(["error": "hôte refusé"], status: 403); return }
        var authed = !requireToken || req.cookies["nova_t"] == token || req.headers["x-nova-token"] == token
        if let t = req.query["t"], t == token {   // première ouverture : pose le cookie puis sert la page
            authed = true
            if req.path == "/" || req.path.hasSuffix(".html") {
                let page = servePage(req.path, withCookie: true, res: res); if page { return }
            }
        }
        if req.path.hasPrefix("/api/") {
            guard authed else { res.json(["error": "non autorisé"], status: 401); return }
            if req.method == "OPTIONS" { res.head(204, "text/plain"); return }
            for (m, p, h) in routes where m == req.method && (p == req.path || (p.hasSuffix("/") && req.path.hasPrefix(p))) { h(req, res); return }
            res.json(["error": "inconnu", "path": req.path], status: 404); return
        }
        if !servePage(req.path, withCookie: false, res: res) { res.json(["error": "introuvable"], status: 404) }
    }

    func servePage(_ path: String, withCookie: Bool, res: Response) -> Bool {
        guard let dir = staticDir else { return false }
        var rel = path == "/" ? "/index.html" : path
        if rel.contains("..") { return false }
        rel = String(rel.dropFirst())
        let url = URL(fileURLWithPath: dir).appendingPathComponent(rel)
        guard let d = try? Data(contentsOf: url) else { return false }
        let ext = url.pathExtension.lowercased()
        let types = ["html": "text/html; charset=utf-8", "js": "text/javascript; charset=utf-8", "mjs": "text/javascript; charset=utf-8", "css": "text/css; charset=utf-8",
                     "json": "application/json", "svg": "image/svg+xml", "png": "image/png", "woff2": "font/woff2", "mp3": "audio/mpeg"]
        var extra: [String: String] = [:]
        if ext == "html" { extra["Content-Security-Policy"] = "object-src 'none'; base-uri 'self'; frame-ancestors 'none'" }
        if withCookie { extra["Set-Cookie"] = "nova_t=\(token); Path=/; HttpOnly; SameSite=Strict" }
        res.data(d, type: types[ext] ?? "application/octet-stream", extra: extra)
        return true
    }
}
