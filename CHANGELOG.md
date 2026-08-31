# Changelog

All notable changes to this module are documented here. Versions follow the module's `module.json`
`version` field, which is what Foundry checks to detect an available update.

## [1.3.0] - 2026-08-30

### Added
- **Skill proficiency overview in advancement.** A Trait advancement step that chooses skills now
  lists all eighteen skills with what the character already has: one tick proficient, two expertise,
  a half-filled circle for the half proficiency Jack of All Trades gives. dnd5e's own picker lists
  only what is still legal to choose, so on a gestalt character taking two classes' worth of skills
  there was no way to see the overlap while deciding.

  A row you cannot pick is greyed with a tooltip saying why: already proficient, already expertise,
  expertise needs proficiency first, or not in this class's list. The gate is dnd5e's own - the
  system removes what the character has from its picker, and the greyed row reflects that rather
  than adding a second rule. Clicking a row drives that same picker, so every choice still goes
  through `TraitAdvancement#apply`.

  The list reads the advancement manager's clone, so picks made earlier in the same level-up appear
  immediately. Only gestalt-enabled characters get it.

## [1.2.3] - 2026-08-30

### Fixed
- A missing limit is now filled from dnd5e's own class compendium instead of leaving the count
  unbounded. 1.2.2 showed such a count without a denominator, but only when it was above zero, which
  left the worst case silent: a Sorcerer 3 imported by Plutonium, with no Cantrips Known advancement
  and no cantrips picked, still showed no cantrip line at all while being four short. The panel now
  reads the official class of the same identifier for any limit the class item does not publish, and
  marks the borrowed number with a dotted underline and a tooltip saying where it came from.
  Paladin and Ranger stay quiet: dnd5e's own Paladin has no cantrip limit either, so there is nothing
  to borrow and nothing counted.

## [1.2.2] - 2026-08-30

### Fixed
- A class that publishes no limit for a count no longer hides that count. The panel reads the cantrip
  and prepared limits from the class item's `cantrips-known` and `max-prepared` scale values, which is
  the only place dnd5e records them: the class spellcasting schema has just `preparation.formula`.
  Plutonium's class importer writes Max Prepared Spells but not Cantrips Known, so a Sorcerer imported
  that way lost its cantrip line entirely and looked like the module was not counting cantrips. Such a
  count now shows with no denominator (`cantrips 5`) and a tooltip naming the missing scale value.
  A class that publishes no limit because it has none - Paladin, Ranger - still shows nothing, since
  the count is only rendered when it is above zero.

## [1.2.1] - 2026-08-30

Documentation only. No code changed.

### Fixed
- 1.2.0 said Tidy 5e's **classic** sheet gets no panel. It does get one, and always did in 1.2.0: the
  selector added for the modern sheet covers classic as well, since both use the same
  `.tidy-tab.spellbook` container and `renderActorSheetV2` fires for both. The claim came from Tidy's
  documentation naming a separate hook for classic rather than from testing it. Verified on classic
  directly: panel on first render, counts matching the documents, theme followed, survives a tab
  round trip and a live spell change, no console errors.

## [1.2.0] - 2026-08-30

### Added
- The spell count panel now appears on **Tidy 5e Sheets'** modern sheet. Tidy's documented way to add
  content to it is the `renderActorSheetV2` hook, which this module already used, so this needed one
  extra selector rather than an API integration: Tidy names the tab `spellbook` where dnd5e names it
  `spells`. Tidy's classic sheet lays its spellbook out differently and still gets no panel.

### Changed
- The panel's background and border fall back to translucent values when dnd5e's card tokens are not
  available, which is the case on another module's sheet. It reads as a card over whatever theme that
  sheet uses instead of painting a dark slate box onto it. On dnd5e's own sheet the tokens resolve and
  the panel still matches the Spellcasting card exactly.

## [1.1.1] - 2026-08-30

Documentation only. No code changed; this exists so the packaged module carries the corrected README,
which was rewritten after 1.1.0 was built.

### Changed
- README trimmed from roughly 2960 words to 1700. The reasoning behind the design moved to
  `docs/design-notes.md`; every user-facing behaviour and caveat stayed.
- Corrected three points about the spell count panel that had drifted from what shipped: the prepared
  column counts spells actually prepared rather than every spell on the sheet, a class publishing
  neither count gets no row at all rather than no row for one count, and spells added through Browse
  are assigned to the class whose button was pressed rather than inferred.
- Documented that the panel needs a Spells tab it recognises, so it appears on dnd5e's own character
  sheet; a replacement sheet module laying that tab out differently gets no panel and is otherwise
  untouched.

## [1.1.0] - 2026-08-30

### Added
- **Spell count panel** on a gestalt character's Spells tab. Per spellcasting class, how many cantrips
  and prepared spells they should have against how many they do, with only a wrong number coloured.
  Targets are read from each class item's own progression rather than a table kept here, so a Wizard's
  25 prepared spells at level 20 and Paladin and Ranger having no cantrips are the class's numbers, not
  this module's. Built for the 2024 classes; a class that publishes no count shows no row for it.
- Spells granted by a subclass are excluded from the counts and reported as a total, since they are
  always prepared and do not count against the limit.
- A **Browse** button per class row, opening dnd5e's own compendium browser filtered to that class's
  spell list instead of every spell in the world. Spells added that way are assigned to the class you
  browsed, so they count straight away. That matters on a world with both spell compendia enabled,
  where every spell appears twice and only the 2024 copy is in the registered spell lists.
- A class picker for spells that sit on more than one of the character's class lists, which dnd5e
  leaves unattributed because it cannot know which class a Sorcerer/Wizard's Magic Missile belongs to.
  It writes the same Source Class field the spell's own Details tab edits. Spells on none of the
  character's class lists are named separately, since that usually means the wrong spell was added.

The prepared column counts spells actually prepared (`system.prepared === 1`), not every spell on
the sheet. Tidy 5e's own per-class counter reads the same way and the two agree.

The panel wears dnd5e's own `card` class and uses the sheet's colour and font tokens rather than its
own, so it matches the Spellcasting card beside it and follows the light and dark themes. Its body
has a bounded height and scrolls once the picker list grows.

It attaches to any ApplicationV2 actor sheet rather than only dnd5e's, so a replacement sheet module
gets it too where that sheet presents a Spells tab. Everything it needs is feature-detected and the
whole injection is wrapped: on a sheet laid out differently it logs and skips, leaving that sheet
exactly as its own module drew it.

## [1.0.3] - 2026-08-30

From a report that a class added second to a gestalt character only received the multiclassing
proficiencies, not its own.

### Fixed
- **Tool proficiencies were never unlocked for a secondary class.** The unlock worked from a list of
  trait types that covered saves, skills, weapons and armor but not tools. A secondary Bard got the
  multiclass one-instrument choice instead of its own three; a secondary Druid or Monk got nothing at
  all, since neither has a multiclass tool entry to fall back on. Affects Bard, Druid and Monk in both
  the 2014 and 2024 class compendia.
- **The multiclass proficiency entries kept applying on top of the unlocked full ones.** Harmless for
  weapons and armor, where the multiclass grant is a subset of the full list dnd5e then skips as already
  held, but skills and tools are *choices*: a secondary Bard, Rogue or Ranger was offered a spare skill
  pick that a single-classed character of that class never gets.

Both came from the same place, and the rule is now stated once instead of as a list of trait types: on
a gestalt actor every class is treated as the actor's original class. A secondary class is offered
exactly what a single-classed character of that class is offered, and never the multiclass version.
Verified across every ordered pair of classes in both compendia at levels 1, 2, 3, 4, 9 and 20 - 3168
checks - that a class's proficiency advancements as a gestalt secondary match its single-classed set
exactly, and that non-gestalt characters still get standard multiclassing.

Only proficiencies can be affected: dnd5e sets the original-class restriction on Trait advancements
alone, never on hit points, item grants, scale values, subclass choices or ASIs.

### Changed
- A secondary Bard, Rogue or Ranger no longer gets the extra skill choice the leftover multiclass entry
  was adding. Base Bard's 3 plus secondary Rogue's 4 is now 7, as the README has always described.

## [1.0.2] - 2026-08-29

Both issues in this release came from one bug report about a level 1 Wizard/Druid with **Double Spell
Slots** enabled: six 1st-level slots instead of four, and casting a spell *adding* slots rather than
spending them.

### Fixed
- **Spell slots were sized off the summed caster levels of both classes.** dnd5e's multiclass rule adds
  every spellcasting class's caster level together, so a gestalt Wizard 1 / Druid 1 was treated as a level
  2 caster (3 first-level slots, doubling to 6) and a Wizard 5 / Druid 5 as a level 10 caster, complete
  with 5th-level slots on a level 5 character. Caster level now uses the largest single class's
  contribution instead, matching how the module already handles character level and hit dice. The
  reported Wizard 1 / Druid 1 now gets 2 slots, or 4 with Double Spell Slots on.
- **Casting a spell added slots instead of spending them.** Doubling used to add the pre-doubling maximum
  to the *current* value as well as to the maximum, to preserve already-spent slots. But dnd5e writes
  spent slots back as an absolute number read off the derived data (casting stores `value - 1`; a long
  rest stores `max`), so that added amount was banked into the stored value and then added again on the
  next prepare, growing every time the character cast or rested - the extra purple pips on the sheet.
  Doubling now raises the maximum only.
- Slot values are clamped to the maximum for gestalt characters, which repairs any character already
  carrying an inflated stored value from the bug above. The sheet shows the correct number immediately;
  the corrected value is written back on the next cast or long rest. dnd5e clamps Pact Magic this way
  itself, but not leveled slots.

### Changed
- The caster level correction applies to any gestalt character, whether or not Double Spell Slots is
  ticked. If you have a gestalt caster who was getting the summed-level slot table, their slots will drop
  to the correct single-class-level table on update.

## [1.0.1] - 2026-08-08

### Fixed
- Hit dice on the character sheet summary showed the sum of every gestalt class's own hit dice (e.g. two
  level-5 classes reporting 10), instead of one hit die per character level. Hit dice now equal character
  level, using the larger of the two classes' hit die - the same "pick one class" approach already used
  for HP - and short/long rest spending/recovery draws from that class only.

## [1.0.0] - 2026-08-06

First full release. Verified working on both Foundry core v13 and v14, and on dnd5e 5.2.5 through
5.3.3 - a reported "doesn't work on 5.2.5" issue turned out to be the world's "Enable Gestalt Sheets"
setting simply not being checked, not an actual compatibility problem; the module's code needed no
changes at all to work correctly on the older dnd5e/core combination.

### Changed
- Compatibility declaration bumped: Foundry core `verified` raised from 13 to 14, reflecting direct
  testing on both.

## [0.4.2] - 2026-08-06

### Changed
- Display title renamed to "Gestalt D&D 5.5e" (module.json, the in-sheet Special Traits section header,
  and the README heading), to match the Foundry package listing submission.

## [0.4.1] - 2026-08-06

### Added
- `tools/release.mjs`: a small script that bumps `module.json`'s version, commits that alone, tags, and
  pushes - the four-step release dance this project had been doing by hand.

### Changed
- Every gestalt reminder/warning now also posts as a whispered chat message (to the acting player and
  all GMs), in addition to the usual toast, so there's a persistent record of what fired and why.

### Documentation
- Added a "Safety & reversibility" section to the README: every mechanical override is derived fresh
  each cycle (nothing cached or written, so toggling gestalt is always safe), but dnd5e's own
  advancement choices already granted through the unlocked prompts (skills, saves, feats) do not get
  undone just by disabling gestalt afterward.

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
