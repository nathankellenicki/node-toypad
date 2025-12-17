import { ToyPad } from "../dist/index.js";

const toyPad = new ToyPad();

const panelStates = {
  [ToyPad.Panel.LEFT]: 0x0,
  [ToyPad.Panel.RIGHT]: 0x0,
  [ToyPad.Panel.CENTER]: 0x0
};

const colors = {
  "04 07 c9 52 99 40 81": 0xff0000, // Wyldstyle
  "04 fc f3 8a 71 40 80": 0x00ff00, // Batman
  "04 9f 1f 8a 71 40 80": 0x0000ff // Gandalf
};

await toyPad.connect();
console.log("ToyPad connected");

toyPad.on("disconnect", () => {
  console.log("ToyPad disconnected");
});

toyPad.on("error", (error) => {
  console.error("ToyPad connection error", error);
});

toyPad.on("add", async (event) => {
  const color = colors[event.signature];
  if (color === undefined) {
    console.log(`Unknown minifig on panel ${event.panel} (${event.signature})`);
    return;
  }
  console.log(`Minifig added to panel ${event.panel} (${event.signature})`);
  panelStates[event.panel] = (panelStates[event.panel] ?? 0) | color;
  try {
    await toyPad.fade(event.panel, 20, 1, panelStates[event.panel]);
  } catch (error) {
    console.error("Failed to apply color", error);
  }
});

toyPad.on("remove", async (event) => {
  const color = colors[event.signature];
  if (color === undefined) {
    console.log(`Unknown minifig removed from panel ${event.panel} (${event.signature})`);
    return;
  }
  console.log(`Minifig removed from panel ${event.panel} (${event.signature})`);
  panelStates[event.panel] = (panelStates[event.panel] ?? 0) ^ color;
  try {
    await toyPad.fade(event.panel, 15, 1, panelStates[event.panel]);
  } catch (error) {
    console.error("Failed to update color", error);
  }
});
