import XCTest
@testable import NovaCore

final class MomoTests: XCTestCase {
    private static let dir: String = {
        let d = NSTemporaryDirectory() + "nova-tests-\(UUID().uuidString)"
        setenv("NOVA_HOME", d, 1)   // avant tout accès à Tools.momoFile (static paresseux)
        return d
    }()

    override func setUp() {
        super.setUp()
        _ = MomoTests.dir
        Tools.momoFile.write([[String: Any]]())
    }

    private func firstId(_ s: String) -> String? {
        guard let a = s.firstIndex(of: "["), let b = s.firstIndex(of: "]"), a < b else { return nil }
        return String(s[s.index(after: a)..<b])
    }

    func testEmptyList() {
        XCTAssertTrue(Tools.momo("list").contains("aucune opération"))
    }

    func testAddListDone() {
        let r = Tools.momo("add|Orange|15 000|Loyer|2999-01-31")
        XCTAssertTrue(r.hasPrefix("Noté"), r)
        XCTAssertTrue(r.contains("15000 FCFA"), r)
        let id = firstId(r)
        XCTAssertNotNil(id)
        let l = Tools.momo("list")
        XCTAssertTrue(l.contains("Loyer") && l.contains("total 15000 FCFA"), l)
        let d = Tools.momo("done|\(id!)")
        XCTAssertTrue(d.hasPrefix("Marqué comme fait"), d)
        XCTAssertTrue(Tools.momo("list").contains("aucune opération"))
    }

    func testConfirmPrefixAccepted() {
        let r = Tools.momo("CONFIRMÉ:add|Wave|2000|Courses")
        XCTAssertTrue(r.hasPrefix("Noté"), r)
        let r2 = Tools.momo("confirme:add|Moov|500|Credit")
        XCTAssertTrue(r2.hasPrefix("Noté"), r2)
        let l = Tools.momo("list")
        XCTAssertTrue(l.contains("Courses") && l.contains("Credit") && l.contains("total 2500"), l)
    }

    func testLateAndInvalid() {
        _ = Tools.momo("add|Orange|100|Ancien|2000-01-01")
        XCTAssertTrue(Tools.momo("list").contains("EN RETARD"))
        XCTAssertTrue(Tools.momo("add|Orange").hasPrefix("momo|add"))
        XCTAssertTrue(Tools.momo("done|zzzz").hasPrefix("momo|done"))
    }

    func testRemove() {
        let id = firstId(Tools.momo("add|Orange|100|Temp"))!
        XCTAssertEqual(Tools.momo("remove|\(id)"), "Supprimé.")
        XCTAssertFalse(Tools.momo("list").contains("Temp"))
    }
}
