#!/usr/bin/env node
// scripts/build-icons.mjs
//
// Reads brand/*.svg and produces platform app-icon files:
//   build/icon.icns            (macOS)
//   build/icon.ico             (Windows)
//   build/icon.png             (Linux, 512x512)
//   resources/tray/iconTemplate.png      (16x16 black-on-alpha)
//   resources/tray/iconTemplate@2x.png   (32x32 black-on-alpha)
//
// Run from the project root: `pnpm build:icons`.
// Requires macOS for the .icns step (`iconutil`).

import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, rm, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const ROOT = resolve(import.meta.dirname, '..');
const ICON_SVG = resolve(ROOT, 'brand/icon.svg');
const SYMBOL_SVG = resolve(ROOT, 'brand/symbol.svg');
const BUILD_DIR = resolve(ROOT, 'build');
const ICONSET_DIR = resolve(BUILD_DIR, 'icon.iconset');
const TRAY_DIR = resolve(ROOT, 'resources/tray');

// macOS .iconset naming convention.
const ICONSET_ENTRIES = [
  { size: 16,   name: 'icon_16x16.png' },
  { size: 32,   name: 'icon_16x16@2x.png' },
  { size: 32,   name: 'icon_32x32.png' },
  { size: 64,   name: 'icon_32x32@2x.png' },
  { size: 128,  name: 'icon_128x128.png' },
  { size: 256,  name: 'icon_128x128@2x.png' },
  { size: 256,  name: 'icon_256x256.png' },
  { size: 512,  name: 'icon_256x256@2x.png' },
  { size: 512,  name: 'icon_512x512.png' },
  { size: 1024, name: 'icon_512x512@2x.png' },
];

// Windows .ico entries — Windows Explorer picks the best size at runtime.
const ICO_SIZES = [16, 32, 48, 64, 128, 256];

async function rasterise(svgPath, size) {
  const svg = await readFile(svgPath);
  return sharp(svg, { density: 384 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

async function buildMacIconset() {
  await rm(ICONSET_DIR, { recursive: true, force: true });
  await mkdir(ICONSET_DIR, { recursive: true });
  for (const { size, name } of ICONSET_ENTRIES) {
    const buf = await rasterise(ICON_SVG, size);
    await writeFile(resolve(ICONSET_DIR, name), buf);
  }
}

function buildIcns() {
  const out = resolve(BUILD_DIR, 'icon.icns');
  try {
    execFileSync('iconutil', ['-c', 'icns', ICONSET_DIR, '-o', out], {
      stdio: 'inherit',
    });
  } catch (err) {
    throw new Error(
      'iconutil failed. This step only runs on macOS. ' +
      'On Linux/Windows hosts, skip `pnpm build:icons` or run it on a macOS machine and commit the generated files.',
      { cause: err }
    );
  }
}

async function buildIco() {
  const buffers = await Promise.all(
    ICO_SIZES.map((size) => rasterise(ICON_SVG, size))
  );
  const ico = await pngToIco(buffers);
  await writeFile(resolve(BUILD_DIR, 'icon.ico'), ico);
}

async function buildLinuxPng() {
  await copyFile(
    resolve(ICONSET_DIR, 'icon_256x256@2x.png'),   // 512 × 512
    resolve(BUILD_DIR, 'icon.png')
  );
}

async function rasteriseSymbolAsTemplate(size) {
  // Render the monochrome symbol with black strokes on transparent background.
  // macOS will invert automatically when tray image name ends with "Template".
  const svg = await readFile(SYMBOL_SVG, 'utf8');
  // currentColor in the source resolves to wherever the element inherits from.
  // We explicitly rewrite the root <svg> tag to set color:#000 so sharp
  // rasterises black strokes regardless of CSS context.
  const forcedBlack = svg.replace('<svg ', '<svg color="#000000" ');
  return sharp(Buffer.from(forcedBlack), { density: 1024 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

async function buildTrayTemplates() {
  const png16 = await rasteriseSymbolAsTemplate(16);
  const png32 = await rasteriseSymbolAsTemplate(32);
  await writeFile(resolve(TRAY_DIR, 'iconTemplate.png'), png16);
  await writeFile(resolve(TRAY_DIR, 'iconTemplate@2x.png'), png32);
}

async function main() {
  await mkdir(BUILD_DIR, { recursive: true });
  console.log('• Rasterising macOS iconset…');
  await buildMacIconset();
  console.log('• Packing .icns…');
  buildIcns();
  console.log('• Packing .ico…');
  await buildIco();
  console.log('• Copying Linux 512 PNG…');
  await buildLinuxPng();
  console.log('• Rendering tray template (16 + 32)…');
  await buildTrayTemplates();
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
