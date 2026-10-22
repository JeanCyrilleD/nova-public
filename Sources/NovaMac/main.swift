#if canImport(AppKit)
import AppKit
import WebKit
import Carbon.HIToolbox
import NovaCore
import PDFKit
import Network

// Nova — coquille macOS native : fenêtre principale + assistant flottant 3D + icône de barre de menus + raccourci global ⌥Espace.
// Toute la logique (cerveaux, voix, briefs, dots) tourne dans NovaCore, dans ce même processus, sur 127.0.0.1 uniquement.

final class FloatingPanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
}

final class FlippedView: NSView { override var isFlipped: Bool { true } }

/// Volets web natifs (WhatsApp, Telegram, Facebook, navigateur) : de vraies WKWebView à session persistante, posées par-dessus la zone réservée par l'interface.
/// Téléchargements (exports CSV/JSON/Markdown, fichiers des volets web) : enregistrés dans ~/Téléchargements, puis révélés dans le Finder.
final class DownloadHandler: NSObject, WKDownloadDelegate {
    static let shared = DownloadHandler()
    var dest: [ObjectIdentifier: URL] = [:]
    func download(_ d: WKDownload, decideDestinationUsing r: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        let dir = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask).first ?? URL(fileURLWithPath: NSHomeDirectory() + "/Downloads")
        var name = suggestedFilename.isEmpty ? "nova-export" : suggestedFilename.replacingOccurrences(of: "/", with: "-")
        var u = dir.appendingPathComponent(name); var i = 1
        let base = (name as NSString).deletingPathExtension, ext = (name as NSString).pathExtension
        while FileManager.default.fileExists(atPath: u.path) { name = base + " (\(i))" + (ext.isEmpty ? "" : "." + ext); u = dir.appendingPathComponent(name); i += 1 }
        dest[ObjectIdentifier(d)] = u; completionHandler(u)
    }
    func downloadDidFinish(_ d: WKDownload) {
        if let u = dest.removeValue(forKey: ObjectIdentifier(d)) { NSWorkspace.shared.activateFileViewerSelecting([u]) }
    }
    func download(_ d: WKDownload, didFailWithError e: Error, resumeData: Data?) {
        dest.removeValue(forKey: ObjectIdentifier(d))
        let a = NSAlert(); a.messageText = "Téléchargement impossible"; a.informativeText = e.localizedDescription; a.runModal()
    }
}

final class PaneDelegate: NSObject, WKNavigationDelegate, WKUIDelegate {
    let id: String; weak var owner: AppDelegate?
    init(id: String, owner: AppDelegate) { self.id = id; self.owner = owner }
    func push(_ v: WKWebView, error: String? = nil) {
        var o: [String: Any] = ["id": id, "url": v.url?.absoluteString ?? "", "title": v.title ?? "", "loading": v.isLoading, "canBack": v.canGoBack, "canForward": v.canGoForward, "zoom": v.pageZoom]
        if let e = error { o["error"] = e }
        if let d = try? JSONSerialization.data(withJSONObject: o), let j = String(data: d, encoding: .utf8) { owner?.mainView.evaluateJavaScript("window.NovaNative&&NovaNative.onNav(\(j))", completionHandler: nil) }
    }
    func webView(_ v: WKWebView, decidePolicyFor a: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        decisionHandler(a.shouldPerformDownload ? .download : .allow)
    }
    func webView(_ v: WKWebView, decidePolicyFor r: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        decisionHandler(r.canShowMIMEType ? .allow : .download)
    }
    func webView(_ v: WKWebView, navigationAction a: WKNavigationAction, didBecome d: WKDownload) { d.delegate = DownloadHandler.shared }
    func webView(_ v: WKWebView, navigationResponse r: WKNavigationResponse, didBecome d: WKDownload) { d.delegate = DownloadHandler.shared }
    func webView(_ v: WKWebView, didCommit n: WKNavigation!) { push(v) }
    func webView(_ v: WKWebView, didFinish n: WKNavigation!) {
        push(v)
        // Outlook / Teams web : si Microsoft affiche « Choisir un compte » avec un compte déjà « connecté », on reprend CETTE session
        // (un clic sur la tuile du compte existant). Jamais de saisie de mot de passe ni de compte ajouté.
        if (id == "ol" || id == "tm"), v.url?.host == "login.microsoftonline.com" {
            let js = "(function(){var t=document.querySelector('#tilesHolder .tile-container [role=button], #tilesHolder [role=button], .tile-container [role=button]');if(!t)return 'none';var s=(t.innerText||'').toLowerCase();if(!(s.indexOf('signed in')>=0||s.indexOf('connecté')>=0))return 'notsigned';t.click();return 'clicked'})()"
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { v.evaluateJavaScript(js, completionHandler: nil) }
        }
    }
    func webView(_ v: WKWebView, didFail n: WKNavigation!, withError e: Error) { push(v, error: (e as NSError).code == NSURLErrorCancelled ? nil : e.localizedDescription) }
    func webView(_ v: WKWebView, didFailProvisionalNavigation n: WKNavigation!, withError e: Error) { push(v, error: (e as NSError).code == NSURLErrorCancelled ? nil : e.localizedDescription) }
    func webView(_ v: WKWebView, didStartProvisionalNavigation n: WKNavigation!) { push(v) }
    func webView(_ v: WKWebView, createWebViewWith c: WKWebViewConfiguration, for a: WKNavigationAction, windowFeatures w: WKWindowFeatures) -> WKWebView? {
        // Un document ouvert depuis Outlook/Gmail/etc. (nouvelle fenêtre, window.open) s'affiche PAR-DESSUS le volet, dans un volet « .pop » fermable ;
        // on renvoie une vraie vue (avec la configuration demandée) pour que la page puisse y naviguer elle-même (about:blank puis redirection).
        return owner?.makePop(from: id.hasSuffix(".pop") ? String(id.dropLast(4)) : id, config: c)
    }
    func webViewDidClose(_ v: WKWebView) { if id.hasSuffix(".pop") { owner?.closePane(id) } }
    @available(macOS 12.0, *)
    func webView(_ v: WKWebView, requestMediaCapturePermissionFor o: WKSecurityOrigin, initiatedByFrame f: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) { decisionHandler(.prompt) }
    func webView(_ v: WKWebView, runJavaScriptAlertPanelWithMessage m: String, initiatedByFrame f: WKFrameInfo, completionHandler: @escaping () -> Void) { let a = NSAlert(); a.messageText = m; a.runModal(); completionHandler() }
    func webView(_ v: WKWebView, runJavaScriptConfirmPanelWithMessage m: String, initiatedByFrame f: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let a = NSAlert(); a.messageText = m; a.addButton(withTitle: "OK"); a.addButton(withTitle: "Annuler"); completionHandler(a.runModal() == .alertFirstButtonReturn)
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKUIDelegate, WKScriptMessageHandler, WKNavigationDelegate {
    var core: NovaApp!
    var base = ""
    var main: NSWindow!
    var panel: FloatingPanel!
    var mainView: WKWebView!
    var panelView: WKWebView!
    var status: NSStatusItem!
    var hotRef: EventHotKeyRef?
    var container: FlippedView!
    var panes: [String: WKWebView] = [:]
    var paneDelegates: [String: PaneDelegate] = [:]
    var panelHiddenByUser = false
    // Tor : processus tor géré par Nova (SOCKS 127.0.0.1:9250), utilisé uniquement par le volet « Navigateur Tor ».
    var torProc: Process?; var torPct = 0; var torPipe: Pipe?
    nonisolated(unsafe) static var torPort: UInt16 = 9250   // 9250 = tor lancé par Nova ; 9050 = tor Homebrew déjà actif (réutilisé)
    func findTor() -> String? {
        let c = ["/opt/homebrew/bin/tor", "/usr/local/bin/tor", "/Applications/Tor Browser.app/Contents/MacOS/Tor/tor", NSHomeDirectory() + "/Applications/Tor Browser.app/Contents/MacOS/Tor/tor"]
        return c.first { FileManager.default.isExecutableFile(atPath: $0) }
    }
    func portOpen(_ port: UInt16) -> Bool {
        let fd = socket(AF_INET, SOCK_STREAM, 0); if fd < 0 { return false }; defer { close(fd) }
        var a = sockaddr_in(); a.sin_family = sa_family_t(AF_INET); a.sin_port = port.bigEndian; a.sin_addr.s_addr = inet_addr("127.0.0.1")
        return withUnsafePointer(to: &a) { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { connect(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) == 0 } }
    }
    func torPortOpen() -> Bool { portOpen(AppDelegate.torPort) }
    var torLogPath: String { NSHomeDirectory() + "/Library/Application Support/Nova/tor/notice.log" }
    /// Avancement réel lu dans le journal de tor (« Bootstrapped NN% »), sans dépendre du tube de sortie.
    func torLogPct() -> Int {
        guard let d = FileManager.default.contents(atPath: torLogPath), let t = String(data: d.suffix(6000), encoding: .utf8) else { return 0 }
        var best = 0
        var rest = t[...]
        while let r = rest.range(of: #"Bootstrapped (\d+)%"#, options: .regularExpression) { best = Int(rest[r].filter { $0.isNumber }) ?? best; rest = rest[r.upperBound...] }
        return best
    }
    func torReport() {
        if torProc?.isRunning == true { torPct = max(torPct, torLogPct()) }
        let st: [String: Any] = ["installed": findTor() != nil, "running": torPortOpen(), "pct": torPct, "ready": torPct >= 100 || (torProc == nil && torPortOpen())]
        if let data = try? JSONSerialization.data(withJSONObject: st), let j = String(data: data, encoding: .utf8) { mainView.evaluateJavaScript("window.NovaNative&&NovaNative.onTor&&NovaNative.onTor(\(j))", completionHandler: nil) }
    }
    func torStart() {
        if torProc?.isRunning != true {   // un tor déjà actif (service Homebrew sur 9050, ou le nôtre sur 9250) : on le réutilise
            if portOpen(9050) { AppDelegate.torPort = 9050; torPct = 100; torReport(); return }
            if portOpen(9250) { AppDelegate.torPort = 9250; torPct = 100; torReport(); return }
        } else { torReport(); return }
        guard let bin = findTor() else { torReport(); return }
        let dir = NSHomeDirectory() + "/Library/Application Support/Nova/tor"; try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
        let p = Process(); p.executableURL = URL(fileURLWithPath: bin)
        var args = ["--SocksPort", "127.0.0.1:\(AppDelegate.torPort)", "--DataDirectory", dir, "--ClientOnly", "1", "--Log", "notice file \(dir)/notice.log"]
        let base = (bin as NSString).deletingLastPathComponent
        for (flag, f) in [("--GeoIPFile", "../Data/geoip"), ("--GeoIPv6File", "../Data/geoip6")] { let path = base + "/" + f; if FileManager.default.fileExists(atPath: path) { args += [flag, path] } }
        p.arguments = args; p.currentDirectoryURL = URL(fileURLWithPath: base)
        let pipe = Pipe(); p.standardOutput = pipe; p.standardError = pipe; torPipe = pipe; torPct = 0
        pipe.fileHandleForReading.readabilityHandler = { [weak self] h in
            let t = String(decoding: h.availableData, as: UTF8.self)
            if let r = t.range(of: #"Bootstrapped (\d+)%"#, options: .regularExpression), let n = Int(t[r].filter { $0.isNumber }) { DispatchQueue.main.async { self?.torPct = n; self?.torReport() } }
        }
        do { try p.run(); torProc = p } catch { torReport() }
    }
    func applicationWillTerminate(_ n: Notification) { torProc?.terminate() }

    /// Empêche la veille du Mac tant que Nova tourne (les Dots et les missions travaillent en arrière-plan). L'écran peut s'éteindre ; le système, non.
    var keepAwake: NSObjectProtocol?
    func applicationDidFinishLaunching(_ n: Notification) {
        keepAwake = ProcessInfo.processInfo.beginActivity(options: [.idleSystemSleepDisabled, .suddenTerminationDisabled, .automaticTerminationDisabled], reason: "Nova : Dots et missions en arrière-plan")
        // Sélecteur d'onglets Ctrl+Tab / Option+Tab (⌘Tab est réservé à macOS) : fonctionne aussi quand un volet web (Outlook, Teams…) a le focus.
        NSEvent.addLocalMonitorForEvents(matching: [.keyDown, .flagsChanged]) { [weak self] e in
            guard let self = self, let w = self.main, w.isKeyWindow else { return e }
            let f = e.modifierFlags
            if e.type == .keyDown, e.keyCode == 48, (f.contains(.control) || f.contains(.option)), !f.contains(.command) {
                self.mainView.evaluateJavaScript("window.NovaSwitch&&NovaSwitch.step(\(f.contains(.shift) ? -1 : 1))", completionHandler: nil)
                return nil
            }
            if e.type == .flagsChanged, !f.contains(.control), !f.contains(.option) {
                self.mainView.evaluateJavaScript("window.NovaSwitch&&NovaSwitch.commit()", completionHandler: nil)
            }
            return e
        }
        let res = Bundle.main.resourcePath.map { $0 + "/web" } ?? ""
        let web = ProcessInfo.processInfo.environment["NOVA_WEB"] ?? (FileManager.default.fileExists(atPath: res + "/index.html") ? res : "")
        core = NovaApp(keys: KeychainStore(), webDir: web)
        do {
            // Port FIXE (repli : aléatoire s'il est pris) : le navigateur intégré range thèmes, disposition, historique… par origine (adresse + port).
            // Avec un port aléatoire, chaque redémarrage donnait une origine neuve et tout « sautait ».
            let port: Int
            if let p = try? core.start(port: 47615) { port = p } else { port = try core.start(port: 0) }
            base = "http://127.0.0.1:\(port)"
        } catch {
            let a = NSAlert(); a.messageText = "Nova ne peut pas démarrer"; a.informativeText = "\(error)"; a.runModal(); NSApp.terminate(nil); return
        }
        buildMenu(); buildMain(); buildPanel(); buildStatus(); registerHotkey(); panel.orderOut(nil)
        NSApp.activate(ignoringOtherApps: true)
    }
    /// Un seul compagnon à la fois : dans la fenêtre Nova c'est l'avatar de l'app ; quand tu travailles dans une autre app, le panneau flottant prend le relais.
    func applicationDidBecomeActive(_ n: Notification) { if let w = main, w.isVisible, !w.isMiniaturized { panel?.orderOut(nil) } }
    func applicationDidResignActive(_ n: Notification) { if !panelHiddenByUser, let w = main, !w.isVisible || w.isMiniaturized { panel?.orderFrontRegardless() } }
    func windowWillClose(_ n: Notification) { if !panelHiddenByUser { panel?.orderFrontRegardless() } }
    func windowDidMiniaturize(_ n: Notification) { if !panelHiddenByUser { panel?.orderFrontRegardless() } }
    func applicationShouldTerminateAfterLastWindowClosed(_ a: NSApplication) -> Bool { false }
    func applicationShouldHandleReopen(_ a: NSApplication, hasVisibleWindows f: Bool) -> Bool { showMain(); return true }

    func makeWebView(transparent: Bool) -> WKWebView {
        let cfg = WKWebViewConfiguration()
        cfg.userContentController.add(self, name: "nova")
        cfg.mediaTypesRequiringUserActionForPlayback = []
        let v = WKWebView(frame: .zero, configuration: cfg)
        v.uiDelegate = self; v.navigationDelegate = self
        if transparent { v.setValue(false, forKey: "drawsBackground") }
        if #available(macOS 13.3, *) { v.isInspectable = true }
        return v
    }
    func load(_ v: WKWebView, _ path: String) {
        if let u = URL(string: "\(base)\(path)?t=\(core.server.token)") { v.load(URLRequest(url: u)) }
    }

    func buildMain() {
        main = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1320, height: 860), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        main.title = "Nova"; main.center(); main.isReleasedWhenClosed = false; main.delegate = self
        main.setFrameAutosaveName("NovaMain")
        mainView = makeWebView(transparent: false)
        mainView.configuration.userContentController.addUserScript(WKUserScript(source: "window.__NOVA_NATIVE_WEB = true;", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        container = FlippedView(frame: main.contentView!.bounds)
        mainView.frame = container.bounds; mainView.autoresizingMask = [.width, .height]; container.addSubview(mainView)
        main.contentView = container
        load(mainView, "/")
        main.makeKeyAndOrderFront(nil)
    }
    func buildPanel() {
        let f = NSRect(x: 0, y: 0, width: 300, height: 440)
        panel = FloatingPanel(contentRect: f, styleMask: [.borderless, .resizable], backing: .buffered, defer: false)
        panel.isOpaque = false; panel.backgroundColor = .clear; panel.hasShadow = false
        panel.level = .floating; panel.isMovableByWindowBackground = true; panel.isReleasedWhenClosed = false
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
        panel.hidesOnDeactivate = false
        panel.setFrameAutosaveName("NovaPanel")
        if let s = NSScreen.main { panel.setFrameOrigin(NSPoint(x: s.visibleFrame.maxX - 330, y: s.visibleFrame.minY + 30)) }
        panelView = makeWebView(transparent: true)
        panel.contentView = panelView
        load(panelView, "/panel.html")
        panel.orderFrontRegardless()
    }
    func buildStatus() {
        status = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        status.button?.title = "◉"
        let m = NSMenu()
        m.addItem(withTitle: "Ouvrir Nova", action: #selector(showMain), keyEquivalent: "").target = self
        m.addItem(withTitle: "Afficher / masquer l'assistant", action: #selector(togglePanel), keyEquivalent: "").target = self
        m.addItem(withTitle: "Parler (⌥ Espace)", action: #selector(talk), keyEquivalent: "").target = self
        m.addItem(NSMenuItem.separator())
        m.addItem(withTitle: "Quitter Nova", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        status.menu = m
    }
    func buildMenu() {
        let bar = NSMenu(); let app = NSMenuItem(); bar.addItem(app)
        let am = NSMenu(); app.submenu = am
        am.addItem(withTitle: "À propos de Nova", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        am.addItem(NSMenuItem.separator())
        am.addItem(withTitle: "Masquer Nova", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        am.addItem(withTitle: "Quitter Nova", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        let ed = NSMenuItem(); bar.addItem(ed); let em = NSMenu(title: "Édition"); ed.submenu = em
        em.addItem(withTitle: "Annuler", action: Selector(("undo:")), keyEquivalent: "z")
        em.addItem(withTitle: "Rétablir", action: Selector(("redo:")), keyEquivalent: "Z")
        em.addItem(NSMenuItem.separator())
        em.addItem(withTitle: "Couper", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        em.addItem(withTitle: "Copier", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        em.addItem(withTitle: "Coller", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        em.addItem(withTitle: "Tout sélectionner", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        let wi = NSMenuItem(); bar.addItem(wi); let wm = NSMenu(title: "Fenêtre"); wi.submenu = wm
        wm.addItem(withTitle: "Assistant flottant", action: #selector(togglePanel), keyEquivalent: "").target = self
        wm.addItem(withTitle: "Fenêtre Nova", action: #selector(showMain), keyEquivalent: "0").target = self
        NSApp.mainMenu = bar; NSApp.windowsMenu = wm
    }

    @objc func showMain() { main.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true) }
    @objc func togglePanel() { if panel.isVisible { panelHiddenByUser = true; panel.orderOut(nil) } else { panelHiddenByUser = false; panel.orderFrontRegardless() } }
    @objc func talk() {
        if !panel.isVisible { panel.orderFrontRegardless() }
        panel.makeKey()
        panelView.evaluateJavaScript("window.Nova && window.Nova.toggleVoice && window.Nova.toggleVoice()", completionHandler: nil)
    }

    func registerHotkey() {
        var spec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        let me = Unmanaged.passUnretained(self).toOpaque()
        InstallEventHandler(GetApplicationEventTarget(), { _, _, ud in
            guard let ud = ud else { return noErr }
            let d = Unmanaged<AppDelegate>.fromOpaque(ud).takeUnretainedValue()
            DispatchQueue.main.async { d.talk() }
            return noErr
        }, 1, &spec, me, nil)
        RegisterEventHotKey(UInt32(kVK_Space), UInt32(optionKey), EventHotKeyID(signature: OSType(0x4E4F5641), id: 1), GetApplicationEventTarget(), 0, &hotRef)
    }

    // Micro : accordé uniquement à notre propre serveur local.
    @available(macOS 12.0, *)
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo,
                 type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(origin.host == "127.0.0.1" ? .grant : .deny)
    }
    func userContentController(_ c: WKUserContentController, didReceive m: WKScriptMessage) {
        guard let d = m.body as? [String: Any], let cmd = d["cmd"] as? String else { return }
        if cmd == "openMain" { showMain(); return }
        guard m.webView === mainView else { return }   // seule la fenêtre principale pilote les volets
        func rect() -> NSRect { NSRect(x: (d["x"] as? Double) ?? 0, y: (d["y"] as? Double) ?? 0, width: (d["w"] as? Double) ?? 0, height: (d["h"] as? Double) ?? 0) }
        let id = (d["id"] as? String) ?? ""
        switch cmd {
        case "web.show":
            let pane = panes[id] ?? makePane(id)
            pane.frame = rect(); pane.isHidden = false
            if let q = panes[id + ".pop"] { q.frame = rect(); q.isHidden = false; paneDelegates[id + ".pop"]?.push(q) }
            if pane.url == nil, let u = (d["url"] as? String).flatMap({ URL(string: $0) }) { pane.load(URLRequest(url: u)) }
            main.makeFirstResponder(pane)
        case "web.move": if let p = panes[id] { p.frame = rect(); p.isHidden = false }; if let q = panes[id + ".pop"] { q.frame = rect(); q.isHidden = false }
        case "win.fs":   // plein écran réel du Mac (barre de menus et Dock masqués) ; "on" absent = bascule
            let isFS = main.styleMask.contains(.fullScreen)
            let want = (d["on"] as? Bool) ?? !isFS
            main.collectionBehavior.insert(.fullScreenPrimary)
            if want != isFS { main.toggleFullScreen(nil) }
        case "tor.start": torStart()
        case "tor.status": torReport()
        case "web.hideAll": panes.values.forEach { $0.isHidden = true }
        case "web.nav":
            guard let p = panes[id] else { return }
            switch (d["action"] as? String) ?? "" {
            case "back": p.goBack()
            case "forward": p.goForward()
            case "reload": p.reload()
            case "stop": p.stopLoading()
            case "go": if let u = (d["url"] as? String).flatMap({ URL(string: $0) }) { p.load(URLRequest(url: u)) }
            default: break }
        case "web.zoom":
            guard let p = panes[id] else { return }
            switch (d["action"] as? String) ?? "" {
            case "in": p.pageZoom = min(3.0, p.pageZoom + 0.1)
            case "out": p.pageZoom = max(0.5, p.pageZoom - 0.1)
            case "reset": p.pageZoom = 1.0
            default: if let v = d["value"] as? Double { p.pageZoom = min(3.0, max(0.5, v)) } }
            panes[id].map { paneDelegates[id]?.push($0) }
        case "web.clearData":   // cookies, cache, stockage local du navigateur intégré (jamais les clés ni les réglages de Nova)
            let all = WKWebsiteDataStore.allWebsiteDataTypes()
            WKWebsiteDataStore.default().removeData(ofTypes: all, modifiedSince: Date.distantPast) { }
        case "web.close": panes[id]?.removeFromSuperview(); panes[id] = nil; paneDelegates[id] = nil; closePane(id + ".pop")
        case "web.text":
            guard let p = panes[id] else { return }
            p.evaluateJavaScript("document.body ? document.body.innerText : ''") { [weak self] r, _ in
                let t = (r as? String) ?? ""
                if let data = try? JSONSerialization.data(withJSONObject: [t], options: []), let arr = String(data: data, encoding: .utf8) {
                    self?.mainView.evaluateJavaScript("window.NovaNative&&NovaNative.onText(\"\(id)\", \(arr)[0])", completionHandler: nil)
                }
            }
        default: break
        }
    }
    func closePane(_ id: String) {
        panes[id]?.removeFromSuperview(); panes[id] = nil; paneDelegates[id] = nil
        let o: [String: Any] = ["id": id, "url": "", "title": "", "loading": false, "canBack": false, "canForward": false, "closed": true]
        if let d = try? JSONSerialization.data(withJSONObject: o), let j = String(data: d, encoding: .utf8) { mainView.evaluateJavaScript("window.NovaNative&&NovaNative.onNav(\(j))", completionHandler: nil) }
    }
    func makePop(from id: String, config: WKWebViewConfiguration) -> WKWebView {
        let pid = id + ".pop"
        if panes[pid] != nil { panes[pid]?.removeFromSuperview(); panes[pid] = nil; paneDelegates[pid] = nil }
        let v = WKWebView(frame: panes[id]?.frame ?? .zero, configuration: config)
        let dlg = PaneDelegate(id: pid, owner: self)
        v.navigationDelegate = dlg; v.uiDelegate = dlg; v.allowsBackForwardNavigationGestures = true
        paneDelegates[pid] = dlg; panes[pid] = v; container.addSubview(v); v.isHidden = false
        dlg.push(v)   // l'interface affiche aussitôt « ✕ Fermer le document »
        return v
    }
    func makePane(_ id: String) -> WKWebView {
        let cfg = WKWebViewConfiguration()
        if id == "tor", #available(macOS 14.0, *) {   // navigation via Tor : stockage éphémère (rien n'est conservé) + tout le trafic passe par le SOCKS local de tor
            let ds = WKWebsiteDataStore.nonPersistent()
            ds.proxyConfigurations = [ProxyConfiguration(socksv5Proxy: NWEndpoint.hostPort(host: "127.0.0.1", port: NWEndpoint.Port(rawValue: AppDelegate.torPort)!))]
            cfg.websiteDataStore = ds
        } else {
        cfg.websiteDataStore = WKWebsiteDataStore.default()          // session conservée d'un lancement à l'autre (connexion WhatsApp, Telegram, Facebook)
        }
        cfg.applicationNameForUserAgent = "Version/18.6 Safari/605.1.15"
        let v = WKWebView(frame: .zero, configuration: cfg)
        let dlg = PaneDelegate(id: id, owner: self)
        v.navigationDelegate = dlg; v.uiDelegate = dlg; v.allowsBackForwardNavigationGestures = true
        paneDelegates[id] = dlg; panes[id] = v; container.addSubview(v)
        return v
    }
    // Boîtes de dialogue JavaScript (confirm, alert) de l'interface Nova elle-même
    func webView(_ v: WKWebView, runJavaScriptAlertPanelWithMessage m: String, initiatedByFrame f: WKFrameInfo, completionHandler: @escaping () -> Void) { let a = NSAlert(); a.messageText = m; a.runModal(); completionHandler() }
    func webView(_ v: WKWebView, runJavaScriptConfirmPanelWithMessage m: String, initiatedByFrame f: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let a = NSAlert(); a.messageText = m; a.addButton(withTitle: "OK"); a.addButton(withTitle: "Annuler"); completionHandler(a.runModal() == .alertFirstButtonReturn)
    }
    // Les liens externes s'ouvrent dans le navigateur, jamais dans la fenêtre Nova.
    func webView(_ webView: WKWebView, decidePolicyFor a: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if a.shouldPerformDownload { decisionHandler(.download); return }
        if let u = a.request.url, let h = u.host, h != "127.0.0.1", a.navigationType == .linkActivated { NSWorkspace.shared.open(u); decisionHandler(.cancel); return }
        decisionHandler(.allow)
    }
    func webView(_ v: WKWebView, decidePolicyFor r: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        decisionHandler(r.canShowMIMEType ? .allow : .download)
    }
    func webView(_ v: WKWebView, navigationAction a: WKNavigationAction, didBecome d: WKDownload) { d.delegate = DownloadHandler.shared }
    func webView(_ v: WKWebView, navigationResponse r: WKNavigationResponse, didBecome d: WKDownload) { d.delegate = DownloadHandler.shared }
    func webView(_ webView: WKWebView, createWebViewWith c: WKWebViewConfiguration, for a: WKNavigationAction, windowFeatures w: WKWindowFeatures) -> WKWebView? {
        if let u = a.request.url { NSWorkspace.shared.open(u) }
        return nil
    }
}

VaultHooks.pdfText = { path in PDFDocument(url: URL(fileURLWithPath: path))?.string }
let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
#else
print("NovaMac requiert macOS (AppKit). Utilise nova-server sur les autres plateformes.")
#endif
