import { TagType, ToyPad } from "../dist/index.js";

const POLL_INTERVAL_MS = 10_000;
const panelNames = { 1: "Center", 2: "Left", 3: "Right" };

const toyPad = new ToyPad();
await toyPad.connect();
console.log("ToyPad connected, polling every 10s...\n");

async function poll() {
  const tags = await toyPad.listTags();
  const active = tags.filter((tag) => tag.status === "ok");

  if (active.length === 0) {
    console.log("No tags on pad.");
    return;
  }

  for (const tag of active) {
    try {
      const info = await toyPad.readTag(tag.panel, tag.index);
      const panel = panelNames[tag.panel] ?? tag.panel;

      if (info.type === TagType.Character) {
        const character = ToyPad.metadata.getCharacterById(info.id);
        console.log(`[${panel}] Character: ${character?.name ?? `Unknown (${info.id})`}`);
      } else {
        const vehicle = ToyPad.metadata.getVehicleById(info.id);
        console.log(`[${panel}] Vehicle: ${vehicle?.name ?? `Unknown (${info.id})`}`);
      }
    } catch (error) {
      const panel = panelNames[tag.panel] ?? tag.panel;
      console.log(`[${panel}] Failed to read tag in slot ${tag.index}: ${error.message}`);
    }
  }
}

await poll();
setInterval(poll, POLL_INTERVAL_MS);
