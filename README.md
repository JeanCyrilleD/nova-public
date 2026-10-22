# Nova

One local workspace for work, focus and downtime on macOS: calendar, mail, notes, tasks, finances (BRVM/UEMOA statements), browsing, media, voice and an AI agent, in a single window. The AI is the engine, not the product.

- **Resilient multi-model router**: Claude, GPT, Gemini, DeepSeek, GLM, Kimi, Meta Muse, free tiers (OpenRouter, Groq, Mistral, Cerebras), OmniRoute and a local engine, with ordered failover before the first token.
- **Safe agent**: every sensitive action needs your confirmation on your own machine.
- **Focus Mode**: intention, timer, session notes, calm mode, AI session summary.
- **Local-first**: data stays on your Mac; keys stay in the Keychain.
- 60 sub-tabs in 10 groups, Liquid Glass theme, accessibility themes, French first.

## Build (macOS 13+, Swift 5.9+)
```
swift build -c release
mac/build.sh        # assembles Nova.app (see script)
```
Add your own API keys in Settings > Connections (stored in the Keychain). Replace `web/assets/profile.jpg` with your photo.

## Tests
`swift test` (security gate, scheduler, host checks) and `python3 tests/integration.py` / `tests/ui_test.py` (integration and UI harness with mock providers).

## Security
See [SECURITY.md](SECURITY.md).

## Licence
MIT
