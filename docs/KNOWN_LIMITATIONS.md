# Known limitations

Maintained throughout v0.1. Entries are added when a limitation is discovered or accepted; each notes the milestone that introduced it.

- **Verification environment (M0):** Playwright WebKit is desktop WebKit with mobile emulation, not iOS. Standalone mode, Home Screen storage, the real keyboard, safe areas and the status bar can only be verified by a human on a device. See `docs/IOS_VERIFICATION.md` (created in M11).
