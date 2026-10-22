# Security model

Nova is local-first. Please report vulnerabilities privately through GitHub security advisories.

- The main server binds to 127.0.0.1 only, checks the Host header and requires a per-launch token.
- Secrets live only in the macOS Keychain. Nothing is logged or displayed.
- Every side-effect tool (shell, AppleScript, screen actions, opening files) passes a confirmation gate; shell commands are allow-listed; sensitive paths are blocked after path normalisation.
- Sending messages, payments and typing passwords are never performed by the agent.
- The optional phone bridge is off by default, listens only on a Tailscale address (100.64.0.0/10), needs a pairing code and per-device tokens, is rate-limited with lockout, and exposes chat without agent tools.
- Web or file content is treated as data, never as instructions.
