import { TagType, ToyPad } from "../dist/index.js";
const panelAssignments = new Map();
const toyPad = new ToyPad();
const metadata = ToyPad.metadata;

await toyPad.connect();
console.log("ToyPad connected");

toyPad.on("disconnect", () => {
  console.log("ToyPad disconnected");
});

toyPad.on("error", (error) => {
  console.error("ToyPad error", error);
});

toyPad.on("add", async (event) => {
  let color = 0xff0000;
  await toyPad.setColor(event.panel, color);
  const { id, type } = await toyPad.readTag(event.panel);
  if (type === TagType.Character) {
    const info = metadata.getCharacterById(id);
    const label = info ? `Minifig ${info.name} (${info.world})` : `Unknown minifig #${id}`;
    console.log(`${label} added to panel ${event.panel}`);
    panelAssignments.set(event.panel, { label, type });
  } else {
    const info = metadata.getVehicleById(id);
    const label = info ? `Vehicle ${info.name} (${info.world})` : `Unknown vehicle #${id}`;
    console.log(`${label} added to panel ${event.panel}`);
    panelAssignments.set(event.panel, { label, type });
  }
});

toyPad.on("remove", async (event) => {
  const assignment = panelAssignments.get(event.panel);
  const label = assignment?.label ?? "Unknown tag";
  if (assignment) {
    panelAssignments.delete(event.panel);
  }
  console.log(`${label} removed from panel ${event.panel}`);
  await toyPad.setColor(event.panel, 0x000000);
});
