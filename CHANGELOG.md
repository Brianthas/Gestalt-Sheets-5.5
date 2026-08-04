# Changelog

All notable changes to this module are documented here. Versions follow the module's `module.json`
`version` field, which is what Foundry checks to detect an available update.

## [0.4.0] - 2026-08-04

### Added
- **Double Spell Slots** toggle (Special Traits tab): a per-actor option that doubles final leveled
  (non-Pact) spell slot totals, as a simple stand-in for true separate per-class pools. Respects any
  spell level a GM has manually overridden, and preserves already-spent slots rather than topping them
  back up.
- This changelog.

### Changed
- **Use Combined Class ASIs** moved from a per-actor Special Traits checkbox to a world setting. Whether
  ASI overlap gets checked at all is a table-wide house rule call, not something that should vary
  character to character within the same game.

## [0.3.0] - 2026-08-04

### Changed
- Hardened `libWrapper` registration: each patch now registers independently with its own try/catch, so
  a future dnd5e update renaming or restructuring something this module depends on fails loudly for that
  one patch (console error + a persistent GM notification) instead of silently preventing every later
  registration in the same `init` callback from running too. Added guards for the dnd5e system not being
  active and for `libWrapper` itself not being installed.
- Added a CI workflow that syntax-checks the script and validates `module.json`/`lang/en.json` on every
  push and pull request.

## [0.2.9] - 2026-08-04

### Fixed
- The sibling-class level-up reminder could misfire, naming the wrong class. Root cause: dnd5e's
  Advancement Manager commits a leveling operation via a bulk `updateEmbeddedDocuments` call on its
  cloned actor, which can include an unrelated sibling class's `system.levels` in the payload even when
  that class's value never actually changed. The module now tracks each class's last-known level itself
  and only treats it as a genuine change if the value actually differs.

## [0.2.8] - 2026-08-04

### Fixed
- Temporary diagnostic logging (added in 0.2.7) used `console.debug`, which Chromium browsers hide by
  default under the "Verbose" log level filter. Switched to `console.warn` so it's visible without
  changing console settings.

## [0.2.7] - 2026-08-04

### Added
- Temporary diagnostic logging for the sibling-reminder mislabeling bug under investigation (removed
  in 0.2.9 once root-caused).

## [0.2.6] - 2026-08-04

### Documentation
- Added guidance that the base class should always be leveled to advance effective level, and called
  out the gap where adding a secondary class late (after the base class is already ahead) doesn't
  trigger a catch-up reminder for it.
- Documented that the module is built and tested around exactly two classes - the ASI overlap check and
  the saves/skills/weapon/armor unlock only ever compare a class against the base class specifically,
  not against other secondary classes, so three or more classes isn't something to rely on.

## [0.2.5] - 2026-08-04

### Removed
- Skill choice capping (added in 0.2.2). It didn't hold up in testing, so it was removed rather than
  kept half-working. Gestalt actors now get skill choices from both classes' full lists, uncapped.

## [0.2.4] - 2026-08-04

### Documentation
- Clarified that gestalt replaces dnd5e's standard multiclassing rules for a character entirely - it
  isn't layered on top of them. Added to both the README and the in-sheet "Enable Gestalt" hint text.

## [0.2.3] - 2026-08-04

### Fixed
- HP: a secondary class only received the average value at its own level 1, instead of the max hit die
  every "starting" class should get in a gestalt build. dnd5e only grants max HP at level 1 to whichever
  class it considers the actor's single "original class"; every gestalt class now gets max HP at its own
  level 1 regardless, computed fresh each time so existing characters self-correct with no manual
  backfill needed.

## [0.2.2] - 2026-08-04

### Added
- Skill choice capping at the source: a secondary class's skill count was capped to only the amount
  beyond what the base class already provides, using the same technique as the weapon/armor unlock.
  (Removed in 0.2.5 - see above.)

## [0.2.1] - 2026-08-04

### Fixed
- The sibling-class reminder fired unconditionally on any class level change, listing every other class
  regardless of whether it needed attention - including when a newly-added class had just caught up to
  parity with the rest. Now only fires for classes strictly behind the one that just changed.

## [0.2.0] - 2026-08-04

### Changed
- Moved the gestalt toggle and base-class picker from a custom DOM-injected sheet panel (unreliable -
  guessed render hook names and CSS selectors, not always interactive) to dnd5e's native Special Traits
  tab, via `CONFIG.DND5E.characterFlags`. The base class picker was replaced entirely by reusing dnd5e's
  own "Original Class" field, which already has a working native dropdown in the same tab.

## [0.1.0] - 2026-08-04

### Added
- Initial gestalt mechanics: effective level and proficiency bonus overridden to the base class's own
  level instead of the sum of all classes; HP overridden to whichever single class currently grants the
  most, instead of summed; saving throw, skill, weapon, and armor proficiencies unlocked so every class's
  advancement applies instead of only whichever class dnd5e considers "original"; Ability Score
  Improvement overlap detection with a warning (never a block) when a secondary class's ASI doesn't
  exceed what the base class already provides.
- Module scaffold: manifest, GitHub Actions release workflow, base-class level override, per-actor
  gestalt toggle.
