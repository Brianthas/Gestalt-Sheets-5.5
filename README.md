# Gestalt-Sheets-5.5

A [Foundry VTT](https://foundryvtt.com/) module for the [dnd5e](https://github.com/foundryvtt/dnd5e) system that adds support for **Gestalt** characters: play two classes at once and gain the features of both, without your effective level, proficiency bonus, or spell slots scaling as if the two classes' levels were added together.

For example, a Bard 5 / Paladin 5 gestalt character has the features of a level 5 Bard *and* a level 5 Paladin, but is treated as a level 5 character overall (proficiency bonus, spell slot progression, etc.) rather than a level 10 multiclass character.

## Installation

Requires the [libWrapper](https://foundryvtt.com/packages/lib-wrapper) module.

In Foundry's **Add-on Modules** tab, use this manifest URL:

```
https://github.com/Brianthas/Gestalt-Sheets-5.5/releases/latest/download/module.json
```

## Usage

1. As GM, enable **Enable Gestalt Sheets** in the module's world settings (off by default).
2. Add each of your classes to the character as normal (dnd5e multiclassing).
3. On the character sheet, check **Enable Gestalt** and pick one class as the **base class**.

The base class's own level becomes the character's effective level for proficiency bonus, tier, and
anything else that normally scales off total character level. Every other class still grants its own
features at its own level as usual, uncapped by the base class.

### Spellcasting

- **Pact Magic** (Warlock) is already tracked as a separate pool by the base system, so it's unaffected.
- Non-pact spell slots (leveled slots from full/half/third casters) currently still use dnd5e's normal
  multiclass rule of one shared pool sized off the *summed* caster levels. If you're running two
  non-pact spellcasting classes in the same gestalt build, use dnd5e's built-in **Configure Spell Slots**
  override (actor sheet → spellcasting config) to hand-set the pool to whatever your table intends.
  Automatic separate pools per class may come later.

## Status

Early development.
