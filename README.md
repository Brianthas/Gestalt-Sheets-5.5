# Gestalt D&D 5.5e

A [Foundry VTT](https://foundryvtt.com/) module for the [dnd5e](https://github.com/foundryvtt/dnd5e) system that adds support for **Gestalt** characters: play two classes at once and gain the features of both, without your effective level, proficiency bonus, or spell slots scaling as if the two classes' levels were added together.

For example, a Bard 5 / Paladin 5 gestalt character has the features of a level 5 Bard *and* a level 5 Paladin, but is treated as a level 5 character overall (proficiency bonus, spell slot progression, etc.) rather than a level 10 multiclass character.

**Gestalt replaces dnd5e's standard multiclassing rules for that character - it isn't layered on top of
them.** With Enable Gestalt checked, every class on the sheet is treated under gestalt rules (proficiency
bonus/tier/HP from the best class, full saves/skills/weapon/armor proficiencies from every class, ASI
overlap checking, etc.), not standard multiclass rules (summed effective level, one class's worth of
saves, diluted proficiencies). Don't expect a character to be "gestalt for two of its classes and normal
multiclass for a third" - if Enable Gestalt is on, none of that character's classes use standard
multiclassing math anymore.

**Built and tested around exactly two classes.** Everything here assumes a base class plus one secondary
class. Adding a third (or more) is likely to get buggy - the ASI overlap check and the saves/skills/
weapon/armor unlock only ever compare a class against the *base* class specifically, not against other
secondary classes, so with three or more classes the module has no way to notice that two secondaries
are stepping on each other (e.g. two secondary classes both granting overlapping "bonus" ASIs, or saving
throw proficiencies unioning across three classes' worth of grants instead of two). Two classes is the
supported shape; more than that isn't something to rely on.

## Installation

Requires the [libWrapper](https://foundryvtt.com/packages/lib-wrapper) module.

In Foundry's **Add-on Modules** tab, use this manifest URL:

```
https://github.com/Brianthas/Gestalt-Sheets-5.5/releases/latest/download/module.json
```

## Usage

1. As GM, enable **Enable Gestalt Sheets** in the module's world settings (off by default). **Use Combined
   Class ASIs** lives in the same world settings if you want to turn off ASI overlap checking table-wide
   (see Ability Score Improvements below).
2. Add each of your classes to the character as normal (dnd5e multiclassing).
3. Open the character sheet's **Special Traits** tab (the star icon in the sidebar). Check **Enable
   Gestalt**, and set **Original Class** (dnd5e's own field, at the top of that same tab) to whichever
   class should be the gestalt base class.

Everything the module adds lives in that Special Traits tab, as native dnd5e form fields - not a custom
panel - so it behaves and looks exactly like every other checkbox/dropdown on the sheet.

The base class ("Original Class")'s own level becomes the character's effective level for proficiency
bonus, tier, and anything else that normally scales off total character level. Every other class still
grants its own features at its own level as usual, uncapped by the base class. dnd5e auto-sets Original
Class to whichever class you add first, so a new gestalt character has a sensible default with no setup
needed - change it any time from that same dropdown.

**Always level the base class when you want the character's effective level to advance.** Proficiency
bonus, tier, HP-per-level bonus, cantrip scaling, and XP-to-next-level are all pinned to the base class's
own level specifically - leveling only the secondary class does nothing for any of those, even though it
still grants that class's own features normally. The secondary class can lag behind or catch up at
whatever pace the table wants; the module reminds you (see Level-up reminders below) when it falls
behind, and warns if it gets ahead of the base class.

One gap worth knowing about: that reminder only fires when a class **levels up**, and only lists *other*
classes that are behind the one that just changed - it doesn't check whether the class that just changed
is itself behind. So if you level the base class to 3 first and *then* add the secondary class at level
1, no reminder fires at that point telling you the new class is now 2 levels behind - it'll stay quiet
until the base class levels again. Worth manually leveling a late-added secondary class up to match if
you want it caught up right away, rather than waiting on a reminder that won't come until later.

### Hit Points

dnd5e's default HP calculation sums every class's own hit die progression (normal 5e multiclassing:
Fighter's d10s + Sorcerer's d6s, stacked). Gestalt HP instead uses whichever single class is currently
granting the most HP - not necessarily the base class. A Sorcerer(base)/Fighter(secondary) gestalt
uses Fighter's (better) HP total once Fighter has enough levels to grant more than Sorcerer would; it's
never both added together, and never mixes per-level.

**Level 1 quirk**: dnd5e only grants max hit die at level 1 to whichever class is the actor's single
"original class" (auto-assigned to whichever class was added first) - a second class's own level 1 only
gets the average value, same as any later multiclass level. Since gestalt classes are all meant to be
"starting" classes, not later pickups, this is corrected too: every class's level 1 counts as max hit
die for gestalt HP purposes, regardless of which one dnd5e considers original. This is computed fresh
each time rather than depending on what got stored when a level was originally taken, so it self-corrects
existing characters automatically - no manual backfill needed, unlike the proficiency unlock below.

Not affected: manually-overridden HP max (if you've set a fixed max on the sheet, that's left alone),
and characters under a "half health" effect (skipped, since that effect scales the summed total in a
way that can't be cleanly un-summed - a known minor limitation).

### Hit Dice

Same doubling problem as HP: dnd5e sums every class's own hit dice (each class's own level's worth), so
a two-class gestalt build shows twice its character level in hit dice. Gestalt hit dice instead equal
your character level, using the larger of your two classes' hit die - the classic gestalt house rule.
Spending or recovering hit dice (short/long rest) draws from that larger-die class only; the other
class's hit dice sit unused, same as the tabletop rule intends.

### Spellcasting

- **Pact Magic** (Warlock) is already tracked as a separate pool by the base system, so it's unaffected.
- Non-pact spell slots (leveled slots from full/half/third casters) still use dnd5e's normal multiclass
  rule of one shared pool sized off the *summed* caster levels - true separate pools per class would need
  registering whole new spellcasting types with dnd5e, not a small patch, so that hasn't been built.
- As a much simpler stand-in, checking **Double Spell Slots** (Special Traits tab, next to Enable Gestalt)
  doubles the final leveled slot count at every spell level, on top of whatever dnd5e's normal multiclass
  math already computed. It's a rough approximation of "casting as two characters," not a mechanically
  precise per-class pool - if you're running two non-pact spellcasting classes and want more exact
  control, dnd5e's built-in **Configure Spell Slots** override (actor sheet → spellcasting config) can
  hand-set any level's pool to whatever your table intends instead. Doubling respects any level you've
  manually overridden that way (an overridden level is left exactly as set, not doubled), and preserves
  already-spent slots rather than topping them back up (it adds the pre-doubling max to the remaining
  value, not to the max alone).

### Level-up reminders

Whenever a gestalt actor's class levels change, the acting user gets a reminder listing any *other*
classes that are now behind the one that just leveled (so features don't get missed catching them up),
and a warning if a non-base class has leveled past the base class. Nothing fires if all classes are
already even with each other - e.g. bringing a newly-added second class up to parity with the first
doesn't trigger a reminder, since there's nothing left to catch up on at that point. These are
notifications only - nothing is blocked or auto-triggered.

Every gestalt reminder/warning (this one, the base-class-exceeded warning, and the ASI overlap warning
below) is shown both as the usual toast popup *and* as a whispered chat message to the acting player and
every GM, so there's a scrollable, permanent record of exactly what fired and why - useful for figuring
out later whether something was expected behavior or worth reporting, without having to catch and
remember a toast that's already gone by the time anyone looks.

Detecting a "real" level change is deliberately stricter than just checking whether `system.levels` was
part of an update: dnd5e's Advancement Manager finalizes a leveling operation by committing a full cloned
copy of the actor via a bulk `updateEmbeddedDocuments` call, which can include an unrelated sibling
class's `system.levels` in that payload even when its value never actually changed - confirmed via
diagnostic logging, where leveling a newly-added class produced an update event whose "changed" item was
actually a completely different, unchanged class. Left unhandled, this could misfire a reminder naming
the wrong class. The module tracks each class's last-known level itself and only treats it as a genuine
change if the value actually differs, rather than trusting that a field showing up in an update means
it changed.

### Ability Score Improvements

dnd5e grants ASI/feat choices per class, at that class's own levels (e.g. Fighter gets extra ones at 6
and 14 that most classes don't). Left alone, a gestalt character levels every class independently and
ends up with *every* class's ASIs - more than a single-classed character of the same effective level
would ever get. Reliably blocking the extra prompts outright would mean hooking one of dnd5e's least
stable internal APIs, so instead:

Whenever a **non-base** class levels up, if it just reached one of its own ASI/feat levels, the module
compares how many ASI slots that class has now earned (at its own level) against how many the **base**
class has already earned (at its own level). If the secondary class's count doesn't exceed the base
class's, that ASI is redundant with one the base class already provides, and you get a warning - e.g.
Sorcerer(base)/Fighter(secondary) both reaching their level-4 ASI (1 vs 1) warns. If it exceeds the base
class's count, it's a genuine bonus slot most classes don't get, and nothing fires - e.g. Fighter then
continuing on to its level-6 ASI (2, beating Sorcerer's 1) is silent. This is a heads-up only, shown
before you even open the ASI/feat picker for it - nothing is blocked, and nothing is auto-deleted.

Enabling **Use Combined Class ASIs** in the world settings turns this off entirely, for every gestalt
actor - every class's ASIs apply normally, doubled up, with no warnings. This is a world setting rather
than a per-actor one: whether ASI overlap gets checked at all is a table-wide house rule call for the GM
to make, not something that should vary character to character within the same game.

### Saving Throws, Skill, Weapon & Armor Proficiencies

Unlike ASIs, dnd5e normally *restricts* these rather than doubling them up: saving throw proficiencies,
most classes' skill choices, and the *full* weapon/armor proficiency list only come from the actor's
"original class" (`system.details.originalClass` - the same **Original Class** field used above as the
gestalt base class). A second class contributes nothing to saves, usually nothing to skills, and only a
reduced weapon/armor list. That's correct for normal 5e multiclassing, but wrong for gestalt, where the
intent is: compare what each class would grant, and end up with the better one whenever they overlap.

For gestalt actors, all of these are unlocked so every class's proficiency-granting advancement applies,
not just the original class's:

- **Saves**: each class grants its own 2 saving throw proficiencies, unioned together - e.g. Fighter
  (base, Strength/Constitution) + Sorcerer (secondary, Constitution/Charisma) ends up proficient in
  Strength, Constitution, *and* Charisma.
- **Weapon & armor**: each class grants its own full list (not the reduced multiclass one), unioned
  together - e.g. Sorcerer (base, minimal - simple weapons only) + Fighter (secondary) ends up with
  Fighter's full simple/martial weapons and light/medium/heavy armor and shields, not just Fighter's
  reduced secondary-class grant.
- **Skills**: **you get skill choices from both classes' full lists, uncapped** - e.g. base Bard's 3 and
  secondary Rogue's 4 both apply, for 7 total, not "the better one" or "the base plus the difference."
  An earlier version tried to cap a secondary class's skill count to only the amount beyond what the
  base class provides, using the same source-level technique as weapon/armor, but it didn't hold up in
  testing and was removed rather than kept half-working. If you want gestalt skills capped to a single
  class's worth, that's currently a manual "just don't pick more than N" table rule, not something the
  module enforces.

None of this needs a "which is higher" comparison for saves/weapons/armor: they're just sets of discrete
proficiencies (light armor, martial weapons, etc.), so granting each class's full list and letting dnd5e's
own advancement logic skip anything already held naturally produces "the union," which is the same thing
as "whichever class's grant is better" whenever one grant is a superset of the other (the normal case).

**Note for existing characters**: this only affects advancement steps as they're offered going forward.
If a secondary class already leveled past 1 *before* gestalt was turned on, its saves/skills step was
never shown and won't automatically retroactively appear - open that class item's Advancement tab and
configure the entry by hand (or remove and re-add the class) to backfill it.

### Safety & reversibility

Every mechanical override above (effective level, proficiency bonus, HP, spell slot doubling) is
computed fresh from your actual source data on every single data-prep cycle - none of it is cached or
written anywhere. The module's flags (Enable Gestalt, Double Spell Slots) and dnd5e's own Original Class
field are the only state it touches directly. That means toggling Enable Gestalt on or off is always
safe: nothing the module itself does can leave a character's numbers stuck in a broken or inconsistent
state, because everything just recomputes from scratch the moment you flip the checkbox.

**What toggling gestalt off does *not* undo**, though, is whatever dnd5e's own advancement flow already
granted while it was on - actual skill proficiencies picked, saves set, feats taken through the unlocked
prompts. Those are real, persisted choices made through dnd5e's normal UI, not something this module
tracks or can cleanly revert. Turning gestalt off on a character that already benefited from the
proficiency unlock will leave it holding proficiencies that don't cleanly match either ruleset anymore
unless someone manually reviews and trims them. Treat enabling gestalt on a given character as mostly a
one-way decision, not something to freely experiment with back and forth on a real character.

## Status

1.0 release. Actively tested in a live game. Verified working on Foundry core v13 and v14, and on dnd5e
5.2.5 through 5.3.3. See [CHANGELOG.md](CHANGELOG.md) for a version-by-version history of what changed.
