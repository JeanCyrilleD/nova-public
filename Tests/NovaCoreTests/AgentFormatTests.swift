import XCTest
@testable import NovaCore

/// Le format d'appel d'outil natif de DeepSeek (DSML) doit être converti, jamais affiché.
final class AgentFormatTests: XCTestCase {
    func testDSMLShellCallIsConverted() {
        let s = "Je lance. <｜｜DSML｜｜ calls>\n<｜｜DSML｜｜ invoke name=\"shell\">ls ~/Desktop</｜｜DSML｜｜ parameter>\n</｜｜DSML｜｜ invoke>\n</｜｜DSML｜｜ calls>"
        XCTAssertEqual(Agent.normalizeDSML(s), "Je lance.<tool name=\"shell\">ls ~/Desktop</tool>")
    }
    func testDSMLCallWithoutArgument() {
        let s = "<｜｜DSML｜｜ function_calls><｜｜DSML｜｜ invoke name=\"mail_unread\"><｜｜DSML｜｜ parameter name=\"x\"></｜｜DSML｜｜ parameter></｜｜DSML｜｜ invoke></｜｜DSML｜｜ function_calls>"
        XCTAssertEqual(Agent.normalizeDSML(s), "<tool name=\"mail_unread\"></tool>")
    }
    func testPlainTextUntouchedAndUnknownMarkerStripped() {
        XCTAssertEqual(Agent.normalizeDSML("Bonjour"), "Bonjour")
        XCTAssertFalse(Agent.normalizeDSML("Début <｜｜DSML｜｜ truc").contains("DSML"))
    }
}
