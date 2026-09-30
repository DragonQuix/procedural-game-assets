import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compose } from './state.mjs';
const root = resolve(process.argv[2]), arm = process.argv[3];
let state;
if (arm === 'A') {
  const source = await import(pathToFileURL(join(root, 'asset.mjs')));
  state = compose(await source.render());
} else if (arm === 'D14') {
  const api = await import(pathToFileURL(join(root, 'kit/src/studio/compiler.js')));
  const file = process.argv[4];
  let doc;
  if (file) doc = JSON.parse(await readFile(resolve(file), 'utf8'));
  else {
    const head = JSON.parse(await readFile(join(root, 'ws/head.json'), 'utf8')).head;
    doc = JSON.parse(await readFile(join(root, `ws/revisions/${head}.json`), 'utf8')).doc;
  }
  const full = api.compileStudioDocument(doc), layers = [];
  for (const n of full.document.nodes.toSorted((a, b) => a.layer - b.layer)) {
    const single = { ...full.document, schemaVersion: 'pga-studio/2', constraints: [], nodes: [n] };
    delete single.protection; delete single.relations;
    const f = api.compileStudioDocument(single).asset.frames[0];
    layers.push({ id: n.id, width: f.width, height: f.height, rgba: Array.from(f.rgba) });
  }
  const f = full.asset.frames[0];
  state = compose({ width: f.width, height: f.height, anchor: f.anchor, attachments: f.attachments, layers });
} else throw new Error('INVALID_ARM');
process.stdout.write(JSON.stringify(state));
