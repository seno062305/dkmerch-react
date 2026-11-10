const sharp = require('sharp');
const path = require('path');

const dir = path.join(__dirname, '..', 'public', 'images');
const logoPath = path.join(dir, 'dklogo2-removebg-preview.png');

async function roundedIcon(size, radiusRatio, outName, padRatio) {
  const r = Math.round(size * radiusRatio);
  const pad = Math.round(size * (padRatio || 0.14));
  const logoSize = size - pad * 2;
  const logo = await sharp(logoPath)
    .resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
      `<rect x="0" y="0" width="${size}" height="${size}" rx="${r}" ry="${r}" fill="#ffffff"/>` +
      `</svg>`
  );

  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
      `<rect x="0" y="0" width="${size}" height="${size}" rx="${r}" ry="${r}" fill="#fff"/>` +
      `</svg>`
  );

  const out = path.join(dir, outName);
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: svg, top: 0, left: 0 },
      { input: logo, top: pad, left: pad },
      { input: mask, blend: 'dest-in' },
    ])
    .png()
    .toFile(out);

  console.log('wrote', outName, `${size}px r=${r}`);
}

/** Full-bleed white square for maskable — OS won't fill pink into transparent corners */
async function maskableIcon(size, outName, padRatio) {
  const pad = Math.round(size * (padRatio || 0.18));
  const logoSize = size - pad * 2;
  const logo = await sharp(logoPath)
    .resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const out = path.join(dir, outName);
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([{ input: logo, top: pad, left: pad }])
    .png()
    .toFile(out);

  console.log('wrote', outName, `${size}px maskable-white`);
}

(async () => {
  // Tab favicon: higher radius (near-circle) so it doesn't look square
  await roundedIcon(32, 0.42, 'favicon-32.png', 0.14);
  await roundedIcon(48, 0.42, 'favicon-48.png', 0.14);
  await roundedIcon(64, 0.4, 'favicon-64.png', 0.14);

  // "any" icons = splash-style white rounded tile
  const splashRatio = 0.255;
  await roundedIcon(192, splashRatio, 'pwa-icon-192.png', 0.14);
  await roundedIcon(512, splashRatio, 'pwa-icon-512.png', 0.14);
  await roundedIcon(512, splashRatio, 'pwa-splash-512.png', 0.14);

  // Maskable = full white (Windows Start uses this; avoids pink fill)
  await maskableIcon(192, 'pwa-icon-maskable-192.png', 0.18);
  await maskableIcon(512, 'pwa-icon-maskable-512.png', 0.18);

  console.log('done');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
