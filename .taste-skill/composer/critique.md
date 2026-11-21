# Composer review

Direction: Editorial greeting, seed 1379486437; retain existing Sentient and grey/oxblood identity. Single-screen open plane replaces a sidebar because there are no other authoring screens. The screen asks what the author wants to share on their Blog; the writing field answers it first. Real selected photographs are the only pictures.

Final checks: app lint 0 FAIL / 0 WARN; app browser inspector 0 FAIL / 0 WARN at 1440, 768 and 390px. Opened all six final inspector fold/page images, plus populated and failure screenshots. The final populated preview was opened after replacing cover crops with whole-image previews.

1. Hierarchy: New post and the writing fields lead; Publish post is visible without a menu. The brand is present without competing with the task.
2. Geometry: all fields, title and footer use the same outer edges. Writing/photos occupy the full twelve-column grid. The writing field intentionally remains large enough for a short post rather than stretching to match every attached photo.
3. Colour/face: neutral working text, grey surfaces, Sentient genuinely loaded; oxblood on the name, action, focus and errors. No ornamental colour or metrics. Existing brand values replace the draw's suggested palette/type, as requested by --keep.
4. Counts: words derive from the text; photo count derives from the attachment list. Removal preserves the remaining image description. No duplicated metric facts or sample figures.
5. Empty states: real zero words and zero photos; title/body/photos remain blank until entered. No fabricated personal posts or placeholder images.
6. Legends/charts: none are needed. Photo descriptions have their own labels; final previews show the entire image rather than cropping a subject out.
7. Narrow views: writing/photos stack at 800px, Publish spans the phone width, no horizontal overflow. The primary laptop layout keeps attachments beside the writing. A phone requires vertical scrolling; this is a laptop shortcut tool.

Issues corrected during validation: preserve complete subjects in photo previews; scroll publishing errors into view; clear the busy flag before successful navigation so the unsaved-writing guard does not interrupt opening the published post.

Functional browser QA passed in an isolated temporary site: required descriptions, two real-photo attachments, busy state, failed build with writing/photos retained, Command–Return retry, automatic redirect to the built post, two decoded output photographs, no runtime exceptions, and no phone overflow. A final attachment-only check on the actual composer verified whole-image previews and removal without publishing any real-site content.

Limits: no persistent draft storage; no public hosting or server upload. No physical global keypress was simulated: the service was registered, its configured key equivalent verified, and its native Automator workflow run successfully. macOS may require enabling the service in Keyboard settings in an already-running application.


## Feature 009 — authenticated phone editor, checkpoint 3

Seen in one second: the existing New post composer, with a private publishing scope and Sign out action.

Idea: preserve Tatenda’s existing writing experience while letting it publish from a phone. The necessary login screen uses the same wordmark, controls, Sentient typeface and grey/oxblood palette.

Layout: login=focused form / editor=existing writing-and-photos grid, stacked on phones. No new visual direction or unrelated UI was introduced.

Browser verification used a real authenticated session in the isolated Playwright fixture, because the standalone inspector cannot sign in to the private editor. At 1440/768/390, login, image attachment, image description and Publish completed. Automated measurements confirmed no horizontal overflow, the existing ground/accent colours, Sentient CSS and inputs at least 16px. Six screenshots were opened and reviewed. Source lint: 0 FAIL / 0 WARN.

No visual defect requiring a redesign was found. The long phone form scrolls naturally, preserving the original layout. The pictured grey image and post text are isolated test fixtures and were never added to real content. Physical iPhone/Safari testing has not been performed. Home-screen installation and durable draft recovery are the next separate checkpoint.
