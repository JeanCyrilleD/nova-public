// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "Nova",
    platforms: [.macOS(.v13)],
    products: [
        .library(name: "NovaCore", targets: ["NovaCore"]),
        .executable(name: "nova-server", targets: ["nova-server"]),
        .executable(name: "NovaMac", targets: ["NovaMac"]),
    ],
    targets: [
        .target(name: "NovaCore", path: "Sources/NovaCore"),
        .executableTarget(name: "nova-server", dependencies: ["NovaCore"], path: "Sources/nova-server"),
        .executableTarget(name: "NovaMac", dependencies: ["NovaCore"], path: "Sources/NovaMac"),
        .testTarget(name: "NovaCoreTests", dependencies: ["NovaCore"], path: "Tests/NovaCoreTests"),
    ]
)
