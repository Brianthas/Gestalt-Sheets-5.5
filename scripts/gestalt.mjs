const MODULE_ID = "gestalt-sheets-55";

/**
 * dnd5e's "Special Traits" sheet tab renders one native, guaranteed-interactive form field per entry in
 * `CONFIG.DND5E.characterFlags`, and its own code hardcodes those fields to save under `flags.dnd5e.<key>`
 * (see dnd5e's `base-actor-sheet.mjs`: `name: \`flags.dnd5e.${key}\``) - not a module's own flag namespace.
 * Using this instead of a custom-injected panel means no guessing at render hook names or CSS selectors;
 * dnd5e's own template and form-submission handling does all of the work.
 */
const GESTALT_FLAG = {
  ENABLED: "gestaltEnabled",
  DOUBLE_SPELL_SLOTS: "gestaltDoubleSpellSlots"
};

/* -------------------------------------------- */
/*  Setup                                       */
/* -------------------------------------------- */

/**
 * Register a libWrapper patch defensively. This module leans on several fairly deep, undocumented
 * dnd5e internals (Advancement class prototypes, CONFIG.Actor.dataModels) that a future dnd5e update
 * could rename or restructure. Without this, a single broken target would throw inside the `init` hook
 * and silently prevent every *later* `libWrapper.register` call in the same callback from running too -
 * one dnd5e refactor could quietly take out the entire module instead of just the affected feature.
 * Failing loudly per-patch means the GM finds out exactly what broke instead of guessing why gestalt
 * stopped working after a system update.
 * @param {string} target
 * @param {Function} fn
 * @param {string} type
 */
function registerLibWrapper(target, fn, type) {
  try {
    libWrapper.register(MODULE_ID, target, fn, type);
  } catch (err) {
    console.error(
      `${MODULE_ID} | Failed to patch "${target}". The dnd5e system may have changed something this `
      + "module depends on - some gestalt features will not work until the module is updated.", err
    );
    ui.notifications?.error(
      `Gestalt Sheets 5.5 failed to patch dnd5e (${target}). Some gestalt features may not work `
      + "correctly - check the console (F12) and consider reporting this on the module's GitHub issues.",
      { permanent: true }
    );
  }
}

Hooks.once("init", () => {
  if (!CONFIG.DND5E) {
    console.error(`${MODULE_ID} | The dnd5e system is not active. This module requires it and will not function.`);
    return;
  }

  game.settings.register(MODULE_ID, "moduleEnabled", {
    name: "GESTALT.Settings.ModuleEnabled.Name",
    hint: "GESTALT.Settings.ModuleEnabled.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  // World setting, not a per-actor flag: whether ASI overlap is checked at all is a table-wide house
  // rule call, not something that should vary character to character within the same game.
  game.settings.register(MODULE_ID, "combinedAsi", {
    name: "GESTALT.Settings.CombinedAsi.Name",
    hint: "GESTALT.Settings.CombinedAsi.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  const section = game.i18n.localize("GESTALT.ModuleName");
  CONFIG.DND5E.characterFlags[GESTALT_FLAG.ENABLED] = {
    name: game.i18n.localize("GESTALT.EnableGestalt"),
    hint: game.i18n.localize("GESTALT.EnableGestaltHint"),
    section,
    type: Boolean
  };
  CONFIG.DND5E.characterFlags[GESTALT_FLAG.DOUBLE_SPELL_SLOTS] = {
    name: game.i18n.localize("GESTALT.DoubleSpellSlots"),
    hint: game.i18n.localize("GESTALT.DoubleSpellSlotsHint"),
    section,
    type: Boolean
  };

  if (!game.modules.get("lib-wrapper")?.active) {
    console.error(`${MODULE_ID} | The "libWrapper" module is required but is not active.`);
    ui.notifications?.error(
      "Gestalt Sheets 5.5 requires the \"libWrapper\" module to be installed and active. "
      + "Gestalt features will not work until it is enabled.",
      { permanent: true }
    );
    return;
  }

  registerLibWrapper("CONFIG.Actor.dataModels.character.prototype.prepareBaseData", function(wrapped, ...args) {
    wrapped(...args);
    applyGestaltLevel(this);
    applyGestaltHitDice(this);
  }, "WRAPPER");

  registerLibWrapper("CONFIG.Actor.dataModels.character.prototype.prepareDerivedData", function(wrapped, ...args) {
    wrapped(...args);
    applyGestaltHitPoints(this);
  }, "WRAPPER");

  registerLibWrapper("dnd5e.documents.advancement.Advancement.prototype.appliesToClass", function(wrapped) {
    if (isProficiencyUnlockAdvancement(this) && isGestaltActor(this.actor)) return true;
    return wrapped();
  }, "MIXED");

  // Leveled spell slots (system.spells.spell1-9) are computed inside Actor5e#prepareData, *after* the
  // character data model's own prepareDerivedData already ran - a different, later point in the prepare
  // cycle than the wraps above, so it needs its own wrap on the actor document class rather than the
  // data model.
  registerLibWrapper("CONFIG.Actor.documentClass.prototype.prepareData", function(wrapped, ...args) {
    wrapped(...args);
    applyGestaltSpellSlots(this);
  }, "WRAPPER");

  // Caster level. dnd5e fires one `dnd5e.prepare<Type>Slots` hook per slot-providing spellcasting
  // method, with the accumulated progression object, immediately before it turns that progression into
  // slots - the documented seam for changing how many slots a character gets, and the last point at
  // which the caster level can still be corrected. Registered per method (`spell`, `pact`, plus any a
  // module adds) rather than hardcoding "spell", since the same summing bug applies to every one of
  // them.
  //
  // Only the method *keys* are read here: at `init` the `CONFIG.DND5E.spellcasting` entries are still
  // the plain config objects, and dnd5e swaps in the SpellcastingModel instances that carry `slots` and
  // `computeProgression` later in its own startup. Checked live: at init `spellcasting.spell.slots` is
  // undefined, by the time the hook fires it is a MultiLevelSpellcasting. So the model is looked up
  // inside the handler, not captured here.
  //
  // dnd5e 4.x called this config `spellcastingTypes` and keyed leveled casting as "leveled" rather than
  // "spell"; reading the keys off whichever exists produces the right hook name on either. The handler
  // itself needs a SpellcastingModel to reuse dnd5e's own progression maths, which only 5.x has, so on
  // 4.x it finds none and leaves the caster level alone rather than throwing.
  const spellcastingConfig = CONFIG.DND5E.spellcasting ?? CONFIG.DND5E.spellcastingTypes ?? {};
  for (const type of Object.keys(spellcastingConfig)) {
    Hooks.on(`dnd5e.prepare${type.capitalize()}Slots`, (spells, actor, progression) => {
      applyGestaltCasterLevel(actor, type, progression);
    });
  }
});

Hooks.on("updateItem", onUpdateClassItem);

/* -------------------------------------------- */
/*  Notifications                                */
/* -------------------------------------------- */

/**
 * Show a gestalt reminder/warning both as a UI toast (for the moment) and as a whispered chat message
 * (as a persistent, scrollable record) - toasts disappear after a few seconds, which made several of
 * this module's own bugs harder to diagnose than they needed to be, since the exact wording was already
 * gone by the time anyone went looking for it. Whispered to the acting user and to all GMs, so a GM can
 * see what happened even on another player's action without needing to be told about it after the fact.
 * @param {"info"|"warn"} level
 * @param {string} message
 */
function notifyGestalt(level, message) {
  ui.notifications[level](message);

  const whisper = ChatMessage.getWhisperRecipients("GM").map(u => u.id);
  if (!whisper.includes(game.user.id)) whisper.push(game.user.id);

  ChatMessage.create({
    content: message,
    whisper,
    flavor: game.i18n.localize("GESTALT.ModuleName")
  });
}

/* -------------------------------------------- */
/*  Level override                              */
/* -------------------------------------------- */

/**
 * Determine whether gestalt rules are currently active for this actor.
 * @param {Actor5e} actor
 * @returns {boolean}
 */
function isGestaltActor(actor) {
  if (!game.settings.get(MODULE_ID, "moduleEnabled")) return false;
  return actor?.getFlag("dnd5e", GESTALT_FLAG.ENABLED) === true;
}

/**
 * Get the actor's gestalt base class. Reuses dnd5e's own "Original Class" field
 * (`system.details.originalClass`) rather than a separate module flag, since dnd5e already renders a
 * native dropdown for it in the same Special Traits tab as the checkboxes above - one less custom
 * control to build, and it's auto-populated to the first class added, giving new gestalt characters a
 * sensible default with no setup required.
 * @param {Actor5e} actor
 * @returns {Item5e|null}
 */
function getBaseClass(actor) {
  const item = actor.items.get(actor.system.details.originalClass);
  return item?.type === "class" ? item : null;
}

/**
 * dnd5e restricts certain class-granted proficiencies (saving throws, most classes' skill choices, and
 * the *full* weapon/armor proficiency list) to only the actor's "original class"
 * (`system.details.originalClass`, auto-assigned to whichever class was added to the sheet first) via
 * `classRestriction: "primary"` on the relevant advancement. A second/"secondary" class instead only
 * gets whatever separate `classRestriction: "secondary"` entry that class defines (nothing, for saves;
 * usually nothing, for skills; a reduced list, for weapon/armor) - matching normal 5e multiclassing.
 *
 * Gestalt wants every class's full proficiencies available, not just the accidental first-added one's:
 * unlocking every "primary"-restricted entry for skills/saves/weapon/armor means each class applies its
 * full list regardless of original-class status. Where a class also has its own separate "secondary"
 * entry (weapon/armor), that one keeps applying too, but it's just a subset of the now-also-applying
 * full grant, so the practical result is the full list either way. dnd5e's own advancement-application
 * logic already skips re-granting anything the actor already has, so overlapping proficiencies between
 * classes don't need separate dedup code. Skills are included here uncapped, deliberately: every class
 * offers its own full skill list, so a gestalt character picks skills from *both* classes rather than
 * being limited to whichever class is more generous (see the README for why an earlier capped version
 * of this was dropped).
 * @param {object} advancement
 * @returns {boolean}
 */
function isProficiencyUnlockAdvancement(advancement) {
  if (advancement.type !== "Trait") return false;
  const traits = advancement.representedTraits();
  return ["skills", "saves", "weapon", "armor"].some(t => traits.has(t));
}

/**
 * Overwrite the actor's derived character level (and everything computed from it) to match
 * the gestalt base class's own level, instead of dnd5e's default sum of every class's levels.
 * Runs after dnd5e's own `prepareBaseData`, so this is the only override point needed: everything
 * dnd5e derives later in the prepare cycle (proficiency bonus, tier, HP-per-level, cantrip scaling,
 * and any other item's fallback to `system.details.level`) reads the corrected value from here on.
 * @param {CharacterData} characterData
 */
function applyGestaltLevel(characterData) {
  const actor = characterData.parent;
  if (!isGestaltActor(actor)) return;

  const baseClass = getBaseClass(actor);
  if (!baseClass) return;

  characterData.details.level = baseClass.system.levels;
  characterData.attributes.prof = dnd5e.documents.Proficiency.calculateMod(characterData.details.level);
}

/**
 * dnd5e's `HitDice.max`/`.value` sum every class's own hit-die total (each class's own level, since a
 * class's `hd.max` is just its `levels`) - correct for real multiclassing, but for gestalt that's every
 * class's level added together even though every class levels in lockstep, so a two-class gestalt build
 * shows double its character level (e.g. two level-5 classes reporting 10 hit dice instead of 5). The
 * classic gestalt house rule this module follows: hit dice equal to character level, rolled using the
 * larger of the two classes' hit die - not a per-level mix, matching the same "pick one class" approach
 * already used for HP.
 *
 * Rather than reimplementing `HitDice`, this shrinks its `classes`/`sizes` sets down to just the
 * larger-die class and overrides `max`/`value` to match - `bySize`, `pct`, and every other `HitDice`
 * getter derive from those same fields, so they and dnd5e's own rest/roll code (which reads
 * `attributes.hd.classes` to decide which class item's `system.hd.spent` to increment) stay correct
 * without any further patching. Spent hit dice keep living on the larger-die class item itself - no new
 * storage needed, and it self-corrects every prepare cycle the same way the HP override does.
 * @param {CharacterData} characterData
 */
function applyGestaltHitDice(characterData) {
  const actor = characterData.parent;
  if (!isGestaltActor(actor)) return;

  const classes = actor.items.filter(i => i.type === "class");
  if (classes.length < 2) return;

  const denomination = cls => Number(cls.system.hd.denomination.slice(1));
  const largest = classes.reduce((best, cls) => denomination(cls) > denomination(best) ? cls : best);

  const hd = characterData.attributes.hd;
  hd.classes = new Set([largest]);
  hd.sizes = new Set([denomination(largest)]);

  const max = characterData.details.level;
  Object.defineProperty(hd, "max", { value: max, configurable: true });
  Object.defineProperty(hd, "value", { value: Math.max(max - largest.system.hd.spent, 0), configurable: true });
}

/**
 * dnd5e's default HP calculation sums every class's own HitPoints advancement (normal multiclass:
 * Fighter's d10 + Sorcerer's d6, stacked). Gestalt HP instead uses whichever single class currently
 * grants the most HP - not a fixed "base class", since HP should track the better hit die even when
 * it's on a secondary class, and not a per-level mix, since a lower-level secondary class has no HP
 * data for levels it hasn't reached yet.
 *
 * Rather than reimplementing dnd5e's HP formula (bonuses, half-health effects, etc.) from scratch,
 * this lets the original `prepareDerivedData` run normally, then swaps its summed-across-classes base
 * for the best single class's base and redoes the same short cascade (effective max/clamp/damage/pct)
 * dnd5e itself uses. Skipped entirely if the GM has manually overridden HP max, or if a "half health"
 * condition is active (that multiplies the summed total in a way that can't be cleanly un-summed).
 * @param {CharacterData} characterData
 */
function applyGestaltHitPoints(characterData) {
  const actor = characterData.parent;
  if (!isGestaltActor(actor)) return;
  if (actor.system._source.attributes.hp.max !== null) return;
  if (actor.hasConditionEffect("halfHealth")) return;

  const mod = characterData.abilities?.[CONFIG.DND5E.defaultAbilities?.hitPoints ?? "con"]?.mod ?? 0;
  const hpAdvancements = actor.items
    .filter(i => i.type === "class")
    .map(cls => cls.advancement?.byType?.HitPoints?.[0])
    .filter(a => a);
  if (hpAdvancements.length < 2) return;

  // dnd5e's own totals (used to back out `bonus` below, since that's what it actually used to compute
  // hp.max) vs the gestalt-corrected totals (used to pick the best class) - see getGestaltAdjustedHpTotal.
  const originalTotals = hpAdvancements.map(a => a.getAdjustedTotal(mod));
  const correctedTotals = hpAdvancements.map(a => getGestaltAdjustedHpTotal(a, mod));

  const hp = characterData.attributes.hp;
  const bonus = hp.max - originalTotals.reduce((a, b) => a + b, 0);
  hp.max = Math.floor(Math.max(...correctedTotals) + bonus);
  hp.effectiveMax = Math.max(hp.max + (hp.tempmax ?? 0), 0);
  hp.value = Math.min(hp.value, hp.effectiveMax);
  hp.damage = hp.effectiveMax - hp.value;
  hp.pct = Math.clamp(hp.effectiveMax ? (hp.value / hp.effectiveMax) * 100 : 0, 0, 100);
}

/**
 * dnd5e's HitPointsAdvancement only grants max hit die at level 1 for whichever class is the actor's
 * single "original class" (`system.details.originalClass`, auto-assigned to whichever class was added
 * first) - a second class's own level 1, even though it's just as much a starting class in a gestalt
 * build, only gets the average/rolled value like any other later multiclass level. `getAdjustedTotal()`
 * just reads whatever was already stored per level, so this recomputes the same total but substitutes
 * the hit die's max value for level 1 specifically, regardless of what's actually stored there - every
 * gestalt class is a starting class, so every one of them should get max HP at its own level 1. This
 * self-corrects characters that already went through the HP flow with "avg" stored at level 1, with no
 * manual backfill needed, since it's recomputed fresh every time rather than depending on what got
 * stored when the player originally rolled.
 * @param {object} hpAdvancement  A HitPointsAdvancement instance.
 * @param {number} mod            The CON (or configured hit-point ability) modifier to add per level.
 * @returns {number}
 */
function getGestaltAdjustedHpTotal(hpAdvancement, mod) {
  return Object.keys(hpAdvancement.value).reduce((total, levelKey) => {
    const level = Number(levelKey);
    const value = level === 1 ? hpAdvancement.hitDieValue : hpAdvancement.valueForLevel(level);
    return total + Math.max(value + mod, 1);
  }, 0);
}

/* -------------------------------------------- */
/*  Spell slots                                 */
/* -------------------------------------------- */

/**
 * Correct the caster level a spellcasting method's slots are sized off. dnd5e builds its progression by
 * *adding* every spellcasting class's contribution together (`SlotSpellcasting#computeProgression` does
 * `progression[key] += levels / divisor`), which is right for real multiclassing and wrong for gestalt
 * for exactly the reason character level is: the classes level in lockstep, so a Wizard 5 / Druid 5
 * gestalt is a level 5 caster, not a level 10 one. Left alone it hands a level 5 character 5th-level
 * spell slots.
 *
 * The replacement is the largest single class's contribution, computed with dnd5e's own
 * `computeProgression` so half- and third-caster divisors, `roundUp`, and any progression a module has
 * registered all stay the system's business rather than being reimplemented here. Each class is costed
 * as `count: 1` (single-classed), which is correct for gestalt: each side of the build is effectively
 * its own single-classed character. Checked against the live config, that only changes the answer for
 * the `third` progression (Eldritch Knight, Arcane Trickster), whose `roundUp` is false, so a lone third
 * caster rounds up as dnd5e's own single-class rule requires - an Eldritch Knight 4 is caster level 2,
 * not 1. `half` and `artificer` already carry `roundUp: true` and `full` has divisor 1, so for those the
 * count makes no difference either way.
 *
 * Runs before dnd5e turns the progression into slots, so every later consumer (the slot maxima, the
 * spellcasting tab's "spellcaster level", scaling cantrips that read it) sees the corrected number.
 * @param {Actor5e} actor       Actor the slots are being prepared for.
 * @param {string} type         Spellcasting method key, e.g. "spell" or "pact".
 * @param {object} progression  Spellcasting progression data. *Will be mutated.*
 */
function applyGestaltCasterLevel(actor, type, progression) {
  if (!isGestaltActor(actor)) return;
  if (!progression?.[type]) return;

  const model = CONFIG.DND5E.spellcasting?.[type];
  if (!model?.slots || (typeof model.computeProgression !== "function")) return;

  const classes = actor.itemTypes.class.filter(cls => cls.spellcasting?.type === type);
  if (classes.length < 2) return;

  let best = 0;
  for (const cls of classes) {
    const single = { [type]: 0 };
    model.computeProgression(single, actor, cls, cls.spellcasting, 1);
    best = Math.max(best, single[type] ?? 0);
  }

  progression[type] = best;
}

/**
 * Non-pact spell slots aren't split into separate per-class pools (see the README's Spellcasting
 * section for why - it would need registering whole new spellcasting types, not a small patch). As a
 * much simpler stand-in, this per-actor opt-in doubles the leveled slot count (`system.spells.spell1`
 * through `spell9`) at each level, on top of the gestalt-corrected caster level from
 * `applyGestaltCasterLevel` above - a rough approximation of "casting as two characters" rather than a
 * mechanically precise per-class pool.
 *
 * Only doubles leveled slots, not Pact Magic (`system.spells.pact`), which is already isolated to its
 * own casting class's level and doesn't need correction. Skips any spell level the GM has manually
 * overridden (dnd5e's own "Configure Spell Slots" dialog), respecting that as an intentional exact value
 * the same way the HP override respects a manually-set HP max.
 *
 * Only `max` is doubled, never `value`. dnd5e writes spent slots back as an *absolute* number read off
 * the derived data (`ActivityUsage`: `system.spells.spell1.value = slotData.value - 1`; long rest:
 * `= slot.max`), so anything added to the derived `value` here is banked into the stored value on the
 * next cast or rest and then added again on the next prepare, growing without limit. That is what
 * produced the "casting adds purple slots" report.
 *
 * The clamp afterwards is both a guard against that class of bug and the repair for characters already
 * carrying an inflated stored value from before it was fixed: dnd5e clamps single-level slots itself
 * (`SingleLevelSpellcasting#prepareSlots`) but not leveled ones, so a stored 15-of-6 stays 15 forever
 * otherwise. Clamping the derived value shows the right number immediately, and the next cast or long
 * rest writes the corrected number back to the stored data. It runs for any gestalt actor, flag on or
 * off, so turning Double Spell Slots back off still heals the character.
 * @param {Actor5e} actor
 */
function applyGestaltSpellSlots(actor) {
  if (!isGestaltActor(actor)) return;

  const spells = actor.system.spells;
  if (!spells) return;

  const double = actor.getFlag("dnd5e", GESTALT_FLAG.DOUBLE_SPELL_SLOTS) === true;

  for (let level = 1; level <= 9; level++) {
    const slot = spells[`spell${level}`];
    if (!slot?.max) continue;

    if (double && !Number.isNumeric(slot.override)) slot.max *= 2;
    slot.value = Math.clamp(slot.value ?? 0, 0, slot.max);
  }
}

/* -------------------------------------------- */
/*  Level-up reminders                          */
/* -------------------------------------------- */

/**
 * In-memory cache of each class item's last-known level, keyed by item ID. Needed because dnd5e's
 * Advancement Manager operates on a full cloned copy of the actor throughout its wizard, and commits
 * the result via a *bulk* `updateEmbeddedDocuments` call that can include an unrelated sibling class's
 * `system.levels` in the update payload even when that class's value never actually changed (confirmed
 * via diagnostic logging: leveling a newly-added Warlock produced an `updateItem` event whose actual
 * triggering item was the unrelated, unchanged Sorcerer). `changes.system.levels !== undefined` alone
 * can't distinguish "genuinely changed" from "included in a batch write but identical," so this compares
 * against the last level we actually observed for that specific item instead.
 * @type {Map<string, number>}
 */
const lastKnownClassLevels = new Map();

Hooks.once("ready", () => {
  for (const actor of game.actors) {
    if (!isGestaltActor(actor)) continue;
    for (const item of actor.items) {
      if (item.type === "class") lastKnownClassLevels.set(item.id, item.system.levels);
    }
  }
});

/**
 * When a class item's level changes on a gestalt actor, remind the acting user about the actor's
 * other classes so features don't get missed, and warn if a non-base class has drifted past the
 * base class's level. Notification-only: nothing here blocks or auto-triggers advancement.
 * @param {Item5e} item
 * @param {object} changes
 * @param {object} options
 * @param {string} userId
 */
function onUpdateClassItem(item, changes, options, userId) {
  if (game.user.id !== userId) return;
  if (item.type !== "class") return;

  const actor = item.actor;
  if (!isGestaltActor(actor)) return;

  const previousLevel = lastKnownClassLevels.get(item.id);
  lastKnownClassLevels.set(item.id, item.system.levels);
  const levelChanged = foundry.utils.getProperty(changes, "system.levels") !== undefined
    && previousLevel !== undefined && previousLevel !== item.system.levels;

  if (levelChanged) {
    // Only classes actually behind the one that just leveled - not every other class unconditionally,
    // which used to fire even when a class had just caught up to parity with the rest (nothing left to
    // "not forget" at that point).
    const behind = actor.items.filter(
      i => i.type === "class" && i.id !== item.id && i.system.levels < item.system.levels
    );
    if (behind.length) {
      const list = behind.map(c => `${c.name} (${c.system.levels})`).join(", ");
      notifyGestalt("info", game.i18n.format("GESTALT.LevelUpReminder", { classes: list }));
    }

    const baseClass = getBaseClass(actor);
    if (baseClass) {
      const overLeveled = actor.items.filter(
        i => i.type === "class" && i.id !== baseClass.id && i.system.levels > baseClass.system.levels
      );
      if (overLeveled.length) {
        const list = overLeveled.map(c => `${c.name} (${c.system.levels})`).join(", ");
        notifyGestalt("warn", game.i18n.format("GESTALT.LevelExceedsBase", {
          classes: list,
          base: `${baseClass.name} (${baseClass.system.levels})`
        }));
      }
    }

    checkSecondaryClassAsiOverlap(actor, item, baseClass);
  }
}

/* -------------------------------------------- */
/*  Ability Score Improvement overlap            */
/* -------------------------------------------- */

/**
 * Get the AbilityScoreImprovement advancement entries defined on a class item.
 * @param {Item5e} classItem
 * @returns {object[]}
 */
function getAsiEntries(classItem) {
  return classItem.advancement?.byType?.AbilityScoreImprovement ?? [];
}

/**
 * How many ASI/feat schedule slots a class has earned at its own current level.
 * @param {Item5e} classItem
 * @returns {number}
 */
function countAsiEarned(classItem) {
  return getAsiEntries(classItem).filter(a => a.level <= classItem.system.levels).length;
}

/**
 * When a secondary (non-base) class levels up on a gestalt actor, warn if that class's own ASI/feat
 * schedule hasn't actually moved past what the base class already provides - e.g. Sorcerer(base)/
 * Fighter(secondary) both reaching their level-4 ASI is redundant (Fighter's count of 1 doesn't exceed
 * Sorcerer's count of 1), but Fighter continuing on to level 6 isn't (Fighter's count of 2 exceeds
 * Sorcerer's 1 - a real bonus slot most classes don't get). This only compares the leveling class
 * against the base class specifically, not other secondary classes in a 3+ class gestalt build.
 *
 * This is a heads-up only, fired at the moment the level crosses a threshold, before the player even
 * opens the ASI/feat picker for it - not a block. Enabling "Use Combined Class ASIs" in the world
 * settings turns this off entirely, for every gestalt actor - a table-wide house rule choice for the GM
 * to make, not something that should vary character to character within the same game.
 * @param {Actor5e} actor
 * @param {Item5e} item        The class item that just changed level.
 * @param {Item5e|null} baseClass
 */
function checkSecondaryClassAsiOverlap(actor, item, baseClass) {
  if (game.settings.get(MODULE_ID, "combinedAsi") === true) return;
  if (!baseClass || item.id === baseClass.id) return;

  const secondaryEarned = countAsiEarned(item);
  const baseEarned = countAsiEarned(baseClass);
  if (secondaryEarned > baseEarned) return;

  notifyGestalt("warn", game.i18n.format("GESTALT.AsiRedundant", {
    name: actor.name,
    secondary: item.name,
    base: baseClass.name
  }));
}

