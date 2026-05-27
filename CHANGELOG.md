# Changelog

All notable changes to StudyDesk are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial release: Spotlight-style productivity HUD with always-on-top floating
  bar, Pomodoro timer, highlight capture, todos, calendar, and inbox tabs
  (`f43a14e`).
- Google OAuth2 sign-in for Gmail using the loopback + PKCE flow — works for
  Workspace accounts where App Passwords are disabled (`3f392ea`).
- Support for shipped OAuth credentials in `oauthConfig.ts` so end users get a
  pure one-click "Sign in with Google" experience (`feb146f`).
- Stored OAuth Client ID is now displayed in Settings with a Reset button to
  wipe credentials and start over (`5c35d47`).
- Auto-fetch Gmail on connect and on app boot — no more 15-minute wait for the
  first batch of emails (`8c89f87`).
- Inbox tab now reads real Gmail data and ships with `CLAUDE.md` architecture
  guide for contributors (`5f8e58c`).

### Changed
- Pill UI unified into a single glass surface for visual consistency
  (`f8b1556`).
- StudyDesk notes workspace copy now uses clearer student-facing language for
  course plans, deadlines, notebooks, quiz/flashcard draft flows, and the Study
  Studio panel.

### Fixed
- Gmail "Invalid credentials" errors now surface an actionable setup guide
  instead of the cryptic IMAP message (`04db2c7`).
- OAuth "failed to fetch user email" resolved by adding `openid` and `email`
  scopes — userinfo lookup was returning 401 without them (`def193b`).
- System freeze when dragging windows — global mouseup hook now rate-limits
  capture attempts and guards against concurrent osascript spawns
  (`f8b1556`).
