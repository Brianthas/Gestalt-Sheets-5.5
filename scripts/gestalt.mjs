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
  COMBINED_ASI: "gestaltCombinedAsi"
};

/* -------------------------------------------- */
/*  Setup                                       */
/* -------------------------------------------- */

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "moduleEnabled", {
    name: "GESTALT.Settings.ModuleEnabled.Name",
    hint: "GESTALT.Settings.ModuleEnabled.Hint",
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
  CONFIG.DND5E.characterFlags[GESTALT_FLAG.COMBINED_ASI] = {
    name: game.i18n.localize("GESTALT.CombinedAsi"),
    hint: game.i18n.localize("GESTALT.CombinedAsiHint"),
    section,
    type: Boolean
  };

  if (!game.modules.get("lib-wrapper")?.active) {
    console.error(`${MODULE_ID} | The "libWrapper" module is required but is not active.`);
    return;
  }

  libWrapper.register(MODULE_ID, "CONFIG.Actor.dataModels.character.prototype.prepareBaseData", function(wrapped, ...args) {
    wrapped(...args);
    applyGestaltLevel(this);
  }, "WRAPPER");

  libWrapper.register(MODULE_ID, "CONFIG.Actor.dataModels.character.prototype.prepareDerivedData", function(wrapped, ...args) {
    wrapped(...args);
    applyGestaltHitPoints(this);
  }, "WRAPPER");

  libWrapper.register(MODULE_ID, "dnd5e.documents.advancement.Advancement.prototype.appliesToClass", function(wrapped) {
    if (isProficiencyUnlockAdvancement(this) && isGestaltActor(this.actor)) return true;
    return wrapped();
  }, "MIXED");
});

Hooks.on("updateItem", onUpdateClassItem);

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
/*  Level-up reminders                          */
/* -------------------------------------------- */

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

  const levelChanged = foundry.utils.getProperty(changes, "system.levels") !== undefined;

  if (levelChanged) {
    // Only classes actually behind the one that just leveled - not every other class unconditionally,
    // which used to fire even when a class had just caught up to parity with the rest (nothing left to
    // "not forget" at that point).
    const behind = actor.items.filter(
      i => i.type === "class" && i.id !== item.id && i.system.levels < item.system.levels
    );
    if (behind.length) {
      const list = behind.map(c => `${c.name} (${c.system.levels})`).join(", ");
      ui.notifications.info(game.i18n.format("GESTALT.LevelUpReminder", { classes: list }));
    }

    const baseClass = getBaseClass(actor);
    if (baseClass) {
      const overLeveled = actor.items.filter(
        i => i.type === "class" && i.id !== baseClass.id && i.system.levels > baseClass.system.levels
      );
      if (overLeveled.length) {
        const list = overLeveled.map(c => `${c.name} (${c.system.levels})`).join(", ");
        ui.notifications.warn(game.i18n.format("GESTALT.LevelExceedsBase", {
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
 * opens the ASI/feat picker for it - not a block. A GM/player who wants full combined ASIs for a
 * character can check "Use Combined Class ASIs" on the sheet to skip this warning entirely.
 * @param {Actor5e} actor
 * @param {Item5e} item        The class item that just changed level.
 * @param {Item5e|null} baseClass
 */
function checkSecondaryClassAsiOverlap(actor, item, baseClass) {
  if (actor.getFlag("dnd5e", GESTALT_FLAG.COMBINED_ASI) === true) return;
  if (!baseClass || item.id === baseClass.id) return;

  const secondaryEarned = countAsiEarned(item);
  const baseEarned = countAsiEarned(baseClass);
  if (secondaryEarned > baseEarned) return;

  ui.notifications.warn(game.i18n.format("GESTALT.AsiRedundant", {
    name: actor.name,
    secondary: item.name,
    base: baseClass.name
  }));
}

