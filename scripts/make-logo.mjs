// One-off: turn the source JPG (green mascot on a white background) into the site's logo/favicon
// set. Removes the white background to transparent, trims the margin, pads to a square, and writes:
//   <out>/logo.png   512x512 transparent  → public/mascot.png + app/icon.png
//   <out>/apple.png  180x180 white bg     → app/apple-icon.png (iOS shows transparency as black)
// Usage: node scripts/make-logo.mjs <input.jpg> <outDir>
import sharp from 'sharp';

const [input, outDir] = process.argv.slice(2);
if (!input || !outDir) {
  console.error('usage: node scripts/make-logo.mjs <input.jpg> <outDir>');
  process.exit(1);
}

// 1. Read raw RGBA and knock out the near-white background with a soft edge (reduces the halo the
//    JPG's anti-aliased outline would otherwise leave). The mascot's lightest colour is a saturated
//    yellow (low blue channel), so keying on min(r,g,b) never eats into the character.
const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const HI = 245; // >= this brightness → fully transparent
const LO = 225; // <= this → fully opaque; between = ramp
for (let i = 0; i < data.length; i += 4) {
  const minc = Math.min(data[i], data[i + 1], data[i + 2]);
  data[i + 3] = minc >= HI ? 0 : minc <= LO ? 255 : Math.round((255 * (HI - minc)) / (HI - LO));
}

// 2. Trim the transparent margin so the character fills the frame, then pad back to a square with a
//    small transparent margin.
const keyed = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
  .png()
  .trim()
  .toBuffer();
const m = await sharp(keyed).metadata();
const side = Math.max(m.width, m.height);
const margin = Math.round(side * 0.07);
const square = side + margin * 2;
const centered = await sharp(keyed)
  .resize(square, square, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();

// 3. Emit the transparent logo/favicon and the white-backed apple icon.
await sharp(centered).resize(512, 512).png().toFile(`${outDir}/logo.png`);
await sharp(centered).flatten({ background: '#ffffff' }).resize(180, 180).png().toFile(`${outDir}/apple.png`);
console.log('wrote logo.png (512, transparent) and apple.png (180, white bg) to', outDir);
