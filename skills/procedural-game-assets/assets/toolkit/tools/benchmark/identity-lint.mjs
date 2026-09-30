/** Agent-facing material only. Geometry implementation is deliberately out of scope. */
const PHRASES = /\b(?:left|right)[\s-]+(?:candidate|image|option|object|panel|frame|region|node)s?\b|\b(?:candidate|image|option|object|panel|frame|region|node)s?\s+on\s+the\s+(?:left|right)\b|左图|右图|左候选|右候选|左边那个|右边那个|左侧候选|右侧候选|左侧对象|右侧对象|左边是什么|右边是什么|\b(?:leftCandidate|rightCandidate|leftImage|rightImage)\b/gi;
const SPATIAL_REVIEW = /\b(?:left|right)\b|左侧|右侧|左边|右边/gi;

export function lintIdentityText(text, { file = '<text>', kind = 'participant', allow = [] } = {}) {
  const issues = [], used = new Set();
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const patterns = kind === 'reviewer' || kind === 'vision' ? [PHRASES, SPATIAL_REVIEW] : [PHRASES];
    for (const pattern of patterns) for (const match of line.matchAll(pattern)) {
      const exception = allow.find((a) => a.line === index + 1 && a.phrase === match[0] && typeof a.reason === 'string' && a.reason.trim().length >= 8 &&
        typeof a.objectId === 'string' && /^(?:Node |Object |Image |Frame |node\.|object\.)[A-Za-z0-9._-]+$/.test(a.objectId) && line.includes(a.objectId));
      if (exception) used.add(exception);
      else issues.push({ file, line: index + 1, phrase: match[0], code: 'SPATIAL_IDENTITY' });
    }
  }
  for (const a of allow) if (!used.has(a)) issues.push({ file, line: a.line, code: 'INVALID_OR_UNUSED_ALLOWLIST' });
  return [...new Map(issues.map((i) => [JSON.stringify(i), i])).values()];
}

export function assertIdentityMaterials(materials) {
  const issues = materials.flatMap(({ text, ...options }) => lintIdentityText(text, options));
  if (issues.length) { const error = new Error('Agent-facing material violates symbolic identity'); error.code = 'IDENTITY_LINT_FAILED'; error.details = issues; throw error; }
  return { status: 'PASS', filesChecked: materials.map((m) => m.file) };
}
