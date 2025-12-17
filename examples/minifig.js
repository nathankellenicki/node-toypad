import { TagType, ToyPad } from "../dist/index.js";
const panelAssignments = new Map();
const toyPad = new ToyPad();
const metadata = ToyPad.metadata;

function assignmentKey(panel, signature) {
  return `${panel}:${signature.trim().toLowerCase()}`;
}

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
  const { id, type, signature } = await toyPad.readTag(event.panel, event.signature);
  if (type === TagType.Character) {
    const info = metadata.getCharacterById(id);
    const label = info ? `Minifig ${info.name} (${info.world})` : `Unknown minifig #${id}`;
    console.log(`${label} added to panel ${event.panel} (${signature})`);
    panelAssignments.set(assignmentKey(event.panel, signature), { label, type, signature });
  } else {
    const info = metadata.getVehicleById(id);
    const label = info ? `Vehicle ${info.name} (${info.world})` : `Unknown vehicle #${id}`;
    console.log(`${label} added to panel ${event.panel} (${signature})`);
    panelAssignments.set(assignmentKey(event.panel, signature), { label, type, signature });
  }
});

toyPad.on("remove", async (event) => {
  const assignment = panelAssignments.get(assignmentKey(event.panel, event.signature));
  const label = assignment?.label ?? "Unknown tag";
  if (assignment) {
    panelAssignments.delete(assignmentKey(event.panel, event.signature));
  }
  console.log(`${label} removed from panel ${event.panel} (${event.signature})`);
  await toyPad.setColor(event.panel, 0x000000);
});
