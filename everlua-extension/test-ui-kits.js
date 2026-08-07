// Smart UI-kit prompt tests. Run: node test-ui-kits.js
const fs = require("fs");
const ZS = new Function(fs.readFileSync(__dirname + "/core/config.js", "utf8") + "; return ZS;")();

const ok = (name, condition) => {
  console.log((condition ? "PASS" : "FAIL") + "  " + name);
  if (!condition) process.exitCode = 1;
};

const expected = ["Main Menu", "Inventory", "Shop", "Settings", "Quest Log", "Dialogue Box", "Health HUD"];
ok("all seven smart kits exist", expected.every((name) => ZS.UI_KITS[name]));

for (const name of expected) {
  const brief = ZS.uiKitInstruction(name);
  ok(`${name} has a UI-only guard`, /For non-UI work, ignore this kit completely/.test(brief));
  ok(`${name} matches the existing game style`, /Match the game's established palette/.test(brief));
  ok(`${name} includes components`, /Include /.test(brief));
  ok(`${name} includes interaction guidance`, /Support /.test(brief));
}

const inventoryPrompt = ZS.buildSystemPrompt({ siteName: "Test", uiTemplate: "Inventory" });
ok("selected kit enters startup prompt", inventoryPrompt.includes("EVERLUA SMART UI KIT — Inventory"));
ok("clear kit does not alter startup prompt", !ZS.buildSystemPrompt({ siteName: "Test", uiTemplate: "" }).includes("EVERLUA SMART UI KIT"));
ok("live change is non-destructive", /Do not create or modify UI now/.test(ZS.uiKitChangeInstruction("Shop")));
ok("clear change is supported", /Clear the active UI kit/.test(ZS.uiKitChangeInstruction("")));
ok("unknown kit has no startup brief", ZS.uiKitInstruction("Unknown") === "");

const themes = ["Studio UI", "Simulator", "Anime Battler", "Shooting"];
ok("all four Roblox themes exist", themes.every((name) => ZS.UI_THEMES[name]));
for (const name of themes) {
  const brief = ZS.uiThemeInstruction(name);
  ok(`${name} has a UI-only guard`, /For non-UI work, ignore this theme completely/.test(brief));
  ok(`${name} includes visual direction`, /Use /.test(brief));
  ok(`${name} preserves the game identity`, /Adapt it to the game's established identity/.test(brief));
}

const themedPrompt = ZS.buildSystemPrompt({ siteName: "Test", uiTemplate: "Health HUD", uiTheme: "Studio UI" });
ok("selected theme enters startup prompt", themedPrompt.includes("EVERLUA ROBLOX UI THEME - Studio UI"));
ok("kit and theme combine in startup prompt", themedPrompt.includes("Health HUD") && themedPrompt.includes("Studio UI"));
ok("No Theme does not alter startup prompt", !ZS.buildSystemPrompt({ siteName: "Test", uiTheme: "" }).includes("EVERLUA ROBLOX UI THEME"));
ok("live theme change is non-destructive", /Do not create or modify UI now/.test(ZS.uiDesignChangeInstruction("Shop", "Simulator")));
ok("clearing kit and theme is supported", /Clear the active UI kit and Roblox theme/.test(ZS.uiDesignChangeInstruction("", "")));
