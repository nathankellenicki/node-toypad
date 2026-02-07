import { ToyPad } from "../dist/index.js";

const panels = [ToyPad.Panel.Center, ToyPad.Panel.Left, ToyPad.Panel.Right];

const toyPad = new ToyPad();
await toyPad.connect();
console.log("ToyPad connected");

setInterval(() => {
  const panel = panels[Math.floor(Math.random() * panels.length)];
  const color = Math.floor(Math.random() * 0xffffff);
  toyPad.setColor(panel, color);
}, 5);
