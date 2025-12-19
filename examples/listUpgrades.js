import { TagType, ToyPad } from "../dist/index.js";

const toyPad = new ToyPad();
await toyPad.connect();
console.log("ToyPad connected");

toyPad.on("add", async (event) => {
  // Once we've detected a tag, read it to figure out what it is
  const info = await toyPad.readTag(event.panel, event.signature);
  if (info.type !== TagType.Vehicle) {
    return;
  }
  // Get the vehicle's metadata
  const metadata = ToyPad.metadata.getVehicleById(info.id);
  // List all possible upgrades for this vehicle
  const upgradeIds = ToyPad.metadata.listVehicleUpgrades(info.id);
  // Read the current upgrades set on the tag
  const states = await toyPad.readVehicleUpgrades(event.panel, { signature: event.signature });
  const valueMap = new Map(states.map((state) => [state.id, state.value]));
  const isEnabled = (id) => {
    const value = valueMap.get(id);
    if (typeof value === "boolean") {
      return value;
    }
    return typeof value === "number" && value > 0;
  };
  console.log(`Vehicle: ${metadata?.name ?? info.id} (step ${metadata?.step ?? 0})`);
  console.log("Available upgrades:");
  console.log(upgradeIds.map((id) => `id=${id} label=${ToyPad.metadata.getUpgradeLabel(id) ?? id}`));
  console.log("Unlocked upgrades:");
  console.log(
    upgradeIds
      .filter((id) => isEnabled(id))
      .map((id) => `id=${id} value=${valueMap.get(id)} label=${ToyPad.metadata.getUpgradeLabel(id) ?? id}`)
  );
});
