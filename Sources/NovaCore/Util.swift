import Foundation
#if canImport(Darwin)
import Darwin
#elseif canImport(Glibc)
import Glibc
#endif
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

public enum Paths {
    /// Dossier de données de Nova (~/Library/Application Support/Nova sur Mac, ~/.nova ailleurs ou via NOVA_HOME).
    public static var home: URL {
        if let h = ProcessInfo.processInfo.environment["NOVA_HOME"], !h.isEmpty { return URL(fileURLWithPath: h) }
        #if os(macOS)
        return FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/Nova")
        #else
        return FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".nova")
        #endif
    }
    public static func file(_ name: String) -> URL {
        try? FileManager.default.createDirectory(at: home, withIntermediateDirectories: true)
        return home.appendingPathComponent(name)
    }
}

public func nowISO() -> String { ISO8601DateFormatter().string(from: Date()) }

public func jsonData(_ obj: Any) -> Data {
    (try? JSONSerialization.data(withJSONObject: obj, options: [.sortedKeys])) ?? Data("{}".utf8)
}
public func jsonString(_ obj: Any) -> String { String(data: jsonData(obj), encoding: .utf8) ?? "{}" }
public func parseJSON(_ d: Data) -> [String: Any]? { (try? JSONSerialization.jsonObject(with: d)) as? [String: Any] }

/// Lecture/écriture JSON atomique et thread-safe d'un petit fichier d'état.
public final class JSONFile {
    let url: URL
    let lock = NSLock()
    public init(_ name: String) { url = Paths.file(name) }
    public func read<T>(default def: T) -> T {
        lock.lock(); defer { lock.unlock() }
        guard let d = try? Data(contentsOf: url), let o = try? JSONSerialization.jsonObject(with: d) as? T else { return def }
        return o
    }
    public func write(_ obj: Any) {
        lock.lock(); defer { lock.unlock() }
        let tmp = url.appendingPathExtension("tmp")
        guard (try? jsonData(obj).write(to: tmp)) != nil else { return }
        rename(tmp.path, url.path)   // POSIX : remplacement atomique, y compris si le fichier existe
    }
}

/// Journal JSONL append-only (une ligne par événement). Jamais de secret dedans.
public final class Journal {
    let url: URL
    let lock = NSLock()
    public init(_ name: String) { url = Paths.file(name) }
    public func add(_ ev: [String: Any]) {
        lock.lock(); defer { lock.unlock() }
        var e = ev; e["ts"] = nowISO()
        let line = jsonData(e) + Data("\n".utf8)
        if let h = try? FileHandle(forWritingTo: url) { h.seekToEndOfFile(); h.write(line); try? h.close() }
        else { try? line.write(to: url) }
    }
    public func tail(_ n: Int) -> [[String: Any]] {
        lock.lock(); defer { lock.unlock() }
        guard let s = try? String(contentsOf: url, encoding: .utf8) else { return [] }
        return s.split(separator: "\n").suffix(n).compactMap { parseJSON(Data($0.utf8)) }
    }
}

/// Exécute un binaire système et renvoie (code, stdout). Délai maximal obligatoire.
@discardableResult
public func runProcess(_ path: String, _ args: [String], timeout: TimeInterval = 5, stdin: Data? = nil) -> (Int32, String) {
    let p = Process()
    p.executableURL = URL(fileURLWithPath: path)
    p.arguments = args
    let out = Pipe(); p.standardOutput = out; p.standardError = FileHandle.nullDevice   // stderr jamais lu : on le jette (évite le blocage au-delà de 64 Ko)
    if let s = stdin { let i = Pipe(); p.standardInput = i; i.fileHandleForWriting.write(s); try? i.fileHandleForWriting.close() }
    do { try p.run() } catch { return (127, "") }
    let deadline = Date().addingTimeInterval(timeout)
    var data = Data()
    let q = DispatchQueue(label: "run.read"); let g = DispatchGroup(); g.enter()
    q.async { data = out.fileHandleForReading.readDataToEndOfFile(); g.leave() }
    while p.isRunning && Date() < deadline { Thread.sleep(forTimeInterval: 0.02) }
    if p.isRunning {
        let pid = p.processIdentifier
        _ = runProcess("/usr/bin/pkill", ["-TERM", "-P", "\(pid)"], timeout: 2)   // les enfants d'abord (zsh -c lance des sous-processus)
        p.terminate()
        Thread.sleep(forTimeInterval: 0.3)
        if p.isRunning { _ = runProcess("/usr/bin/pkill", ["-KILL", "-P", "\(pid)"], timeout: 2); kill(pid, SIGKILL) }
        return (124, "")
    }
    _ = g.wait(timeout: .now() + 1)
    return (p.terminationStatus, String(data: data, encoding: .utf8) ?? "")
}

public func shortError(_ s: String, _ n: Int = 240) -> String {
    let t = s.replacingOccurrences(of: "\n", with: " ")
    return t.count > n ? String(t.prefix(n)) + "…" : t
}
