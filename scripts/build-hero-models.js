#!/usr/bin/env node
/**
 * Make the hero's drink models light enough for the web.
 *
 *   npm run hero:models
 *
 * models/hero/<name>.raw.glb   as they came from Meshy: one textured mesh
 *                              each, 8K textures, 30-45 MB (not in git)
 *   -> public/models/hero/<name>.glb
 *        fewer triangles (meshoptimizer), textures down to 2K/1K WebP, and
 *        the geometry meshopt-compressed (EXT_meshopt_compression; three.js
 *        decodes it with the MeshoptDecoder it ships with).
 *
 * Fixes on the way:
 *   - Meshy marks parts of each drink as metal in the metal/roughness
 *     texture, which makes them mirror the backdrop like chrome. A drink has
 *     no metal: metalness is set to 0.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, quantize, reorder, simplify, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'models', 'hero');
const OUT = path.join(ROOT, 'public', 'models', 'hero');

// Triangles to aim for: enough for the silhouette and the cream's curls at
// the size the hero shows them
const MODELS = {
  'iced-mocha': { triangles: 28_000 },
  'cloudtop-latte': { triangles: 24_000 },
};

const BUDGET = 600_000; // bytes per model

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

function triangles(doc) {
  let n = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) n += (prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION').getCount()) / 3;
  }
  return n;
}

async function build(name, opts, io) {
  const doc = await io.read(path.join(SRC, `${name}.raw.glb`));
  const before = triangles(doc);

  for (const mat of doc.getRoot().listMaterials()) {
    mat.setMetallicFactor(0);
  }

  await doc.transform(
    dedup(),
    weld(),
    simplify({ simplifier: MeshoptSimplifier, ratio: Math.min(1, opts.triangles / before), error: 0.003 }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /^baseColor/, resize: [1024, 1024], quality: 80 }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /^normal/, resize: [512, 512], quality: 82 }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /^metallicRoughness/, resize: [256, 256], quality: 80 }),
    prune(),
    reorder({ encoder: MeshoptEncoder }),
    quantize(),
  );
  doc.createExtension(EXTMeshoptCompression)
    .setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });

  const out = path.join(OUT, `${name}.glb`);
  await io.write(out, doc);
  const size = fs.statSync(out).size;
  console.log(`${name}: ${Math.round(before).toLocaleString()} -> ${Math.round(triangles(doc)).toLocaleString()} triangles, ${kb(size)}${size > BUDGET ? `  OVER BUDGET (${kb(BUDGET)})` : ''}`);
  return size;
}

async function main() {
  await MeshoptSimplifier.ready;
  await MeshoptEncoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  fs.mkdirSync(OUT, { recursive: true });
  let total = 0;
  for (const [name, opts] of Object.entries(MODELS)) total += await build(name, opts, io);
  console.log(`both: ${kb(total)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
