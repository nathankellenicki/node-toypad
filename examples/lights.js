import { TagType, ToyPad } from "../dist/index.js";

const toyPad = new ToyPad();
const charColors = new Map([
  ["Wyldstyle", 0xff0000],
  ["Batman", 0x00ff00],
  ["Gandalf", 0x0000ff]
]);
const panelAssignments = new Map();
await toyPad.connect();
console.log("ToyPad connected");

toyPad.on("add", async (event) => {
  // Once we've detected a tag, read it to figure out what it is
  const info = await toyPad.readTag(event.panel, event.signature);
  if (info.type !== TagType.Character) {
    return;
  }
  const character = ToyPad.metadata.getCharacterById(info.id);
  const color = character ? charColors.get(character.name) : undefined;
  if (color === undefined) {
    return;
  }
  const assignments = panelAssignments.get(event.panel) ?? new Map();
  assignments.set(event.signature, color);
  panelAssignments.set(event.panel, assignments);
  const merged = Array.from(assignments.values()).reduce((acc, value) => acc | value, 0);
  // Fade the panel's light to the merged color of all characters present
  toyPad.fade(event.panel, 10, 1, merged);
});

toyPad.on("remove", async (event) => {
  const assignments = panelAssignments.get(event.panel);
  if (!assignments) {
    return;
  }
  assignments.delete(event.signature);
  const merged = Array.from(assignments.values()).reduce((acc, value) => acc | value, 0);
  // Fade the panel's light to the merged color of all characters present
  toyPad.fade(event.panel, 10, 1, merged);
});
