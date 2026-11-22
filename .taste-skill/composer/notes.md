# Local post composer

Screen question: what do I want to share on my Blog?

Inventory: one author; the existing tatenda nyemudzo.dev name; short plain-text writing; an existing Blog collection; optional real local photographs; up to eight photos with descriptions; the grey/oxblood palette; the locally installed Sentient typeface; an explicit Publish action; a local-only destination; a date generated at publication; existing static Astro routes.

Direction: Editorial greeting, seed 1379486437. Keep the existing palette and type. The grey writing surface and Sentient make it belong to this personal site. The largest working area is the writing itself; the signature element is the author's photographs with their own descriptions beside the post.

Shell adjustment: one centred 1100px open plane without a sidebar, because this tool has one screen and no other internal destinations. The heading is the task name, New post, rather than a greeting. No invented metrics, navigation, preview photos, or charts. Existing oxblood is confined to the name, primary action, focus and errors; running UI text is neutral for longer writing sessions. No motion beyond control feedback.

Grid: twelve 77px columns plus eleven 16px gaps = 1100px. Writing spans eight columns (728px), attachments four (356px), with one 16px gap. Narrow viewports stack the working areas and keep their labels/actions.

States to verify: empty, text entered, multiple attachments with required descriptions, attachment removal, validation, publishing busy state, failed publishing with content retained, successful redirect to the built post. No sample content is added to the real site's Blog by QA.

Copy: New post / A few words, a few photographs. / Title / Post / Photographs / Attach photos / Publish post / Posts appear in your Blog, only on this Mac.

## Feature 009: phone publishing

Keep the established Editorial greeting composer and its Sentient/grey/oxblood tokens. Reuse the same fields, image previews, flat controls and responsive grid. Remote mode changes only the publishing scope, adds a plain Sign out control, and uses a focused password screen built from the same wordmark, type and inputs. No new visual direction, navigation shell, imagery or dashboard widgets. The private editor remains separate from the static public website.

The screen's question remains “What do I want to share?” Login is only the necessary first step; all publishing feedback stays near the form. Mobile text inputs remain at least 16px and primary touch targets retain their existing 44px minimum.

## Feature 010 final UI (2026-11-22)

Keep Editorial greeting seed 1379486437 and the existing open plane, Sentient, grey/oxblood. The task is writing a real post, with one device draft, up to eight photos and a protected Publish action. The question is “What would I like to share?”; writing is the largest block. Replace the stacked masthead/title/account rows with Back / New post / Publish. Group Photos with the draft and move account controls below it. The local composer keeps its own shell. A dedicated remote template replaces fragile string substitutions, sharing the existing field and publishing behaviour.

References applied: community mobile-ios-design (https://github.com/wshobson/agents/blob/main/plugins/ui-design/skills/mobile-ios-design/SKILL.md), Apple layout (https://developer.apple.com/design/human-interface-guidelines/layout), and Nielsen's ten heuristics (https://www.nngroup.com/articles/ten-usability-heuristics/). Use safe-area insets, responsive text/fields, visible focus, 44px targets, native disclosure navigation and explicit state restoration. Browser emulation only; physical iPhone keyboard/VoiceOver/installed-app checks remain unverified.
