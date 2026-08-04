# Gestalt-Sheets-5.5

A [Foundry VTT](https://foundryvtt.com/) module for the [dnd5e](https://github.com/foundryvtt/dnd5e) system that adds support for **Gestalt** characters: play two classes at once and gain the features of both, without your effective level, proficiency bonus, or spell slots scaling as if the two classes' levels were added together.

For example, a Bard 5 / Paladin 5 gestalt character has the features of a level 5 Bard *and* a level 5 Paladin, but is treated as a level 5 character overall (proficiency bonus, spell slot progression, etc.) rather than a level 10 multiclass character.

**Gestalt replaces dnd5e's standard multiclassing rules for that character - it isn't layered on top of
them.** With Enable Gestalt checked, every class on the sheet is treated under gestalt rules (proficiency
bonus/tier/HP from the best class, full saves/skills/weapon/armor proficiencies from every class, ASI
overlap checking, etc.), not standard multiclass rules (summed effective level, one class's worth of
saves, diluted proficiencies). Don't expect a character to be "gestalt for two of its classes and normal
multiclass for a third" - if Enable Gestalt is on, none of that character's classes use standard
multiclassing math anymore.

## Installation

Requires the [libWrapper](https://foundryvtt.com/packages/lib-wrapper) module.

In Foundry's **Add-on Modules** tab, use this manifest URL:

```
https://github.com/Brianthas/Gestalt-Sheets-5.5/releases/latest/download/module.json
```

## Usage

1. As GM, enable **Enable Gestalt Sheets** in the module's world settings (off by default).
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

### Spellcasting

- **Pact Magic** (Warlock) is already tracked as a separate pool by the base system, so it's unaffected.
- Non-pact spell slots (leveled slots from full/half/third casters) currently still use dnd5e's normal
  multiclass rule of one shared pool sized off the *summed* caster levels. If you're running two
  non-pact spellcasting classes in the same gestalt build, use dnd5e's built-in **Configure Spell Slots**
  override (actor sheet → spellcasting config) to hand-set the pool to whatever your table intends.
  Automatic separate pools per class may come later.

### Level-up reminders

Whenever a gestalt actor's class levels change, the acting user gets a reminder listing any *other*
classes that are now behind the one that just leveled (so features don't get missed catching them up),
and a warning if a non-base class has leveled past the base class. Nothing fires if all classes are
already even with each other - e.g. bringing a newly-added second class up to parity with the first
doesn't trigger a reminder, since there's nothing left to catch up on at that point. These are
notifications only - nothing is blocked or auto-triggered.

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

Checking **Use Combined Class ASIs** (Special Traits tab, next to Enable Gestalt) turns this off entirely
for that actor - every class's ASIs apply normally, doubled up, with no warnings. This is a per-actor
setting, not a world setting, since it's about what a specific table wants for a specific character, and
it only has any effect when Enable Gestalt is also checked.

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

## Status

Early development.
