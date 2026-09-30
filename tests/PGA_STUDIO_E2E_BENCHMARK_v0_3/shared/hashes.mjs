import { createHash } from 'node:crypto';
export const canonical = v => v && typeof v === 'object' ? Array.isArray(v) ? `[${v.map(canonical).join(',')}]` : `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}` : JSON.stringify(v);
export const sha256 = value => createHash('sha256').update(value).digest('hex');
