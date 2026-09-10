export type DiditSummary = { provider_status: string; face_score: number | null; checks_passed: boolean };
export function summarizeDiditDecision(value: unknown): DiditSummary {
  if (!value || typeof value !== "object") return {provider_status:"Unknown",face_score:null,checks_passed:false};
  const d=value as Record<string,unknown>;
  const entries=(key:string): Record<string,unknown>[] => Array.isArray(d[key]) ? (d[key] as unknown[]).map(x=>x && typeof x==="object" ? x as Record<string,unknown> : {}) : [];
  const ids=entries("id_verifications"), live=entries("liveness_checks"), faces=entries("face_matches");
  const approved=(rows:Record<string,unknown>[])=>rows.length>0 && rows.every(r=>r.status==="Approved");
  const scores=faces.map(f=>f.score);
  const validScores=scores.length>0 && scores.every(s=>typeof s==="number" && Number.isFinite(s) && s>=0 && s<=100);
  const score=validScores ? Math.min(...scores as number[]) : null;
  return {provider_status:typeof d.status==="string" ? d.status.slice(0,80) : "Unknown",face_score:score,checks_passed:d.status==="Approved" && approved(ids) && approved(live) && approved(faces) && score!==null && score>=80};
}
