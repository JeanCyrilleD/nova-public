import XCTest
@testable import NovaCore

final class HostTests: XCTestCase {
    func testInternalHosts() {
        let hosts = ["127.0.0.1", "10.0.0.5", "10.255.1.1", "172.16.0.1", "172.31.255.1", "192.168.1.1", "169.254.169.254",
                        "2130706433", "0x7f000001", "[::1]", "::1", "fe80::1", "foo.local", "localhost", "LOCALHOST",
                        "app.localhost", "svc.internal", "0.0.0.0", "100.64.0.1", "intranet"]
        for h in hosts { XCTAssertTrue(Tools.isInternalHost(h), h) }
    }

    func testPublicHosts() {
        for h in ["example.com", "8.8.8.8", "www.apple.com", "172.15.0.1", "172.32.0.1", "2001:db8::1"] {
            XCTAssertFalse(Tools.isInternalHost(h), h)
        }
    }
}
