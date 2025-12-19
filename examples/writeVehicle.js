import { ToyPad, VehicleId } from "../dist/index.js";

const toyPad = new ToyPad();
await toyPad.connect();
console.log("ToyPad connected");

toyPad.on("add", async (event) => {
  // Program the tag to be the Harry Potter Enchanted Car
  await toyPad.writeVehicle(event.panel, VehicleId.EnchantedCar, { step: 0, signature: event.signature });
  // Read the tag back to confirm
  const info = await toyPad.readTag(event.panel, event.signature);
  // Fetch the vehicle's metadata
  const metadata = ToyPad.metadata.getVehicleById(info.id);
  console.log(`Programmed ${metadata?.name ?? info.id} step ${metadata?.step ?? 0}`);
});
