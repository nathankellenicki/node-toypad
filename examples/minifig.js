import { TagType, ToyPad, getCharacterById, getVehicleById } from "../dist/index.js";
const panelAssignments = new Map();
const toyPad = new ToyPad();

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
    const metadata = getCharacterById(id);
    const label = `Minifig ${metadata.name} (${metadata.world})`;
    console.log(`${label} added to panel ${event.panel}`);
    panelAssignments.set(event.panel, { label, type });
  } else {
    const metadata = getVehicleById(id);
    const label = `Vehicle ${metadata.name} (${metadata.world})`;
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
