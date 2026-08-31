# Gestalt D&D 5.5e

A [Foundry VTT](https://foundryvtt.com/) module for the [dnd5e](https://github.com/foundryvtt/dnd5e)
system that adds **Gestalt** characters: play two classes at once and gain the features of both,
without your effective level, proficiency bonus, or spell slots scaling as if the two classes' levels
were added together.

A Bard 5 / Paladin 5 gestalt character has the features of a level 5 Bard *and* a level 5 Paladin, but
counts as a level 5 character overall, not a level 10 multiclass one.

**Gestalt replaces dnd5e's multiclassing rules for that character, it does not layer on top of them.**
With Enable Gestalt checked, every class on the sheet uses gestalt rules. A character cannot be gestalt
for two of its classes and normal multiclass for a third.

**Built and tested around exactly two classes.** A third or more is not something to rely on: the ASI
overlap check only compares each class against the base class, so it cannot see two secondary classes
stepping on each other, and a third class's saves and skills union on top of the other two.

## Installation

Requires the [libWrapper](https://foundryvtt.com/packages/lib-wrapper) module.

In Foundry's **Add-on Modules** tab, use this manifest URL:

```text
https://github.com/Brianthas/Gestalt-Sheets-5.5/releases/latest/download/module.json
```

## Usage

1. As GM, enable **Enable Gestalt Sheets** in the module's world settings (off by default).
2. Add each class to the character as normal.
3. On the character sheet's **Special Traits** tab (the star icon), check **Enable Gestalt** and set
   **Original Class** to whichever class is the gestalt base class.

Everything the module adds to that tab is a native dnd5e form field, so it behaves like every other
control on the sheet. dnd5e auto-sets Original Class to the first class you add, so a new character
needs no setup.

The base class's own level becomes the character's effective level for proficiency bonus, tier, and
anything else that scales off total character level. Every other class still grants its own features at
its own level, uncapped.

**Level the base class when you want the character's effective level to advance.** Proficiency bonus,
tier, HP per level, cantrip scaling and XP to next level are all pinned to the base class specifically.
Levelling only the secondary class grants that class's features but moves none of those.

One gap in the reminders: they fire when a class levels up and only list *other* classes that are
behind. Add a secondary class at level 1 to an already level 3 base class and nothing fires, because
the class that just changed is the one that is behind. Level a late-added class up by hand rather than
waiting for a reminder that will not come until the base class levels again.

## What it changes

### Hit points

dnd5e sums every class's hit die progression. Gestalt HP instead uses whichever single class currently
grants the most, which is not always the base class: a Sorcerer(base)/Fighter gestalt switches to
Fighter's total once Fighter grants more. Never both added, never mixed per level.

**Level 1:** dnd5e gives max hit die at level 1 only to the original class, so a second class's level 1
would get the average. Since gestalt classes are all starting classes, every class's level 1 counts as
max hit die. This recomputes every cycle, so existing characters correct themselves.

Not affected: a manually set HP maximum, and characters under a half-health effect.

### Hit dice

dnd5e sums each class's own hit dice, so a two-class gestalt shows twice its character level. Gestalt
hit dice equal character level, using the larger of the two classes' hit die. Spending and recovering
on a rest draws from that class only.

### Spellcasting

**Caster level follows character level, not the sum of the classes.** dnd5e's multiclass rule adds
every spellcasting class's caster level together, which would make a Wizard 5 / Druid 5 gestalt a level
10 caster holding 5th-level slots. The caster level is instead the largest single class's contribution:
that character is a level 5 caster with 4/3/2 slots. Each class is costed as if single-classed, which
matters for third casters - an Eldritch Knight 4 counts as caster level 2 rather than being rounded
down.

**Pact Magic** is already a separate pool in dnd5e and is left alone.

Non-pact slots remain one shared pool rather than a pool per class. **Double Spell Slots** (Special
Traits, next to Enable Gestalt) doubles the slot count at every leveled level, so that Wizard 5 / Druid
5 gets 8/6/4. It is an approximation of casting as two characters, not a per-class pool. For exact
control, dnd5e's **Configure Spell Slots** override can hand-set any level, and doubling leaves an
overridden level exactly as set.

Doubling raises the maximum only, so slots already spent stay spent and the new total appears on the
next long rest.

### Skill proficiencies during advancement

An advancement step that chooses skills lists all eighteen with what the character already has: one
tick proficient, two expertise, a half-filled circle for the half proficiency Jack of All Trades gives.
dnd5e's own picker offers only what is still legal to choose, which on a gestalt character taking two
classes' worth of skills leaves no way to see the overlap while deciding. Bard and Rogue between them
hand out eight proficiencies and four expertises.

A row you cannot pick is greyed, with a tooltip saying why: already proficient, already expertise,
expertise needs proficiency first, or not in this class's list. The gate is dnd5e's own - it removes
what the character has from its picker, and clicking a row drives that same picker - so no choice here
bypasses the system's rules. Picks made earlier in the same level-up show up immediately.

### Spell counts

A panel at the top of a gestalt character's **Spells** tab shows, per spellcasting class, how many
cantrips and prepared spells they should have against how many they do. Only a wrong number is
coloured. Targets are read from each class's own progression, so they are whatever the class says
rather than a table kept in this module.

A class item that carries no limit for a count - some third-party importers write Max Prepared Spells
but not Cantrips Known - borrows it from the official class of the same name in dnd5e's compendium,
marked with a dotted underline and a tooltip. Where even that has no limit, as with Paladin and Ranger
cantrips, nothing is shown.

**Prepared means actually prepared.** A spell sitting on the sheet unprepared is one the character
knows, not one they have prepared, and it does not count.

Spells granted by a subclass, such as Draconic Sorcery's or a Life Domain's, are always prepared and do
not count against the limit. They are excluded and reported as a total.

Each class row has a **Browse** button that opens dnd5e's own compendium browser filtered to that
class's spell list instead of every spell in the world. Spells added that way are assigned to the class
you browsed, so they count straight away.

Two things are called out rather than silently counted:

- **Spells on more than one of your classes' lists** get a class picker, because dnd5e cannot know
  whether a Sorcerer/Wizard's Magic Missile is the Sorcerer's or the Wizard's. Choosing writes the same
  Source Class field the spell's own Details tab edits.
- **Spells on none of your classes' lists** are named, since that usually means the wrong spell was
  added.

Built for the 2024 classes, which publish both counts. A class publishing neither gets no row rather
than a guess.

Works on dnd5e's own character sheet and on both of **Tidy 5e Sheets'** character sheets, modern and
classic, following whichever theme is active on each.

### Level-up reminders

When a gestalt actor's class levels change, the acting user gets a reminder listing any *other* classes
now behind the one that just levelled, and a warning if a non-base class has passed the base class.
Nothing fires when all classes are already even. These are notifications only, nothing is blocked.

Every gestalt reminder is shown as a toast *and* whispered to the acting player and all GMs, so there
is a permanent record of what fired and why rather than a toast that is gone by the time anyone looks.

### Ability score improvements

dnd5e grants ASIs per class at that class's own levels, so a gestalt character would collect every
class's. When a non-base class reaches one of its own ASI levels, the module compares how many ASI
slots it has earned against how many the base class has earned. Not exceeding it means the ASI is
redundant and you get a warning; exceeding it is a genuine bonus slot and nothing fires. A heads-up
only, shown before the picker opens. Nothing is blocked or deleted.

**Use Combined Class ASIs** in the world settings turns this off for every gestalt actor. It is a world
setting because whether ASI overlap is checked at all is a table-wide call.

### Saving throws, skill, tool, weapon and armor proficiencies

dnd5e restricts these to the original class, giving a second class nothing for saves and a reduced
grant for the rest. For gestalt actors every class is treated as the original class, so each is offered
exactly what it offers a single-classed character of that class, never the multiclass version:

- **Saves**: each class grants its own two, unioned. Fighter (Str/Con) + Sorcerer (Con/Cha) ends up
  proficient in Strength, Constitution *and* Charisma.
- **Weapons and armor**: each class's full list, not the reduced one. A secondary Fighter brings full
  martial weapons and heavy armor.
- **Tools**: each class's full choice. A secondary Bard picks three instruments rather than one, and a
  secondary Druid or Monk gets its tool grant at all.
- **Skills**: choices from both classes' full lists, uncapped. Base Bard's 3 plus secondary Rogue's 4
  is 7, not the better one and not the difference. Capping that is a table rule, not something the
  module enforces.

Only proficiencies are affected. dnd5e sets this restriction on Trait advancements alone, never on hit
points, item grants, scale values, subclass choices or ASIs.

**Existing characters**: this only affects advancement steps as they are offered going forward. If a
secondary class levelled past 1 before gestalt was turned on, its steps were never shown and will not
reappear. Open that class item's Advancement tab and configure the entry by hand, or remove and re-add
the class.

## Safety and reversibility

Every override above is computed fresh from your source data on every data-prep cycle. Nothing is
cached or written. The module's two flags and dnd5e's own Original Class field are the only state it
touches, so toggling Enable Gestalt cannot leave a character's numbers stuck.

**What toggling gestalt off does not undo** is what dnd5e's advancement flow already granted while it
was on: proficiencies picked, saves set, feats taken. Those are real persisted choices made through
dnd5e's own UI. A character that benefited from the proficiency unlock will keep proficiencies matching
neither ruleset unless someone trims them by hand. Treat enabling gestalt on a character as close to a
one-way decision.

## Status

Actively tested in a live game. Verified on Foundry core v13 and v14, and dnd5e 5.2.5 through 5.3.3.

- [CHANGELOG.md](CHANGELOG.md) - version-by-version history
- [docs/design-notes.md](docs/design-notes.md) - why the module works the way it does
- [docs/spell-counts.md](docs/spell-counts.md) - engineering record for the spell count panel
- [docs/skill-overview.md](docs/skill-overview.md) - engineering record for the advancement skill list
