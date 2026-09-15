const AUTHORITY_FIELDS = [
  "value", "change", "changePercent", "marketTime", "asOf", "dataStatus", "isStale",
  "observationDate", "observationKind", "completedSessionConfirmed", "completedSessionDate",
  "providerObservationTime", "dataProvider", "quoteSource", "sessionDateOnly",
  "previousSessionClose", "previousSessionCloseDate", "marketClosure",
];

function observationSession(observation) {
  return observation?.completedSessionDate || observation?.observationDate || null;
}

function observationTime(observation) {
  const value = new Date(observation?.marketTime || observation?.asOf || 0).getTime();
  return Number.isFinite(value) ? value : 0;
}

function isValidatedEod(observation) {
  return observation?.completedSessionConfirmed === true ||
    (observation?.observationKind === "session_close" && observation?.dataStatus === "eod");
}

function normalizeCompletedAuthority(observation) {
  if (!observation || observation.completedSessionConfirmed !== true || !observation.completedSessionDate) {
    return observation;
  }
  return {
    ...observation,
    observationDate: observation.completedSessionDate,
    observationKind: "session_close",
    dataStatus: "eod",
    isStale: false,
  };
}

export function selectAuthoritativeObservation(candidate, retained) {
  candidate = normalizeCompletedAuthority(candidate);
  retained = normalizeCompletedAuthority(retained);
  if (!retained) return candidate;
  if (!candidate) return retained;
  const candidateSession = observationSession(candidate);
  const retainedSession = observationSession(retained);
  if (candidateSession && retainedSession && candidateSession !== retainedSession) {
    return candidateSession > retainedSession ? candidate : retained;
  }
  if (candidateSession && !retainedSession) return candidate;
  if (!candidateSession && retainedSession) return isValidatedEod(retained) ? retained : candidate;
  const candidateEod = isValidatedEod(candidate);
  const retainedEod = isValidatedEod(retained);
  if (candidateEod !== retainedEod) return retainedEod ? retained : candidate;
  return observationTime(candidate) >= observationTime(retained) ? candidate : retained;
}

export function mergeAuthoritativeObservation(candidate, retained) {
  if (!candidate) return retained || null;
  const authoritative = selectAuthoritativeObservation(candidate, retained);
  const merged = { ...candidate };
  for (const field of AUTHORITY_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(authoritative || {}, field)) {
      merged[field] = authoritative[field];
    }
  }
  return merged;
}

export function mergeAuthoritativeObservationList(candidate = [], retained = []) {
  const retainedByKey = new Map(retained.map((item) => [item.key, item]));
  const candidateByKey = new Map(candidate.map((item) => [item.key, item]));
  return [...new Set([...retainedByKey.keys(), ...candidateByKey.keys()])]
    .map((key) => mergeAuthoritativeObservation(candidateByKey.get(key), retainedByKey.get(key)))
    .filter(Boolean);
}

export function mergeRetainedIndexDetail(candidate, retained) {
  const merged = mergeAuthoritativeObservation(candidate, retained);
  if (!merged) return null;
  const candidatePoints = Array.isArray(candidate?.points) ? candidate.points : [];
  const retainedPoints = Array.isArray(retained?.points) ? retained.points : [];
  if (candidatePoints.length >= 2 || retainedPoints.length < 2) return merged;
  return {
    ...merged,
    points: retainedPoints,
    periodReturn: retained.periodReturn,
    periodHigh: retained.periodHigh,
    periodLow: retained.periodLow,
    historyUnavailable: false,
    historyError: null,
  };
}

export const _test = { observationSession, isValidatedEod, normalizeCompletedAuthority };
