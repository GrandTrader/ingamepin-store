import "server-only";
export function diditConfig() {
  const live=Boolean(process.env.DIDIT_LIVE_API_KEY && process.env.DIDIT_LIVE_WORKFLOW_ID && process.env.DIDIT_LIVE_WEBHOOK_SECRET);
  return {live,environment:live?"live":"sandbox",table:live?"didit_seller_live_sessions":"didit_seller_test_sessions",key:(live?process.env.DIDIT_LIVE_API_KEY:process.env.DIDIT_API_KEY)?.trim(),workflow:(live?process.env.DIDIT_LIVE_WORKFLOW_ID:process.env.DIDIT_WORKFLOW_ID)?.trim()};
}
