import Foundation

/// État réel de la machine (batterie, CPU, mémoire, disque, GPU, processus). Lit les commandes système ; une mesure impossible est
/// déclarée absente (nil → null), jamais inventée.
public enum SystemInfo {
    static let lock = NSLock()
    static var cache: (Date, [String: Any])? = nil

    static func rx(_ p: String, _ s: String) -> [String]? {
        guard let r = try? NSRegularExpression(pattern: p, options: [.dotMatchesLineSeparators]), let m = r.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)) else { return nil }
        return (0..<m.numberOfRanges).map { i in Range(m.range(at: i), in: s).map { String(s[$0]) } ?? "" }
    }
    static func num(_ s: String?) -> Double? { s.flatMap { Double($0.replacingOccurrences(of: ",", with: ".")) } }

    public static func snapshot() -> [String: Any] {
        lock.lock(); if let c = cache, Date().timeIntervalSince(c.0) < 3 { lock.unlock(); return c.1 }; lock.unlock()
        var o: [String: Any] = ["ts": nowISO()]
        #if os(macOS)
        o["os"] = "macOS"
        let (_, batt) = runProcess("/usr/bin/pmset", ["-g", "batt"], timeout: 4)
        if let m = rx(#"(\d+)%;\s*([a-zA-Z ]+?);\s*(?:(\d+:\d+) remaining|\(no estimate\)|finishing charge|)"#, batt) {
            o["battery"] = ["pct": Int(m[1]) ?? 0, "state": m[2].trimmingCharacters(in: .whitespaces), "remaining": m.count > 3 && !m[3].isEmpty ? m[3] : NSNull(),
                            "source": batt.contains("AC Power") ? "secteur" : "batterie"] as [String: Any]
        } else { o["battery"] = NSNull() }
        let (_, top) = runProcess("/usr/bin/top", ["-l", "1", "-n", "0", "-s", "0"], timeout: 8)
        if let m = rx(#"CPU usage:\s*([\d.,]+)% user,\s*([\d.,]+)% sys,\s*([\d.,]+)% idle"#, top) {
            o["cpu"] = ["user": num(m[1]) ?? 0.0, "sys": num(m[2]) ?? 0.0, "idle": num(m[3]) ?? 0.0] as [String: Any]
        }
        if o["cpu"] == nil {   // repli : somme des %CPU des processus / nombre de cœurs (si « top » n'a rien rendu)
            let (_, ps) = runProcess("/bin/ps", ["-A", "-o", "%cpu"], timeout: 4)
            let tot = ps.split(separator: "\n").dropFirst().compactMap { Double($0.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: ".")) }.reduce(0, +)
            let n = Double(ProcessInfo.processInfo.activeProcessorCount); if tot > 0 { let u = min(100, tot / n); o["cpu"] = ["user": (u * 10).rounded() / 10, "sys": 0.0, "idle": ((100 - u) * 10).rounded() / 10] as [String: Any] }
        }
        if let m = rx(#"PhysMem:\s*([^\n]+)"#, top) { o["mem_text"] = m[1] }
        let (_, brand) = runProcess("/usr/sbin/sysctl", ["-n", "machdep.cpu.brand_string"], timeout: 3)
        let (_, ncpu) = runProcess("/usr/sbin/sysctl", ["-n", "hw.ncpu"], timeout: 3)
        let (_, memsize) = runProcess("/usr/sbin/sysctl", ["-n", "hw.memsize"], timeout: 3)
        let (_, load) = runProcess("/usr/sbin/sysctl", ["-n", "vm.loadavg"], timeout: 3)
        o["machine"] = ["cpu": brand.trimmingCharacters(in: .whitespacesAndNewlines), "cores": Int(ncpu.trimmingCharacters(in: .whitespacesAndNewlines)) ?? 0,
                        "mem_total": Double(memsize.trimmingCharacters(in: .whitespacesAndNewlines)) ?? 0, "load": load.trimmingCharacters(in: CharacterSet(charactersIn: "{} \n"))] as [String: Any]
        let (_, vm) = runProcess("/usr/bin/vm_stat", [], timeout: 3)
        if let ps = rx(#"page size of (\d+) bytes"#, vm).flatMap({ Double($0[1]) }) {
            func pages(_ k: String) -> Double { rx(k + #":\s*(\d+)\."#, vm).flatMap { Double($0[1]) } ?? 0 }
            let used = (pages("Pages active") + pages("Pages wired down") + pages("Pages occupied by compressor")) * ps
            o["mem_used"] = used
        }
        let (_, ior) = runProcess("/usr/sbin/ioreg", ["-r", "-d", "1", "-w", "0", "-c", "IOAccelerator"], timeout: 4)
        if let m = rx(#""Device Utilization %"\s*=\s*(\d+)"#, ior) { o["gpu"] = ["util": Int(m[1]) ?? 0] as [String: Any] } else { o["gpu"] = NSNull() }
        let (_, therm) = runProcess("/usr/bin/pmset", ["-g", "therm"], timeout: 3)
        o["thermal"] = therm.contains("CPU_Speed_Limit") ? (rx(#"CPU_Speed_Limit\s*=\s*(\d+)"#, therm).map { "limitation CPU \($0[1]) %" } ?? "ok") : "aucune limitation thermique signalée"
        let (_, bt) = runProcess("/usr/sbin/sysctl", ["-n", "kern.boottime"], timeout: 3)
        if let m = rx(#"sec = (\d+)"#, bt), let t = Double(m[1]) { o["uptime_s"] = Date().timeIntervalSince1970 - t }
        let (_, pl) = runProcess("/bin/ps", ["-Ao", "pcpu,pmem,comm", "-r"], timeout: 4)
        o["procs"] = pl.split(separator: "\n").dropFirst().prefix(6).compactMap { l -> [String: Any]? in
            let p = l.split(separator: " ", maxSplits: 2, omittingEmptySubsequences: true); guard p.count == 3 else { return nil }
            return ["cpu": Double(p[0]) ?? 0, "mem": Double(p[1]) ?? 0, "name": (String(p[2]) as NSString).lastPathComponent]
        }
        #else
        o["os"] = "Linux"
        o["battery"] = NSNull(); o["gpu"] = NSNull(); o["thermal"] = "non mesuré sur cette plateforme"
        if let l = try? String(contentsOfFile: "/proc/loadavg", encoding: .utf8) { o["machine"] = ["cpu": "x86_64", "cores": ProcessInfo.processInfo.activeProcessorCount, "mem_total": Double(ProcessInfo.processInfo.physicalMemory), "load": l.split(separator: " ").prefix(3).joined(separator: " ")] as [String: Any] }
        if let mi = try? String(contentsOfFile: "/proc/meminfo", encoding: .utf8), let t = rx(#"MemTotal:\s*(\d+)"#, mi).flatMap({ Double($0[1]) }), let a = rx(#"MemAvailable:\s*(\d+)"#, mi).flatMap({ Double($0[1]) }) { o["mem_used"] = (t - a) * 1024 }
        if let u = try? String(contentsOfFile: "/proc/uptime", encoding: .utf8), let s = u.split(separator: " ").first.flatMap({ Double($0) }) { o["uptime_s"] = s }
        o["procs"] = [] as [[String: Any]]
        #endif
        // macOS (APFS) : la racine « / » est le petit volume système en lecture seule ; l'espace réellement utilisé est sur le volume Data.
        // Utilisé = total du conteneur − disponible (comme le Finder), pas la colonne « Used » d'un seul volume.
        let dfPath = FileManager.default.fileExists(atPath: "/System/Volumes/Data") ? "/System/Volumes/Data" : "/"
        let (_, df) = runProcess("/bin/df", ["-k", dfPath], timeout: 4)
        let cols = df.split(separator: "\n").dropFirst().first.map { $0.split(separator: " ", omittingEmptySubsequences: true) } ?? []
        if cols.count >= 5, let tot = Double(cols[1]), let avail = Double(cols[3]) {
            let used = max(0, tot - avail)
            o["disk"] = ["total": tot * 1024, "used": used * 1024, "pct": Int(used / max(tot, 1) * 100)] as [String: Any]
        }
        lock.lock(); cache = (Date(), o); lock.unlock()
        return o
    }
}
