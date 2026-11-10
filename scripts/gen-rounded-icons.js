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

/**
 * Android native splash uses maskable + background_color.
 * Pink full-bleed + white rounded logo tile ≈ HTML splash (avoids white-square flash).
 */
async function maskableSplashIcon(size, outName) {
  const tileRatio = 0.62;
  const tile = Math.round(size * tileRatio);
  const tilePad = Math.round((size - tile) / 2);
  const r = Math.round(tile * 0.255);
  const logoPad = Math.round(tile * 0.14);
  const logoSize = tile - logoPad * 2;

  const logo = await sharp(logoPath)
    .resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const whiteTile = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${tile}" height="${tile}">` +
      `<rect width="${tile}" height="${tile}" rx="${r}" ry="${r}" fill="#ffffff"/>` +
      `</svg>`
  );

  const tileImg = await sharp({
    create: {
      width: tile,
      height: tile,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: whiteTile, top: 0, left: 0 },
      { input: logo, top: logoPad, left: logoPad },
      {
        input: Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${tile}" height="${tile}">` +
            `<rect width="${tile}" height="${tile}" rx="${r}" ry="${r}" fill="#fff"/>` +
            `</svg>`
        ),
        blend: 'dest-in',
      },
    ])
    .png()
    .toBuffer();

  const out = path.join(dir, outName);
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 252, g: 18, b: 104, alpha: 1 }, // #fc1268
    },
  })
    .composite([{ input: tileImg, top: tilePad, left: tilePad }])
    .png()
    .toFile(out);

  console.log('wrote', outName, `${size}px maskable-pink-splash`);
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

  // Maskable = pink splash frame (Android system splash matches HTML splash)
  await maskableSplashIcon(192, 'pwa-icon-maskable-192.png');
  await maskableSplashIcon(512, 'pwa-icon-maskable-512.png');

  console.log('done');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
