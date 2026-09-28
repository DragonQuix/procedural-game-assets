/**
 * tests/unit/studio-document.test.js — Studio 文档 v1：校验、规范化、稳定哈希
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateStudioDocument,
  normalizeStudioDocument,
  StudioDocumentError,
  stableStringify,
  fnv1aHex,
  documentHash,
  styleHash,
} from '../../src/studio/document.js';

const here = dirname(fileURLToPath(import.meta.url));
const sample = JSON.parse(readFileSync(join(here, '../../examples/studio/terminal.studio.json'), 'utf8'));

const codes = (doc) => validateStudioDocument(doc).map((i) => `${i.target}|${i.code}|${i.message}`);

test('合法样例：零问题，规范化填默认值且不改动输入', () => {
  assert.deepEqual(validateStudioDocument(sample), []);
  const before = JSON.stringify(sample);
  const norm = normalizeStudioDocument(sample);
  assert.equal(JSON.stringify(sample), before, '规范化不得改动输入文档');
  assert.equal(norm.canvas.outline, '#120d16');
  assert.deepEqual(norm.anchor, { x: 15, y: 28 });
  assert.equal(norm.nodes[0].layer, 0);
  assert.equal(norm.schemaVersion, 'pga-studio/1');
});

test('规范化缺省值：outline 缺省给默认描边色，anchor 缺省为底边中点，layer 缺省为下标', () => {
  const doc = structuredClone(sample);
  delete doc.canvas.outline;
  delete doc.anchor;
  delete doc.nodes[1].layer;
  const norm = normalizeStudioDocument(doc);
  assert.equal(norm.canvas.outline, '#120d16');
  assert.deepEqual(norm.anchor, { x: 15, y: 30 });
  assert.equal(norm.nodes[1].layer, 1);
});

test('拒绝：未知 schemaVersion，且不继续猜测其余字段', () => {
  const doc = { ...structuredClone(sample), schemaVersion: 'pga-studio/3' };
  const issues = validateStudioDocument(doc);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].target, 'schemaVersion');
});

test('拒绝：重复节点 ID / 非法节点 ID', () => {
  const dup = structuredClone(sample);
  dup.nodes[1].id = 'terminal.base';
  assert.ok(codes(dup).some((c) => c.includes('nodes[1]') && c.includes('INVALID_DOCUMENT')));
  const flat = structuredClone(sample);
  flat.nodes[0].id = 'shell';
  assert.ok(codes(flat).some((c) => c.includes('.id')));
});

test('拒绝：引用不存在的色阶 / 类型不支持的材料 / 未知几何类型', () => {
  const noRamp = structuredClone(sample);
  noRamp.nodes[0].ramp = 'ghost';
  assert.ok(codes(noRamp).some((c) => c.includes('ramp')));
  const noMat = structuredClone(sample);
  noMat.nodes[2].material = 'bevel-metal'; // screen 不支持
  assert.ok(codes(noMat).some((c) => c.includes('UNSUPPORTED_OPERATION')));
  const noKind = structuredClone(sample);
  noKind.nodes[0].kind = 'sprite';
  assert.ok(codes(noKind).some((c) => c.includes('UNSUPPORTED_OPERATION')));
});

test('拒绝：非整数/非有限数值与越界几何', () => {
  const nan = structuredClone(sample);
  nan.nodes[0].w = Number.NaN;
  assert.ok(codes(nan).some((c) => c.includes('.w')));
  const frac = structuredClone(sample);
  frac.nodes[0].x = 2.5;
  assert.ok(codes(frac).some((c) => c.includes('.x')));
  const overflow = structuredClone(sample);
  overflow.nodes[1].x = 10; // 10+26 > 30，单字段均在范围内但组合越界
  assert.ok(codes(overflow).some((c) => c.includes('超出内画布')));
  const badSeed = structuredClone(sample);
  badSeed.seed = 'abc';
  assert.ok(codes(badSeed).some((c) => c.startsWith('seed')));
});

test('拒绝：非法画布尺寸（过小/过大/非整数）', () => {
  for (const [w, h] of [[1, 30], [30, 0], [513, 30], [30, 30.5]]) {
    const doc = structuredClone(sample);
    doc.canvas.w = w;
    doc.canvas.h = h;
    assert.ok(validateStudioDocument(doc).length > 0, `尺寸 ${w}×${h} 应被拒绝`);
  }
});

test('拒绝：未知字段（白名单）', () => {
  const doc = structuredClone(sample);
  doc.draw = 'painter => painter.rect(...)'; // 任何形式的可执行内容都不允许
  assert.ok(codes(doc).some((c) => c.includes('未知字段')));
  const nodeExtra = structuredClone(sample);
  nodeExtra.nodes[0].script = 'evil.js';
  assert.ok(codes(nodeExtra).some((c) => c.includes('未知字段')));
});

test('拒绝：原型链污染相关危险键（ramp 名 / 附件点名 / 未知字段）', () => {
  const doc1 = structuredClone(sample);
  doc1.style = { id: 's', version: 1, ramps: JSON.parse('{"steel":["#000000","#111111","#222222","#333333"],"__proto__":["#000000","#111111","#222222","#333333"]}') };
  doc1.nodes = doc1.nodes.map((n) => (n.ramp === 'amber' ? { ...n, ramp: 'steel' } : n));
  assert.ok(validateStudioDocument(doc1).some((i) => i.code === 'UNSAFE_PATH'));
  const doc2 = structuredClone(sample);
  doc2.attachments = JSON.parse('{"__proto__":{"x":1,"y":1}}');
  assert.ok(validateStudioDocument(doc2).some((i) => i.code === 'UNSAFE_PATH'));
});

test('拒绝：非法色阶（级数/颜色格式）与非法附件点', () => {
  const short = structuredClone(sample);
  short.style.ramps.steel = ['#000000', '#111111', '#222222'];
  assert.ok(codes(short).some((c) => c.includes('ramps.steel')));
  const badHex = structuredClone(sample);
  badHex.style.ramps.steel = ['#000000', '#111111', '#222222', 'red'];
  assert.ok(codes(badHex).some((c) => c.includes('ramps.steel')));
  const badAtt = structuredClone(sample);
  badAtt.attachments.screenCenter = { x: 99, y: 1 };
  assert.ok(codes(badAtt).some((c) => c.includes('attachments')));
});

test('拒绝：非法保护项（未知类别 / 像素保护指向未声明节点）', () => {
  const doc = structuredClone(sample);
  doc.constraints = [{ kind: 'magic', target: 'anchor' }];
  assert.ok(codes(doc).some((c) => c.includes('constraints[0].kind')));
  const doc2 = structuredClone(sample);
  doc2.constraints = [{ kind: 'pixels', target: 'terminal.ghost' }];
  assert.ok(codes(doc2).some((c) => c.includes('constraints[0].target')));
});

test('normalizeStudioDocument 对非法文档抛 StudioDocumentError（带结构化 issues）', () => {
  const doc = structuredClone(sample);
  doc.nodes[0].ramp = 'ghost';
  assert.throws(() => normalizeStudioDocument(doc), (e) => {
    assert.ok(e instanceof StudioDocumentError);
    assert.equal(e.code, 'INVALID_DOCUMENT');
    assert.ok(Array.isArray(e.issues) && e.issues.length > 0);
    return true;
  });
});

test('稳定哈希：键序无关、内容敏感、跨调用确定', () => {
  const norm = normalizeStudioDocument(sample);
  const deepReverse = (v) => (Array.isArray(v) ? v.map(deepReverse) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().reverse().map((k) => [k, deepReverse(v[k])])) : v);
  assert.equal(documentHash(normalizeStudioDocument(deepReverse(structuredClone(sample)))), documentHash(norm));
  const changed = structuredClone(sample);
  changed.style.ramps.steel[1] = '#495260';
  assert.notEqual(documentHash(normalizeStudioDocument(changed)), documentHash(norm));
  assert.equal(styleHash(norm), fnv1aHex(stableStringify(norm.style)));
  assert.match(documentHash(norm), /^[0-9a-f]{8}$/);
});

test('stableStringify：对象键排序、数组保序', () => {
  assert.equal(stableStringify({ b: 1, a: [2, 1] }), '{"a":[2,1],"b":1}');
  assert.equal(stableStringify('x'), '"x"');
});
