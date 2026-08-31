# Design notes

Why the module does things the way it does. The README covers what it does; this covers the reasoning
that used to sit inside it, kept for whoever maintains the code. See also
[spell-counts.md](spell-counts.md) for the spell count panel specifically.

## Character level, and what has to be recomputed with it

`applyGestaltLevel` runs after dnd5e's `prepareBaseData` and overwrites `details.level` with the base
class's own level. Anything dnd5e derives *later* in the prepare cycle picks the corrected value up on
its own, which is why one override point covers tier, HP per level and cantrip scaling.

Anything dnd5e computes **inside** `prepareBaseData`, after it sums the class levels, is already stale
when this runs and has to be recomputed by hand. There are two, both at `dnd5e.mjs:72064-72081`:

- `attributes.prof`
- `details.xp` - `max`, `min`, `pct`, and `boonsEarned` in the epic boon case

The XP one was missed until a bug report in August 2026: a Bard 2 / Rogue 2 character was asked for
6500 XP, the level 4 threshold, instead of 900. The level and proficiency bonus on the same sheet were
already correct, which is what made it look like a display bug rather than a stale derivation.

If a future dnd5e version derives anything else from `details.level` within `prepareBaseData`, it will
need adding here. Reading that function top to bottom is the check, not grepping for `details.level`,
because the stale values are the ones computed from it rather than the ones that mention it.

## Hit points

The level 1 correction is computed fresh on every data-prep cycle rather than read from what was
stored when the level was taken, so existing characters self-correct with no backfill. That is not
true of the proficiency unlock, which only changes advancement steps as they are offered.

Characters under a half-health effect are skipped: that effect scales the summed total, and the sum
cannot be cleanly un-summed afterwards.

## Spell slots

Non-pact slots stay one shared pool rather than a pool per class. Separate pools would mean
registering whole new spellcasting types with dnd5e, which is not a small patch. Double Spell Slots
is the stand-in, and dnd5e's own Configure Spell Slots override is the exact-control escape hatch.

Doubling raises the maximum only. dnd5e writes spent slots back as an absolute number read off the
derived data, so anything added to the derived value is banked into stored data and added again on
the next prepare. That is what made casting appear to add slots in 1.0.1.

## Level-up reminders

Detecting a real level change is stricter than checking whether `system.levels` appeared in an update.
dnd5e's Advancement Manager finalises a level by committing a full cloned copy of the actor through a
bulk `updateEmbeddedDocuments` call, which can carry an unrelated sibling class's `system.levels` even
when its value never changed. Confirmed by diagnostic logging: levelling a newly added class produced
an update whose changed item was a different, unchanged class. The module keeps each class's
last-known level and treats it as a change only when the value actually differs.

## Ability score improvements

Blocking the redundant ASI prompts outright would mean hooking one of dnd5e's least stable internal
APIs, so the module warns instead. The comparison is between how many ASI slots the secondary class
has earned at its own level and how many the base class has earned at its own level: not exceeding it
means the ASI is redundant, exceeding it means a genuine bonus slot that most classes do not get.

## Proficiencies

dnd5e marks the full single-class grant `classRestriction: "primary"` and the reduced multiclass grant
`"secondary"`. On a gestalt actor every class is treated as the original class, which returns exactly
what dnd5e already computes for the base class. This replaced an allowlist of trait keys that missed
`tool` and left the multiclass entries applying on top of the full ones.

Two facts checked across 730 advancements in the shipped compendia make that safe: `classRestriction`
appears on Trait advancements only, never on hit points, item grants, scale values, subclass choices
or ASIs; and all 18 `secondary` entries have a primary or unrestricted entry for the same trait key on
the same class, so suppressing them removes nothing that is not already granted.

Saves, weapons and armor need no "which is higher" comparison. They are sets of discrete
proficiencies, so granting each class's full list and letting dnd5e skip anything already held
produces the union, which is the same as the better grant whenever one is a superset of the other.

Skills stay uncapped deliberately. An earlier version capped a secondary class's skill count to the
amount beyond what the base class provides, using the same source-level technique as weapons and
armor. It did not hold up in testing and was removed rather than kept half-working.

## Three or more classes

The ASI overlap check only ever compares a class against the base class, never against other
secondary classes, so with three or more it cannot notice two secondaries stepping on each other.
Proficiencies scale to any number of classes, since each is simply treated as the original class, but
a third class's saves and skills union on top of the other two. Two classes is the supported shape.
