# node-toypad - A JavaScript module to control the LEGO Dimensions Toy Pad

### Installation

Node.js v22.0+ required.

`npm install node-toypad --save`

### Example

```js
import { ToyPad, TagType } from "node-toypad";

const toyPad = new ToyPad();
const metadata = ToyPad.metadata;

toyPad.on("connect", () => {
  console.log("ToyPad ready!");
});

toyPad.on("add", async (event) => {
  const { id, type } = await toyPad.readTag(event.panel);
  if (type === TagType.Character) {
    const info = metadata.getCharacterById(id);
    console.log(`Character detected on panel ${event.panel}: ${info?.name ?? `#${id}`}`);
  } else {
    const info = metadata.getVehicleById(id);
    console.log(`Vehicle detected on panel ${event.panel}: ${info?.name ?? `#${id}`}`);
  }
});

toyPad.on("remove", (event) => {
  console.log(`Tag removed from panel ${event.panel}`);
});

(async () => {
  await toyPad.connect();
})();
```

More examples are available in the `examples` directory.
