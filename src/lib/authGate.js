/** Persist PIN / Use another account / Reset PIN across hard refresh. */

export const AUTH_GATE_KEY = 'dkmerch_auth_gate'; // pin | switch | reset
const AUTH_GATE_STEP_KEY = 'dkmerch_auth_gate_step';

export function readAuthGate() {
  try {
    const local = String(localStorage.getItem(AUTH_GATE_KEY) || '').trim();
    if (local) return local;
    return String(sessionStorage.getItem(AUTH_GATE_KEY) || '').trim();
  } catch {
    return '';
  }
}

export function writeAuthGate(mode) {
  try {
    if (!mode) {
      localStorage.removeItem(AUTH_GATE_KEY);
      sessionStorage.removeItem(AUTH_GATE_KEY);
      localStorage.removeItem(AUTH_GATE_STEP_KEY);
      sessionStorage.removeItem(AUTH_GATE_STEP_KEY);
      return;
    }
    localStorage.setItem(AUTH_GATE_KEY, String(mode));
    sessionStorage.setItem(AUTH_GATE_KEY, String(mode));
  } catch { /* ignore */ }
}

export function clearAuthGate() {
  writeAuthGate('');
}

export function readAuthGateStep() {
  try {
    const raw = localStorage.getItem(AUTH_GATE_STEP_KEY) || sessionStorage.getItem(AUTH_GATE_STEP_KEY);
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function writeAuthGateStep(step) {
  try {
    const n = Math.max(0, Number(step) || 0);
    localStorage.setItem(AUTH_GATE_STEP_KEY, String(n));
    sessionStorage.setItem(AUTH_GATE_STEP_KEY, String(n));
  } catch { /* ignore */ }
}

export function isAuthGateLocked(gate = readAuthGate()) {
  return gate === 'switch' || gate === 'reset' || gate === 'pin';
}
