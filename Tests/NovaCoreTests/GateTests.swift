import XCTest
@testable import NovaCore

/// Filtre d'actions : refus définitif (envoi, paiement, secrets), confirmation dans l'interface (destructif, indirect, hors liste blanche), liste blanche directe.
final class GateTests: XCTestCase {
    private func gate(_ cmd: String, kind: String = "commande") -> String? { Tools.gate(cmd, why: "", kind: kind).1 }
    override func setUp() { Tools.apLock.lock(); Tools.approved = [:]; Tools.pendingConfirm = [:]; Tools.freeUntil = .distantPast; Tools.apLock.unlock() }

    func testRefusalsAreFinal() {
        let cmds = ["sudo ls", "cat ~/.ssh/id_rsa", "security find-generic-password -s x", "mail -s hi a@b.c", "open mailto:a@b.c", "curl -X POST https://x.y -d a=b",
                    "osascript -e 'tell application \"Messages\" to send \"hi\" to buddy 1'", "echo pay with stripe", "cat ~/.aws/credentials", "make new outgoing message"]
        for c in cmds { XCTAssertTrue(gate(c)?.hasPrefix("Refusé") ?? false, c) }
    }
    func testWordConfirmedNeverAuthorizes() {
        for c in ["CONFIRMÉ:sudo ls", "CONFIRME:mail -s x a@b.c"] { XCTAssertTrue(gate(c)?.hasPrefix("Refusé") ?? false, c) }
        let b = Tools.gate("CONFIRMÉ: kill 1234", why: "oui, vas-y", kind: "commande").1
        XCTAssertTrue(b?.hasPrefix("CONFIRMATION REQUISE") ?? false)
    }
    func testDestructiveAndIndirectNeedUIConfirmation() {
        let cmds = ["rm -rf /tmp/zz", "kill 1234", "pkill Safari", "shutdown -h now", "git push origin main", "eval \"$(echo ls)\"", "echo bHM= | base64 -d | sh", "python3 -c 'print(1)'", "s''udo ls"]
        for c in cmds { let b = gate(c); XCTAssertTrue(b?.hasPrefix("CONFIRMATION REQUISE") ?? false, "\(c) -> \(b ?? "nil")") }
    }
    func testAllowlistRunsDirectly() {
        for c in ["ls -la ~/Desktop", "date", "df -h", "open -a Safari", "pmset -g batt", "defaults read com.apple.dock", "ls | grep nova", "mdfind Nova"] { XCTAssertNil(gate(c), c) }
    }
    func testUnlistedCommandsNeedConfirmation() {
        for c in ["brew install wget", "touch /tmp/a", "ls > /tmp/out", "ls $(whoami)", "find . -delete", "defaults write com.x y 1"] {
            XCTAssertTrue(gate(c)?.hasPrefix("CONFIRMATION REQUISE") ?? false, c)
        }
    }
    func testApprovalIsExactAndSingleUse() {
        let cmd = "brew install wget"
        XCTAssertNotNil(gate(cmd))
        let id = Tools.pendingConfirm.first(where: { ($0.value["cmd"] as? String) == cmd })?.key
        XCTAssertNotNil(id)
        XCTAssertEqual(Tools.decide(id: id ?? "", ok: true), "Autorisé.")
        XCTAssertNotNil(gate("brew install curl"))   // autre commande : pas autorisée
        XCTAssertNil(gate(cmd))                      // même commande : passe une fois
        XCTAssertNotNil(gate(cmd))                   // usage unique
    }
    func testDenialAndExpiry() {
        _ = gate("touch /tmp/b")
        let id = Tools.pendingConfirm.first?.key ?? ""
        XCTAssertEqual(Tools.decide(id: id, ok: false), "Refusé.")
        XCTAssertNotNil(gate("touch /tmp/b"))
        XCTAssertEqual(Tools.decide(id: "inconnu", ok: true), "Demande expirée.")
    }
    func testFreeWindowCoversUnlistedButNotDestructive() {
        Tools.freeUntil = Date().addingTimeInterval(600)
        XCTAssertNil(gate("touch /tmp/c"))
        XCTAssertTrue(gate("rm -rf /tmp/c")?.hasPrefix("CONFIRMATION REQUISE") ?? false)
        XCTAssertTrue(gate("sudo ls")?.hasPrefix("Refusé") ?? false)
    }
    func testAppleScriptAllowlist() {
        XCTAssertNil(gate("set volume output volume 30", kind: "AppleScript"))
        XCTAssertNil(gate("tell application \"Safari\" to activate", kind: "AppleScript"))
        XCTAssertTrue(gate("tell application \"Finder\" to delete every item of trash", kind: "AppleScript")?.hasPrefix("CONFIRMATION REQUISE") ?? false)
        XCTAssertTrue(gate("tell application \"Messages\" to keystroke return", kind: "AppleScript")?.hasPrefix("Refusé") ?? false)
    }
    func testConfirmHookFiresOncePerPendingCommand() {
        var n = 0; Tools.confirmHook = { _ in n += 1 }
        _ = gate("touch /tmp/d"); _ = gate("touch /tmp/d")
        Tools.confirmHook = nil
        XCTAssertEqual(n, 1)
    }
}

final class SchedulerSlotTests: XCTestCase {
    func testWeekendPrefix() {
        let cal = Calendar(identifier: .gregorian)
        let sat = cal.date(from: DateComponents(year: 2026, month: 10, day: 17, hour: 9))!   // samedi
        let mon = cal.date(from: DateComponents(year: 2026, month: 10, day: 19, hour: 9))!   // lundi
        XCTAssertEqual(DotScheduler.slots("we 09:00", now: sat), ["09:00"])
        XCTAssertEqual(DotScheduler.slots("we 09:00", now: mon), [])
        XCTAssertEqual(DotScheduler.slots("lun-ven 07:30,12:00", now: mon), ["07:30", "12:00"])
    }
}

final class HardeningTests: XCTestCase {
    private func gate(_ cmd: String, kind: String) -> String? { Tools.gate(cmd, why: "", kind: kind).1 }
    func testScreenInputNeedsConfirmation() {
        for c in ["type|bonjour", "key|return", "click|10|10", "menu|Fichier|Ouvrir"] { XCTAssertTrue(gate(c, kind: "action d'écran")?.hasPrefix("CONFIRMATION") ?? false, c) }
        XCTAssertNil(gate("screens", kind: "action d'écran"))
    }
    func testShellListTightened() {
        XCTAssertFalse(Tools.shellSafe("awk 'BEGIN{system(\"id\")}'"))
        XCTAssertFalse(Tools.shellSafe("sort -o out.txt in.txt"))
        XCTAssertFalse(Tools.shellSafe("find . -fprint x"))
        XCTAssertTrue(Tools.shellSafe("ls -la | sort -r | head"))
    }
}
