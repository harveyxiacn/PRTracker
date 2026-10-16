// Renders the app icon SVG into the PNG sources used by the PWA and by
// `npx capacitor-assets generate` (Android/iOS launcher icons and splash screens).
import { mkdir, readFile } from 'node:fs/promises';
import sharp from 'sharp';

const RED = '#c8102e';
const svg = await readFile('public/icon.svg', 'utf8');
const leaf = /<path[^>]*\/>/.exec(svg)[0];
// Maple leaf on a transparent square, scaled to `scale` of the canvas and centered.
const leafOnly = (scale) => {
  const size = 512 * scale;
  const off = (512 - size) / 2;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><g transform="translate(${off} ${off}) scale(${scale})">${leaf}</g></svg>`);
};
const solid = (w, h, color) => sharp({ create: { width: w, height: h, channels: 4, background: color } }).png();

await mkdir('assets', { recursive: true });
await sharp(Buffer.from(svg)).resize(192, 192).png().toFile('public/icon-192.png');
await sharp(Buffer.from(svg)).resize(512, 512).png().toFile('public/icon-512.png');
// iOS/Android legacy icon: full-bleed red square with leaf (iOS masks corners itself).
await solid(1024, 1024, RED).composite([{ input: await sharp(leafOnly(0.78)).resize(1024, 1024).png().toBuffer() }]).toFile('assets/icon-only.png');
// Adaptive icon layers: keep the leaf inside the 66% safe zone.
await sharp(leafOnly(0.55)).resize(1024, 1024).png().toFile('assets/icon-foreground.png');
await solid(1024, 1024, RED).toFile('assets/icon-background.png');
for (const [name, bg] of [['splash.png', RED], ['splash-dark.png', '#121211']]) {
  await solid(2732, 2732, bg).composite([{ input: await sharp(leafOnly(0.6)).resize(600, 600).png().toBuffer(), gravity: 'center' }]).toFile(`assets/${name}`);
}
console.log('icons generated');
