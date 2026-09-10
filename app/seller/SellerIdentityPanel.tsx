"use client";
import {useActionState} from "react";
import {startSellerIdentity,checkSellerIdentity} from "./identity-actions";
export default function SellerIdentityPanel({summary,live=false}: {live?:boolean;summary:{provider_status:string;face_score:number|null;checks_passed:boolean;session_id:string|null}|null}) {
  const [startState,start,pending]=useActionState(startSellerIdentity,{error:""});
  const [checkState,check,checking]=useActionState(checkSellerIdentity,{error:""});
  return <section className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-5 text-slate-900">
    <h2 className="text-lg font-black">Identity verification</h2><p className="mt-2 text-sm font-bold">{live?"Live identity verification":"Sandbox testing — simulated results cannot approve your seller account."}</p>
    <p className="mt-2 text-sm">Complete the ID, selfie and liveness steps in Didit. The face-match score must be at least 80, and all three checks must pass. Final seller approval remains with the administrator.</p>
    {summary && <div role="status" className="mt-4 rounded-xl bg-white p-3 text-sm"><p>{live?"Live session":"Test session"}: <strong>{summary.provider_status}</strong></p><p>Face-match score: <strong>{summary.face_score===null?"Not available":summary.face_score+" / 100"}</strong></p><p>{summary.checks_passed?(live?"Identity checks passed. Remaining document checks and admin approval are still required.":"Test checks passed. Live verification is still required before approval."):"Required checks have not all passed."}</p></div>}
    <form action={start} className="mt-4"><label className="flex items-start gap-3 text-sm"><input type="checkbox" name="identity_consent" value="accepted" required className="mt-1 h-5 w-5 shrink-0" />{live?"I consent to Didit processing my ID and facial images for identity and liveness verification under the privacy notice shown in the verification flow.":"I agree to continue to Didit for this Sandbox test. Live verification will process my ID and facial images under the privacy notice shown by Didit."}</label><button disabled={pending||checking} className="mt-4 min-h-12 rounded-xl bg-blue-600 px-5 font-bold text-white disabled:opacity-50">{pending?"Opening…":summary?.session_id?"Continue identity verification":"Start identity verification"}</button></form>
    {summary?.session_id && <form action={check} className="mt-3"><button disabled={pending||checking} className="min-h-12 rounded-xl border border-blue-300 bg-white px-5 font-bold disabled:opacity-50">{checking?"Checking…":"Check verification result"}</button></form>}
    {(startState.error||checkState.error) && <p role="alert" className="mt-3 text-sm text-red-700">{startState.error||checkState.error}</p>}
  </section>;
}
