# Skill overview in advancement

Engineering record for the skill list added to Trait advancement steps. Checked against dnd5e 5.3.3
and Foundry 14.365.

## What dnd5e already does

`TraitAdvancement#unfulfilledChoices` (`dnd5e.mjs:10022`) ends with

```
allChoices.exclude(new Set([...(selected.actor ?? []), ...selected.item]));
```

so anything the character already has is removed from the picker before it renders. Measured on a
Bard/Sorcerer with `acr:2 dec:2`, eight skills at `1` and eight at `0.5`: the default-mode step
offered exactly the eight at `0`, and the expertise-mode step offered exactly the eight at `1`.

That is a complete gate and this module does not add a second one. What it does not do is show the
character's current state, which is the thing worth seeing when two classes are handing out skills.

## Where the panel attaches

`Hooks.on("renderTraitFlow", ...)`. The hook fires with the `TraitFlow` and its form element, before
`renderAdvancementManager`, and an element appended during it survives into the manager's DOM -
confirmed by injecting a marker and re-reading after the manager render.

The step's markup is

```
form.advancement.flow[data-type="Trait"]
  div[data-application-part="header"] > h3
  div.standard-form[data-application-part="content"]
    fieldset > legend + select[name="added"]
```

The panel is appended to the content part. The flow re-renders in place after every pick, so the
handler removes its own previous panel first.

## Reading the character's state

`flow.advancement.actor` is the **manager's clone**, not the world actor. Verified: picking
Acrobatics moved `acr` from 0 to 1 on `flow.advancement.actor` while the real actor stayed at 0 until
the manager completed. That is what makes picks made earlier in the same level-up visible in the list.

Proficiency comes from `actor.system.skills[key].value`: 0, 0.5, 1 or 2. Half proficiency is not a
proficiency entry - it is Jack of All Trades raising the derived value to 0.5 - so it can only be read
from the derived value, never from `_source`.

## Making a pick

Clicking a row sets `select[name="added"]` and dispatches a bubbling `change`. That reaches
`TraitFlow#_handleForm`, which calls `advancement.apply(this.level, { key })`. The module never writes
a proficiency itself. Driving the select from script was confirmed to produce the same result as
using it by hand: `value.chosen` gained the key, the option disappeared, and a trait slot rendered.

## Why a row is greyed

An absent option means the system will not accept the pick, but a select cannot say why. The reason is
reconstructed for the tooltip only:

| Condition | Tooltip |
| --- | --- |
| expertise mode, value 2 | Already expertise |
| expertise mode, value below 1 | Expertise needs proficiency first |
| default mode, value 1 or more | Already proficient |
| not in the advancement's pool | Not in this class's list |

Once every pick in the step is spent dnd5e drops the picker entirely, so the offer set is empty and
every row is greyed. Those rows get no tooltip: saying each remaining skill is "unavailable" would read
as a restriction rather than as the step being finished. 1.3.0 shipped with that condition wrong for a
few minutes of testing and it produced "Not available in this step" against fifteen skills that were
merely not needed.

The pool comes from `configuration.choices[].pool`, where `skills:*` means all eighteen. Rogue's is a
ten-skill list, which is what makes "not in this class's list" a distinct and common case on a gestalt
character.

`configuration.type` does not exist on this advancement in 5.3.3; the trait family lives in the key
prefixes, so `isSkillTraitAdvancement` tests that every grant and pool key starts with `skills`.

## Testing notes

The Hit Points step of a **second** class blocks Next until a value exists. Take Average is a
`<dnd5e-checkbox name="useAverage">`, not a button, which is what a first scripted pass failed to find.

Closing a manager mid-run raises a "Stop Advancement" `DialogV2`; an `await app.close()` hangs until
its `button[data-action="yes"]` is clicked.

A full Bard 1 then Rogue 1 gestalt run ends with `acr:2 dec:1 prc:1 prf:1 per:1 slt:1 ste:2`, and the
four states to look for are: no mark, `fa-circle-half-stroke`, `fa-check`, `fa-check-double`.
