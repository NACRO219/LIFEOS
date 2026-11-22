// Renders the LIFEOS icon/splash PNGs consumed by `npx capacitor-assets generate`.
import sharp from "sharp";
import fs from "node:fs";
const fg = fs.readFileSync("assets-src/foreground.svg");
const bg = fs.readFileSync("assets-src/background.svg");
await sharp(fg).resize(1024, 1024).png().toFile("assets/icon-foreground.png");
await sharp(bg).resize(1024, 1024).png().toFile("assets/icon-background.png");
const fgPng = await sharp(fg).resize(1024, 1024).png().toBuffer();
// Full icon with rounded corners (legacy launchers, web)
const mask = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024" rx="230" fill="#fff"/></svg>');
const full = await sharp(bg).resize(1024, 1024).composite([{ input: fgPng }]).png().toBuffer();
await sharp(full).composite([{ input: await sharp(mask).resize(1024, 1024).png().toBuffer(), blend: "dest-in" }]).png().toFile("assets/icon-only.png");
await sharp(full).resize(192, 192).png().toFile("public/icon-192.png");
fs.copyFileSync("assets-src/foreground.svg", "public/icon.svg");
// Splash: gradient with centered mark
const splashMark = await sharp(fg).resize(900, 900).png().toBuffer();
await sharp(bg).resize(2732, 2732).composite([{ input: splashMark, gravity: "center" }]).png().toFile("assets/splash.png");
await sharp({ create: { width: 2732, height: 2732, channels: 4, background: "#0b0f19" } }).composite([{ input: splashMark, gravity: "center" }]).png().toFile("assets/splash-dark.png");
console.log("icons rendered");
