import { ToyPad } from "../dist/index.js";

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
  console.log(`Minifig added to panel ${event.panel} (${event.signature})`);
  try {
    await toyPad.setColor(event.panel, 0x00ff00);
  } catch (error) {
    console.error("Unable to set color", error);
  }
});

toyPad.on("remove", async (event) => {
  console.log(`Minifig removed from panel ${event.panel} (${event.signature})`);
  try {
    await toyPad.setColor(event.panel, 0x000000);
  } catch (error) {
    console.error("Unable to clear color", error);
  }
});
