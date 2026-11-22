# iPhone publishing and responses — design review

Open [the interactive preview](index.html) in a browser. Use its Owner, Visitor and Responses controls
to explore the proposed layout. The owner state is simulated explicitly; the preview does not
publish, persist drafts or send comments. Existing personal copy and collection counts are reused.
This is a local review artifact on `design/010-iphone-owner-flow`, outside Astro's pages/public
folders. It is not included in the public site build.

The existing public header measured186px high at414px width; the proposed header measures68px.
The current editor's account/header113px plus heading/publish stack pushes the writing down.
The proposed editor uses one navigation row and keeps title, post and photo controls together.
Keep the PWA's direct editor launch, and let an authenticated owner return to browsing and find
New post. Browsers and installed iOS web apps may have different sessions: confirm the session in
the context being used instead of assuming the Safari login transferred.

## Design basis

[Apple layout guidance](https://developer.apple.com/design/human-interface-guidelines/layout)
informs safe-area spacing and adaptable composition.
[Apple buttons guidance](https://developer.apple.com/design/human-interface-guidelines/buttons)
informs one clear primary action, feedback and generous targets. For this web implementation,
we use44 CSS px minimum touch targets,16px-or-larger input text and preserve zoom.
[Apple feedback guidance](https://developer.apple.com/design/human-interface-guidelines/feedback)
informs visible draft, publishing and error states. These principles guide a web app; this is
not an Apple certification or a native SwiftUI conversion.

The [community mobile-ios-design skill](https://skills.sh/wshobson/agents/mobile-ios-design)
was inspected from [its source](https://github.com/wshobson/agents/blob/main/plugins/ui-design/skills/mobile-ios-design/SKILL.md).
The directory reported25.1K installs and42.8K repository stars at review time. It is community-authored,
not an official Apple skill. Apply relevant safe-area, accessible-navigation and state-restoration
principles alongside our installed design-taste-frontend skill. Keep Sentient/grey/oxblood and the
existing web stack rather than importing its SwiftUI component examples or visual effects.

## Ten heuristics applied

Applications of [Jakob Nielsen's ten usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/):

| Principle | Application |
| --- | --- |
| Visible status | Saved, publishing, awaiting approval, retry states. |
| Familiar language | New post, Add photos, Publish. |
| Control and freedom | Back keeps draft; undo likes; confirm discard. |
| Consistency | Stable navigation and existing visual identity. |
| Prevent errors | Validate inputs; disable duplicate sends. |
| Recognition | Visible labels and owner action; no remembered URL. |
| Efficiency | PWA opens editor; owner can resume draft. |
| Minimalism | Compact header; remove desktop shortcuts on touch. |
| Error recovery | Preserve draft; actionable retry; private diagnostics. |
| Contextual help | Photo limits beside attachments; explain moderation. |

## Anonymous responses

No account, required name or email. Plain text comments await owner approval. Likes can be toggled;
browser-token deduplication limits repeats but is not a count of verified people. Backend work must
include input bounds, spam/rate limits, idempotency, owner-only moderation and durable storage/backup.
Minimise stored identifiers; anonymity in the form does not erase existing network infrastructure
logs. Do not insert a third-party tracking/comment widget by default.

## Actual checks and limits

- Existing homepage/login/editor inspected in an isolated authenticated browser; no fixture published.
- Proposal checked at414×896,414×715,896×414 and390×844. Menu works; owner/visitor action switches;
  editor can be filled; mock like can be undone; anonymous response says approval is pending.
- No horizontal overflow and no visible link/button/summary under44px high in checked editor/response
  views. Screenshots captured in `.taste-skill/inspect-iphone-proposal/` and reviewed.
- Design source lint:0 FAIL,0 WARN. Existing publishing regression tests were not rerun for this isolated
  preview, which does not change their code.
- This review uses Chromium device emulation. Real iPhone11ProMax Safari/PWA safe areas, keyboard,
  text scaling and VoiceOver still need device testing. Viewport-height checks do not emulate a real
  keyboard. The live owner session, comments and likes remain implementation tasks.
- Existing feature009 publication fails on Ubuntu; persistent private diagnostics are deployed.
  Resolve that failure before layering new production flows on top.

User refinement: hamburger navigation with a24px icon, accessible Navigation menu name, and at least44px tap area. The native details/summary control retains expandable semantics and all destinations.
