/**
 * Generates extension/icons/icon{16,48,128}.png
 * Uses Playwright (already a dev dependency) — no extra packages needed.
 *
 * Run: node extension/generate-icons.js
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { chromium } = require('@playwright/test');

const SIZES = [16, 48, 128];
const OUT_DIR = path.join(__dirname, 'icons');

const html = (size) => `<!DOCTYPE html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${size}px; height: ${size}px; overflow: hidden; background: transparent; }
</style>
</head>
<body>
<svg xmlns="http://www.w3.org/2000/svg"
     width="${size}" height="${size}" viewBox="0 0 128 128">
  <!-- Rounded dark background -->
  <rect width="128" height="128" rx="28" fill="#1a0a2e"/>
  <!-- Purple glow halo -->
  <ellipse cx="64" cy="68" rx="36" ry="30" fill="#9d4edd" opacity="0.18"/>
  <!-- Lightning bolt -->
  <path d="M74 12 L34 70 H58 L54 116 L94 58 H70 Z"
        fill="#9d4edd"/>
  <!-- Highlight on bolt -->
  <path d="M74 12 L54 55 H70 L74 12Z"
        fill="#c77dff" opacity="0.6"/>
</svg>
</body>
</html>`;

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR);

  const browser = await chromium.launch();

  for (const size of SIZES) {
    const page = await browser.newPage();
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(html(size), { waitUntil: 'load' });
    const outPath = path.join(OUT_DIR, `icon${size}.png`);
    await page.screenshot({ path: outPath, omitBackground: true });
    await page.close();
    console.log(`  ✓  icon${size}.png`);
  }

  await browser.close();
  console.log('\nIcons written to extension/icons/');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
