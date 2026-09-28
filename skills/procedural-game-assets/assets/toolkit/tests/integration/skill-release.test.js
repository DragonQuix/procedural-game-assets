import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { access, cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyTree } from '../../tools/release-manifest.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const skill = join(root, 'skills/procedural-game-assets');
const available = existsSync(join(skill, 'assets/toolkit/.pga-release.json'));

test('普通技能可独立携带：视觉标准随清单发行，入口与诊断链接均在包内可读', {
  skip: !available && '仅在开发仓库验证完整技能发行包',
}, async (t) => {
  const temp = await mkdtemp(join(tmpdir(), 'pga-skill-guide-'));
  t.after(() => rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 }));
  const copied = join(temp, 'portable/procedural-game-assets');
  await cp(skill, copied, { recursive: true });
  const toolkit = join(copied, 'assets/toolkit');
  assert.equal(await verifyTree(toolkit), null);
  const manifest = JSON.parse(await readFile(join(toolkit, '.pga-release.json'), 'utf8'));
  assert.ok(manifest.files['docs/visual-quality.md'], '视觉标准必须在发行清单内');
  // 开发文档可能经 autocrlf 转换；载荷精确字节已由 verifyTree 校验。
  assert.equal((await readFile(join(toolkit, 'docs/visual-quality.md'), 'utf8')).replaceAll('\r\n', '\n'),
    (await readFile(join(root, 'docs/visual-quality.md'), 'utf8')).replaceAll('\r\n', '\n'));
  const packaged = JSON.parse(await readFile(join(toolkit, 'package.json'), 'utf8'));
  assert.equal(manifest.generator, `${packaged.name}@${packaged.version}`);

  for (const rel of ['SKILL.md', 'reference/visual-diagnosis.md', 'assets/toolkit/docs/visual-quality.md']) {
    const file = join(copied, rel);
    const text = await readFile(file, 'utf8');
    const links = [...text.matchAll(/\[[^\]]*\]\(([^)]+\.md)(?:#[^)]*)?\)/g)];
    assert.ok(links.length > 0, `${rel} 应能继续导航到包内标准或上下文`);
    for (const [, target] of links) {
      const resolved = resolve(dirname(file), target);
      const inside = relative(copied, resolved);
      assert.ok(inside !== '..' && !inside.startsWith(`..${sep}`) && !isAbsolute(inside),
        `${rel} 链接不得依赖包外目录：${target}`);
      await access(resolved);
    }
  }
});
