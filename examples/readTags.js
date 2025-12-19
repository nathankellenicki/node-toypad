import { TagType, ToyPad } from "../dist/index.js";

const toyPad = new ToyPad();
const activeAssignments = new Map();
await toyPad.connect();
console.log("ToyPad connected");

toyPad.on("add", async (event) => {
  // Once we've detected a tag, read it to figure out what it is
  const info = await toyPad.readTag(event.panel, event.signature);
  if (info.type === TagType.Character) {
    // Fetch the character's metadata
    const character = ToyPad.metadata.getCharacterById(info.id);
    console.log(`Character: ${character?.name ?? info.id} (${character?.world ?? "Unknown"}) added to panel ${event.panel} (${event.signature})`);
    // Keep track of the metadata for each tag
    activeAssignments.set(event.signature, {
      type: "Character",
      name: character?.name ?? info.id,
      world: character?.world ?? "Unknown"
    });
  } else {
    // Fetch the vehicle's metadata
    const vehicle = ToyPad.metadata.getVehicleById(info.id);
    console.log(`Vehicle: ${vehicle?.name ?? info.id} (${vehicle?.world ?? "Unknown"}) added to panel ${event.panel} (${event.signature})`);
    // Fetch what upgrades are currently on the vehicle
    const upgrades = await toyPad.readVehicleUpgrades(event.panel, { signature: event.signature });
    // Fetch the upgrade metadata
    const upgradeLabels = new Map(upgrades.map((slot) => [ToyPad.metadata.getUpgradeLabel(slot.id) ?? slot.id, slot.value]));
    console.log("Upgrades:", Object.fromEntries(upgradeLabels));
    // Keep track of the metadata for each tag
    activeAssignments.set(event.signature, {
      type: "Vehicle",
      name: vehicle?.name ?? info.id,
      world: vehicle?.world ?? "Unknown"
    });
  }
});

toyPad.on("remove", (event) => {
  // Lookup the metadata we stored when the tag was added
  const info = activeAssignments.get(event.signature);
  if (info) {
    console.log(`${info.type}: ${info.name} (${info.world}) removed from panel ${event.panel} (${event.signature})`);
  } else {
    console.log(`Tag removed from panel ${event.panel} (${event.signature})`);
  }
  activeAssignments.delete(event.signature);
});
