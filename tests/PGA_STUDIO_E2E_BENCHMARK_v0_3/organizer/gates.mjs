import { canonical, sha256 } from '../shared/accounting.mjs';

const policies = ['EXACT_REQUIRED', 'FREEZE_ACTUAL'];
const validActual = actual => actual && typeof actual.model === 'string' && actual.model.length > 0 &&
  typeof actual.host === 'string' && actual.host.length > 0 && Object.hasOwn(actual, 'version') && Object.hasOwn(actual, 'reasoning') &&
  actual.source === 'host-api' && typeof actual.attestationId === 'string' && actual.attestationId.length > 0;
const identity = actual => ({ model: actual.model, host: actual.host, version: actual.version, reasoning: actual.reasoning });

// 供 ZCode 在第一个正式 run 之前调用；本轮只测试合成身份，不冻结真实宿主。
export function freezeModelIdentity({ policy, requestedModel, actual, executionStarted = false }) {
  if (executionStarted || !policies.includes(policy) || typeof requestedModel !== 'string' || !requestedModel || !validActual(actual)) throw new Error('MODEL_FREEZE_BLOCKED');
  if (policy === 'EXACT_REQUIRED' && requestedModel !== actual.model) throw new Error('MODEL_IDENTITY_MISMATCH');
  const frozen = { policy, requestedModel, actual: identity(actual), evidence: { source: actual.source, attestationId: actual.attestationId }, frozenBeforeFirstRun: true };
  return { ...frozen, sha256: sha256(canonical(frozen)) };
}

export function modelIdentityGate(frozen, actual) {
  if (!frozen || !validActual(actual)) return { status: 'FAIL', reason: 'MODEL_IDENTITY_NOT_FROZEN' };
  const { sha256: hash, ...body } = frozen;
  if (!policies.includes(body.policy) || !body.frozenBeforeFirstRun || hash !== sha256(canonical(body))) return { status: 'FAIL', reason: 'INVALID_MODEL_FREEZE' };
  if ((body.policy === 'EXACT_REQUIRED' && body.requestedModel !== actual.model) || canonical(body.actual) !== canonical(identity(actual))) return { status: 'FAIL', reason: 'MODEL_IDENTITY_MISMATCH' };
  return { status: 'PASS', policy: body.policy, requestedModel: body.requestedModel, actual: identity(actual) };
}

export function imageEvidenceGate({ expectedImages, hostEvents, context, actualViews = Object.keys(expectedImages) }) {
  if (!context?.modelContextId || !context?.sessionId || !Object.keys(expectedImages).length) return { status: 'UNVERIFIED' };
  const confirmed = Object.entries(expectedImages).every(([view, hash]) => actualViews.includes(view) && hostEvents.some(e =>
    e.source === 'host-transcript' && e.kind === 'image-input' && e.success === true && e.modelInput === true && e.view === view &&
    e.sha256 === hash && /^[a-f0-9]{64}$/.test(hash) && e.modelContextId === context.modelContextId && e.sessionId === context.sessionId && typeof e.callId === 'string' && e.callId.length > 0));
  return { status: confirmed ? 'PASS' : 'UNVERIFIED' };
}

export function visionGate({ expectedImages, hostEvents, context, objectRecognitionVerified }) {
  if (Object.keys(expectedImages).sort().join('|') !== 'vision_A.png|vision_B.png') return { status: 'FAIL', reason: 'VISION_IDS_REQUIRED' };
  const evidence = imageEvidenceGate({ expectedImages, hostEvents, context });
  return evidence.status === 'PASS' && objectRecognitionVerified === true ? { status: 'PASS', context, expectedImages } : { status: 'UNVERIFIED' };
}
