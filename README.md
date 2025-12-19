# node-toypad - A JavaScript module to control the LEGO Dimensions ToyPad

### Installation

Node.js v22.0+ required.

`npm install node-toypad --save`

### Reading tags

```js
import { ToyPad, TagType } from "node-toypad";

const toyPad = new ToyPad();

toyPad.on("add", async (event) => {
  const { id, type } = await toyPad.readTag(event.panel, event.signature);
  if (type === TagType.Character) {
    const character = ToyPad.metadata.getCharacterById(id);
    console.log(`Character ${character?.name ?? id}`);
  } else {
    const vehicle = ToyPad.metadata.getVehicleById(id);
    console.log(`Vehicle ${vehicle?.name ?? id}`);
  }
});

await toyPad.connect();
```

More examples are available in the `examples` directory.
