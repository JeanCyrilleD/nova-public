import Foundation
import NovaCore

// Serveur Nova autonome (même cœur que l'app Mac). Usage : nova-server [--web DIR] [--port N] [--token T]
var web: String? = nil, port = 8765, token: String? = nil
var a = Array(CommandLine.arguments.dropFirst())
while !a.isEmpty { let k = a.removeFirst()
    if k == "--web", !a.isEmpty { web = a.removeFirst() } else if k == "--port", !a.isEmpty { port = Int(a.removeFirst()) ?? port } else if k == "--token", !a.isEmpty { token = a.removeFirst() } }
setvbuf(stdout, nil, _IOLBF, 0)
// Mode test : clés factices + tous les cerveaux redirigés vers un faux fournisseur local (jamais utilisé en production).
let testBase = ProcessInfo.processInfo.environment["NOVA_TEST_MOCK"]
if let dir = ProcessInfo.processInfo.environment["NOVA_PDF_TEXT_DIR"] {   // test : texte extrait par PDFKit sur un vrai Mac
    VaultHooks.pdfText = { path in try? String(contentsOfFile: dir + "/" + ((path as NSString).lastPathComponent as NSString).deletingPathExtension + ".txt", encoding: .utf8) }
} else if FileManager.default.isExecutableFile(atPath: "/usr/bin/pdftotext") {   // test Linux : même contrat que PDFKit sur Mac
    VaultHooks.pdfText = { path in let p = Process(); p.executableURL = URL(fileURLWithPath: "/usr/bin/pdftotext"); p.arguments = (ProcessInfo.processInfo.environment["NOVA_PDF_MODE"] ?? "-layout").split(separator: " ").map(String.init) + [path, "-"]; let o = Pipe(); p.standardOutput = o
        do { try p.run() } catch { return nil }; let d = o.fileHandleForReading.readDataToEndOfFile(); p.waitUntilExit(); return String(data: d, encoding: .utf8) }
}
let app = NovaApp(keys: testBase == nil ? KeychainStore() : MemoryKeyStore(["openrouter-api-key": "test-key-0000", "elevenlabs-api-key": "test-key-0000", "anthropic-api-key": "test-key-0000", "sparklocal-meta-api-key": "test-key-0000", "bionic-gemini-apikey": "test-key-0000"]), webDir: web, token: token)
if let tb = testBase {
    Voice.base = tb + "/eleven"
    for i in app.router.brains.indices {
        let b = app.router.brains[i]
        app.router.brains[i].baseURL = tb + "/" + b.id + (b.kind == .anthropic ? "/v1/messages" : "/v1/chat/completions")
    }
    app.router.firstTokenTimeout = 2
}
do { let p = try app.start(port: port); print("NOVA_READY port=\(p) token=\(app.server.token)") } catch { print("ÉCHEC: \(error)"); exit(1) }
dispatchMain()
