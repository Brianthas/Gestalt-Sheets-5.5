const MODULE_ID = "gestalt-sheets-55";

const FLAGS = {
  ENABLED: "enabled",
  BASE_CLASS: "baseClass"
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

  if (!game.modules.get("lib-wrapper")?.active) {
    console.error(`${MODULE_ID} | The "libWrapper" module is required but is not active.`);
    return;
  }

  libWrapper.register(MODULE_ID, "CONFIG.Actor.dataModels.character.prototype.prepareBaseData", function(wrapped, ...args) {
    wrapped(...args);
    applyGestaltLevel(this);
  }, "WRAPPER");
});

for (const hook of ["renderCharacterActorSheet", "renderActorSheet5eCharacter2", "renderActorSheet5eCharacter"]) {
  Hooks.on(hook, onRenderCharacterSheet);
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
  return actor?.getFlag(MODULE_ID, FLAGS.ENABLED) === true;
}

/**
 * Get the class item designated as this actor's gestalt base class, if any.
 * @param {Actor5e} actor
 * @returns {Item5e|null}
 */
function getBaseClass(actor) {
  const baseClassId = actor.getFlag(MODULE_ID, FLAGS.BASE_CLASS);
  if (!baseClassId) return null;
  const item = actor.items.get(baseClassId);
  return item?.type === "class" ? item : null;
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

/* -------------------------------------------- */
/*  Sheet UI                                    */
/* -------------------------------------------- */

/**
 * Inject the gestalt toggle and base-class picker into the character sheet.
 * @param {ActorSheet} app
 * @param {HTMLElement|JQuery} element
 */
function onRenderCharacterSheet(app, element) {
  const actor = app.actor;
  if (actor?.type !== "character" || !actor.isOwner) return;
  if (!game.settings.get(MODULE_ID, "moduleEnabled")) return;

  const root = element instanceof HTMLElement ? element : element[0];
  if (root.querySelector(".gestalt-controls")) return;

  const enabled = actor.getFlag(MODULE_ID, FLAGS.ENABLED) === true;
  const baseClassId = actor.getFlag(MODULE_ID, FLAGS.BASE_CLASS) ?? "";
  const classItems = actor.items.filter(i => i.type === "class");

  const panel = document.createElement("fieldset");
  panel.classList.add("gestalt-controls");

  const legend = document.createElement("legend");
  legend.textContent = game.i18n.localize("GESTALT.ModuleName");
  panel.appendChild(legend);

  const toggleLabel = document.createElement("label");
  const toggle = document.createElement("input");
  toggle.type = "checkbox";
  toggle.checked = enabled;
  toggle.addEventListener("change", () => actor.setFlag(MODULE_ID, FLAGS.ENABLED, toggle.checked));
  toggleLabel.appendChild(toggle);
  toggleLabel.append(` ${game.i18n.localize("GESTALT.EnableGestalt")}`);
  panel.appendChild(toggleLabel);

  const select = document.createElement("select");
  select.disabled = !enabled;
  const blankOption = document.createElement("option");
  blankOption.value = "";
  blankOption.textContent = game.i18n.localize("GESTALT.SelectBaseClass");
  select.appendChild(blankOption);
  for (const cls of classItems) {
    const option = document.createElement("option");
    option.value = cls.id;
    option.textContent = `${cls.name} (${cls.system.levels})`;
    if (cls.id === baseClassId) option.selected = true;
    select.appendChild(option);
  }
  select.addEventListener("change", () => actor.setFlag(MODULE_ID, FLAGS.BASE_CLASS, select.value || null));
  toggle.addEventListener("change", () => select.disabled = !toggle.checked);
  panel.appendChild(select);

  root.querySelector(".window-content")?.prepend(panel);
}
