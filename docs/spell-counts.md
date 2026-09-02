# Spell counts

Engineering record for the spell count panel in `scripts/gestalt.mjs`. Everything below was checked
against Foundry 14.365 / dnd5e 5.3.3 with the `dnd5e.classes24` and `dnd5e.spells24` compendia.

## What the feature answers

Whether a gestalt character has the right number of spells. The target is per class, each class
counts at its own level rather than a summed multiclass level, and subclass-granted spells sit in the
same list without counting against any limit. None of that is visible on the sheet.

Scope is the 2024 ruleset. That is what the module is for, and it means every target is readable from
the class item instead of being asserted here.

## Where the targets come from

Each 2024 caster publishes its counts as ScaleValue advancements, read as
`classItem.scaleValues[identifier].value` in `spellTargetsForClass`:

```
             max-prepared (lv 1/5/11/20)   cantrips-known (lv 1/5/11/20)
Bard         4 / 9 / 16 / 22               2 / 3 / 4 / 4
Cleric       4 / 9 / 16 / 22               3 / 4 / 5 / 5
Druid        4 / 9 / 16 / 22               2 / 3 / 4 / 4
Sorcerer     2 / 9 / 16 / 22               4 / 5 / 6 / 6
Wizard       4 / 9 / 16 / 25               3 / 4 / 5 / 5
Warlock      2 / 6 / 11 / 15               2 / 3 / 4 / 4     ("Max Pact Magic Spells")
Paladin      2 / 6 / 10 / 15               -
Ranger       2 / 6 / 10 / 15               -
```

Wizard reaches 25 prepared at level 20 where every other full caster stops at 22, and Paladin and
Ranger have no cantrip entry at all. Both are reasons the numbers are read rather than tabulated
here.

The ScaleValue advancement is the only place a class records these numbers. dnd5e's class
spellcasting schema (`dnd5e.mjs:10695`) holds `progression`, `ability` and `preparation.formula` and
nothing else, so there is no second field to fall back on when the advancement is absent. The
advancement's key is `configuration.identifier` or, when that is blank as it is in the official
compendium classes, the slugified title, so "Cantrips Known" keys as `cantrips-known` either way.

A class item does not have to carry these advancements. A third-party importer may write Max Prepared
Spells but not Cantrips Known, so a Sorcerer imported that way publishes no cantrip limit. Any limit
the class item does not publish is read from the official class of the same `system.identifier` in
`dnd5e.classes24`, at that class's level, and marked in the panel as borrowed.

`loadOfficialClassTargets` fetches those twelve classes once at `ready` and caches the ScaleValue
advancements themselves, so the level lookup is `advancement.valueForLevel(level)` rather than a scale
walk written here. The index cannot serve this - advancements are not index fields - and the fetch is
asynchronous, so the `ready` hook re-renders any open sheet once the cache is filled.

Where neither the class item nor the official class publishes a limit, the count shows with no
denominator, and only when it is above zero. That is the homebrew case. It is also what keeps Paladin
and Ranger quiet: dnd5e's own Paladin has no cantrip limit to borrow, and a Paladin has no cantrips to
count.

1.2.2 got this wrong by applying the above-zero condition to every missing limit, including ones that
could have been borrowed. An imported Sorcerer 3 with no cantrips chosen then showed no cantrip line
while being four short - the same symptom the panel exists to catch.

The 2024 Wizard exposes no spellbook size, so the panel has no spellbook row.

## Excluding granted spells

`system.preparation` does not exist in dnd5e 5.3.3. Spells carry `system.method` and
`system.prepared`, a number whose states are in `CONFIG.DND5E.spellPreparationStates`: 0 unprepared,
1 prepared, 2 always prepared.

`SpellConfigurationData#applySpellChanges` (dnd5e.mjs:41443) stamps `prepared` from the granting
advancement, and only when that grant sets a method:

```js
if ( this.method ) {
  setProperty(itemData, "system.method", this.method);
  setProperty(itemData, "system.prepared", this.prepared);
}
```

Applying the real grants on level 5 actors produced:

```
Sorcerer 5 / Draconic Sorcery   6 spells, prepared=2, sourceItem="subclass:draconic", method=spell
Warlock 5 / Fiend Patron        6 spells, prepared=2, sourceItem="subclass:fiend",    method=pact
```

**Cantrips ship from the compendium already at `prepared = 2`** - Fire Bolt, Druidcraft and Guidance
all do, with no actor involved. So `isGrantedSpell` tests `level > 0 && prepared === 2`. Dropping the
level check reports zero cantrips known on every character.

The 2014 subclasses grant no spells at all; Draconic Bloodline and The Fiend both produced zero at
level 5. The exclusion only does anything on 2024 content.

## What the prepared column counts

Spells with `system.prepared === 1`, attributed to that class. Not every spell the character holds:
a spell sitting on the sheet unprepared is one they know, not one they have prepared, and counting
those overstates the number the column is named for. Tidy 5e's own per-class counter reads the same
way, and the two agree on every case checked.

Cantrips are counted separately by `level === 0` with no prepared filter, since they ship at
`prepared = 2`.

A fixture where every spell is prepared cannot tell this implementation from one that counts spells
known - the two give the same answer. Mix prepared and unprepared spells or the test proves nothing.

## Attributing a spell to a class

`SpellData#_preCreate` (dnd5e.mjs:22621) sets `system.sourceItem` to `"<type>:<identifier>"` when a
spell is created, in four steps: skip at-will/innate or an already-set value; match an alt method
such as pact to the one class using it; use the only spellcasting class if there is one; otherwise
intersect the actor's casting classes with the classes whose spell list contains the spell, through
`dnd5e.registry.spellLists.forSpell(compendiumSource)`.

The fourth step carries gestalt. Dropping seven spells on a Wizard 5 / Druid 5:

```
Magic Missile  class:wizard      Entangle     class:druid
Shield         class:wizard      Cure Wounds  class:druid
Fire Bolt      class:wizard      Druidcraft   class:druid
Fireball       class:wizard
```

`spellSourceClass` reads that field and resolves a `subclass:` value through the subclass item's
`classIdentifier`, so a Draconic Sorcery grant counts as Sorcerer. `SpellData#sourceClass` does the
same job but is deprecated in 5.3 (dnd5e.mjs:22042) and logs a compatibility warning on every read.

`sourceItem` stays blank in three cases, and the panel separates them:

- The spell is on more than one of the character's class lists. For an overlapping pair such as
  Sorcerer/Wizard this is most of them, so these get a class picker writing `system.sourceItem` - the
  same field the spell's Details tab edits (`templates/items/details/details-spell.hbs:66`).
- The spell is on none of the character's lists. Named separately, since it usually means the wrong
  spell was added.
- The spell has no `_stats.compendiumSource` - hand-made, or copied from another actor - so step four
  has nothing to look up.

## Browse buttons

The class spell lists are registered and complete: Bard 129, Cleric 109, Druid 124, Paladin 38,
Ranger 48, Sorcerer 141, Warlock 72, Wizard 219, plus eight subclass lists. dnd5e registers a
`spelllist` filter on the browser's spells tab (dnd5e.mjs:21977) but the player has to know to set
it, against 659 spells unfiltered.

`browseClassSpells` calls `dnd5e.applications.CompendiumBrowser.select()` with that filter locked.
The browser is the system's; the only addition is the filter.

Three things that each fail silently if missed:

- **`selection: { min: 1 }` is required.** dnd5e gates selection mode on
  `!!options.selection.min || !!options.selection.max` (dnd5e.mjs:32759) and both default to null.
  Without it the browser opens read-only, nothing can be ticked, and `select()` resolves null.
- **`select()` resolves a `Set`, or null.** A Set has no `length` and no `map`, so guarding on
  `results?.length` discards every selection without erroring.
- **The class is written explicitly on creation**, `system.sourceItem = spellList`, rather than left
  to dnd5e's inference. The player pressed the button for that class, so the class is already known.
  Inference would fail here anyway: the filter matches on `system.identifier`, which both spell
  compendia share, so every spell appears once per pack (119 from `dnd5e.spells`, 124 from
  `dnd5e.spells24` for Druid) and only the 2024 copies are in the registered spell lists. Picking the
  2014 copy of Aid leaves `spellLists.forSpell()` with nothing to find.

`toObject()` also drops `_stats.compendiumSource`; it is restored so the spell stays linked to where
it came from, as a drag-drop would.

`filters.locked.additional` is keyed by filter name, not a list of raw filter descriptors - the
browser reads `filters.locked.additional[key]` per registered filter (dnd5e.mjs:33040). The payload
is `{ spelllist: { "class:wizard": 1 } }`, where 1 includes and -1 excludes. Passing an array of
`{k, o, v}` descriptors produces a button that opens an unfiltered browser.

## Rendering

Hooked on `renderActorSheetV2`, not dnd5e's `renderCharacterActorSheet`. Foundry fires a render hook
for every class in the sheet's prototype chain, and `ActorSheetV2` is the broadest one that still
means "an actor sheet", so a replacement sheet module built on ApplicationV2 gets the panel too. The
handler receives `(sheet, HTMLElement, context, options)`, or jQuery as the second argument from a
legacy sheet, which it normalises.

Nothing about dnd5e's markup is assumed. The actor type, the gestalt flag and the
`[data-tab="spells"]` anchor are each feature-detected, and the whole body is wrapped in a
`try`/`catch` that logs and returns. A module adding a panel to someone else's sheet must never be
the reason that sheet fails to render, so an unfamiliar layout means no panel rather than a broken
tab. The stale-panel removal runs before any of those checks, so a later bail-out cannot strand one.

The panel is prepended to `[data-tab="spells"]`. **ApplicationV2 re-renders in place and does not
clean up after a module**, so `renderSpellCountPanel` removes any existing `.gestalt-spell-counts`
before appending. Without that it accumulates one copy per render.

The body has `max-height` and `overflow-y: auto` with `min-height: 0`, since a character with several
casting classes and a long picker list would otherwise push the rest of the tab out of reach.

Values are inserted as text nodes rather than interpolated into a markup string, so a spell named with
angle brackets cannot inject into the sheet.

## Styling

The panel carries dnd5e's own `card` class and puts its title in `div.header > h3`, which is the
structure the Spellcasting card in the same tab uses. dnd5e colours that wrapper and lets the heading
inherit - no CSS rule sets a colour on the card's `h3` at all - so matching the structure is what
makes the title the right colour, in whichever theme is active, without this module naming one.

Every remaining value in `styles/gestalt.css` is a sheet token rather than a literal:
`--dnd5e-background-card`, `--dnd5e-border-gold`, `--dnd5e-border-dotted`, `--color-text-primary`,
`--color-text-secondary`, `--color-level-error`, and the Roboto Slab / Roboto Condensed families.
Using `--dnd5e-color-card` here is the mistake to avoid: it is the light parchment colour, and it
renders the panel as a white slab on a dark sheet.

Buttons match `--dnd5e-background-25` rather than a default Foundry button, which draws as a heavy
black rectangle against the card.

## Testing notes

A test that builds spell items from `toObject()` alone will show every spell unassigned and prove
nothing: `toObject()` drops `_stats.compendiumSource`, which is what dnd5e's attribution looks the
spell up by. Set it to the spell's UUID to reproduce a drag-drop.

`ItemGrantAdvancement#apply(level, {}, { initial: true })` selects every non-optional grant itself,
the way an automatic Advancement Manager step does, and writes through `updateSource` - so the
results are in `actor._source.items` until persisted.

Both spell packs are enabled in a default world, so a class filter returns each spell twice (Wizard's
219 identifiers fetch 426 rows). That is pre-existing and visible in dnd5e's own browser.

## Tidy 5e Sheet

Checked against tidy5e-sheet 13.9.3.

The panel works on Tidy's modern (Quadrone) sheet. Tidy's own documentation gives `renderActorSheetV2`
as the way to add content to it, which is the hook this module already uses, so support needed one
extra selector rather than an API integration: Tidy names the tab `spellbook` and its container
`.tidy-tab.spellbook`, where dnd5e uses `[data-tab="spells"]`.

**Tab content is not lazily rendered.** `.tidy-tab.spellbook` is in the DOM from the first render with
its children present; an inactive tab merely has zero height. An earlier reading of this as lazy came
from measuring an inactive tab, the same trap as measuring dnd5e's Spells tab before activating it.
The container also survives switching tabs away and back, so no tab-change hook is needed - though
Tidy does provide one, `tidy5e-sheet.selectTab(app, element, newTabId)`, if that ever changes.

**Tidy's classic sheet works too, on the same selector.** Its documentation names
`tidy5e-sheet.renderActorSheet` as the hook for classic, which led to an initial assumption that it
needed separate handling. It does not: `renderActorSheetV2` fires for the classic sheet as well, and
classic uses the same `.tidy-tab.spellbook` container as modern, so one selector covers all three
sheets. Checked directly rather than inferred from the documentation.

Tidy classic's spellbook tab carries about 4px of horizontal overflow of its own, from its
`.utility-toolbar` and `.tab-footer`. Measured with the panel present and with gestalt turned off, the
figure is identical (1163 client against 1167 scroll either way), so the panel contributes none of it.
A test asserting the tab has no horizontal overflow will fail on classic for that reason; assert that
the panel does not *increase* it.

### Theming across sheets

dnd5e's `--dnd5e-background-card` and `--dnd5e-border-gold` are scoped to its own sheet and do not
resolve on Tidy, so the CSS fallback is what renders there. Those fallbacks are **translucent**
(`rgba(0, 0, 0, 0.25)` and a faint white border) rather than the opaque slate they used to be: an
opaque colour paints a dark card onto whatever theme the other sheet uses, where darkening what is
behind it reads as a card on any of them. Verified against a maroon Tidy theme (`rgb(116, 27, 43)`).

Text and font tokens - `--color-text-primary`, `--color-text-secondary`, `--color-level-error`, the
Roboto families - are not sheet-scoped and resolve on both, so the panel's text follows whichever
theme is active. On dnd5e's own sheet the card tokens still resolve and the panel matches the
Spellcasting card exactly.

Tidy shows its own per-class prepared counter, and it is correct for gestalt: it reads each class at
its own level and excludes always-prepared subclass grants. On a Sorcerer 9 / Cleric 9 with Draconic
Sorcery and Life Domain, 20 granted spells and one prepared spell per class, both Tidy and this panel
read 1/14. Tidy Quadrone shows one counter per casting class; Tidy Classic shows a single one.

So there is nothing to correct in Tidy. What Tidy has no equivalent for is the cantrip count, the
class picker for spells on two class lists, the uncastable warning, the granted total, and the
browse-by-class buttons. Supporting Tidy properly means using its API rather than DOM injection,
because Quadrone renders tab content lazily - `.tidy-tab.spellbook` does not exist until the tab is
opened, which is after the render hook has run.

## Filling in missing spell sources

dnd5e builds the spell row's subtitle at `dnd5e.mjs:56640`:

```js
ctx.subtitle = [sourceLabel, item.labels.components.vsm].filterJoin(" • ");
```

`sourceLabel` comes from `system.sourceItem` resolved through `actor.identifiedItems`, or failing that
from the `dnd5e.advancementOrigin` flag. Both dnd5e's own sheet and Tidy's render it, so nothing needs
adding to display it - measured on `CharacterActorSheet`, which printed `Sorcerer • V, S, M` for a
spell holding `class:sorcerer`.

A spell with neither field prints its components alone. Every always-prepared spell on the imported
gestalt characters here was in that state, while the same Draconic Sorcery grants applied through
dnd5e's own advancement carried `sourceItem: "subclass:draconic"` and an `advancementOrigin`.

### The rule the button applies

It re-runs `SpellData#_preCreate` (`dnd5e.mjs:22631`) with two additions.

**Identifying the spell.** dnd5e looks the spell up by `_stats.compendiumSource`. Imported spells have
none, so the name is used as a fallback key into `dnd5e.spells24` and `dnd5e.spells`, and the resulting
UUID goes to the same `dnd5e.registry.spellLists.forSpell` registry.

**Finding the class through the subclass, for an always-prepared spell.** The class lists alone get
grants wrong: Command is on the bard, cleric and paladin lists as well as draconic, so a
Bard/Sorcerer's Draconic Sorcery grant would be credited to the Bard. `forSpell` returns
`metadata.type` of `class` or `subclass`, so the two are separated and a `prepared === 2` spell is
resolved by its subclass match.

The subclass identifies the class; it is not what gets written. The spell traces back to the class
that granted the subclass, so `subclassItem.system.classIdentifier` is used and the field holds
`class:sorcerer`, making the sheet read "Sorcerer" rather than "Draconic Sorcery". dnd5e's own
advancement writes `subclass:draconic` here instead - this deliberately differs, because the class is
the useful answer on a gestalt character deciding which of two classes a spell belongs to.

Matching a subclass list to the actor's subclass item cannot rely on the identifier alone. The
registered list is `draconic`, while the imported subclass item identifies itself `draconic-sorcery`.
The list's `name` is "Draconic Sorcery", which equals the item's name, so identifier or name matching
resolves it either way.

Anything with more than one candidate is skipped and named. A wrong attribution is worse than none,
and it is not visible afterwards without reading the field.

### Checked

On a copy of the imported Bard/Sorcerer, driving the real button, all four unattributed spells were
written `class:sorcerer` - Command included, which is the one the class lists alone would have called
Bard - and the base sheet then rendered:

```
Chromatic Orb    Sorcerer • V, S, M
Command          Sorcerer • V
Alter Self       Sorcerer • V, S
Dragon's Breath  Sorcerer • V, S, M
```

Tidy's sheet reads the same field. The QA actor's Animal Friendship, on no list its classes use, was
left alone with a notification rather than guessed at.

The spell count panel is unaffected: `isGrantedSpell` keys on `level > 0 && prepared === 2` and never
reads `sourceItem`, and the panel still reported "4 always-prepared spell(s) granted by a subclass,
not counted" after the write.

The button is gated on `isGestaltActor` and ownership. It deliberately ignores the sheet's play/edit
lock that greys the checkboxes beside it: that lock guards against a stray click changing a stat, and
this is a button that states what it will do and asks first.
