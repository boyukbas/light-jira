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

const SIZES = [16, 48, 128, 192, 512];
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
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1e1b4b"/>
    </linearGradient>
    <linearGradient id="cGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#a5b4fc"/>
    </linearGradient>
    <radialGradient id="glow" cx="40%" cy="50%" r="60%">
      <stop offset="0%" stop-color="#6366f1" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#6366f1" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <!-- Background -->
  <rect width="128" height="128" rx="24" fill="url(#bg)"/>
  <!-- Subtle glow -->
  <ellipse cx="50" cy="64" rx="44" ry="44" fill="url(#glow)"/>
  <!-- C arc -->
  <path d="M 69 43 A 30 30 0 1 0 69 85"
        fill="none" stroke="url(#cGrad)" stroke-width="13" stroke-linecap="round"/>
  <!-- Ticket lines -->
  <line x1="74" y1="53" x2="105" y2="53" stroke="white" stroke-width="5.5" stroke-linecap="round" opacity="0.95"/>
  <line x1="74" y1="64" x2="112" y2="64" stroke="white" stroke-width="5.5" stroke-linecap="round" opacity="0.55"/>
  <line x1="74" y1="75" x2="98"  y2="75" stroke="white" stroke-width="5.5" stroke-linecap="round" opacity="0.28"/>
  <!-- Amber accent dot -->
  <circle cx="69" cy="43" r="5.5" fill="#fbbf24"/>
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
