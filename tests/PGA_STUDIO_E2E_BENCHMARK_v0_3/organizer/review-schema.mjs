const text = { type: 'string', minLength: 1, maxLength: 4000 };
const object = properties => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const fit = { enum: ['MEETS', 'NOT_YET', 'UNVERIFIED'] };
const candidate = object({ taskFit: fit, strength: text, concern: text,
  hierarchyReadability: text, structuralCoherence: text, visibleArtifacts: text });
export const reviewSchema = { $schema: 'https://json-schema.org/draft/2020-12/schema', ...object({
  schema: { const: 'pga-e2e-review/0.3' }, task: { enum: ['H', 'K', 'M', 'S'] },
  reviewerSlot: { enum: [1, 2] }, candidates: object({ X: candidate, Y: candidate }),
  pairwiseResult: { enum: ['X_PREFERRED', 'Y_PREFERRED', 'NO_MEANINGFUL_DIFFERENCE', 'BOTH_NOT_YET', 'UNVERIFIED'] },
  confidence: { enum: ['LOW', 'MEDIUM', 'HIGH', 'UNVERIFIED'] },
  actualViews: { type: 'array', minItems: 0, maxItems: 16, uniqueItems: true, items: { enum: ['X.png', 'Y.png', 'baseline.png', 'contact-sheet.png'] } },
  imageEvidence: { type: 'array', minItems: 0, maxItems: 16, items: object({
    view: { enum: ['X.png', 'Y.png', 'baseline.png', 'contact-sheet.png'] },
    sha256: { type: 'string', pattern: '^[a-f0-9]{64}$' }, callId: text, sessionId: text, modelContextId: text, modelInput: { const: true },
  }) }, keyEvidence: text,
}) };

export function reviewTemplate(task, reviewerSlot) {
  const item = () => ({ taskFit: 'UNVERIFIED', strength: '未验证', concern: '未验证', hierarchyReadability: '未验证', structuralCoherence: '未验证', visibleArtifacts: '未验证' });
  return { schema: 'pga-e2e-review/0.3', task, reviewerSlot, candidates: { X: item(), Y: item() },
    pairwiseResult: 'UNVERIFIED', confidence: 'UNVERIFIED', actualViews: [], imageEvidence: [], keyEvidence: '未验证' };
}

// 此 validator 只解释本 schema 使用的关键字；错误不含待评图像、答案或改判建议。
export function schemaErrors(value, schema = reviewSchema, path = '$') {
  const errors = [], add = expected => errors.push({ field: path, expected });
  if (schema.const !== undefined && value !== schema.const) add({ const: schema.const });
  if (schema.enum && !schema.enum.includes(value)) add({ enum: schema.enum });
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [{ field: path, expected: { type: 'object', fields: schema.required } }];
    for (const name of schema.required) if (!Object.hasOwn(value, name)) errors.push({ field: `${path}.${name}`, expected: schema.properties[name] });
    for (const name of Object.keys(value)) {
      if (!schema.properties[name]) errors.push({ field: `${path}.${name}`, expected: { allowedFields: Object.keys(schema.properties) } });
      else errors.push(...schemaErrors(value[name], schema.properties[name], `${path}.${name}`));
    }
  }
  if (schema.type === 'array') {
    if (!Array.isArray(value)) return [{ field: path, expected: { type: 'array', items: schema.items } }];
    if (value.length < schema.minItems || value.length > schema.maxItems) add({ minItems: schema.minItems, maxItems: schema.maxItems });
    if (schema.uniqueItems && new Set(value.map(v => JSON.stringify(v))).size !== value.length) add({ uniqueItems: true });
    value.forEach((v, i) => errors.push(...schemaErrors(v, schema.items, `${path}[${i}]`)));
  }
  if (schema.type === 'string' && (typeof value !== 'string' || value.length < (schema.minLength ?? 0) || value.length > (schema.maxLength ?? Infinity) || (schema.pattern && !new RegExp(schema.pattern).test(value)))) add(schema);
  return errors;
}
