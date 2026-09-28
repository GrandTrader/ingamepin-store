"use client";
import Link from "next/link";
export default function PortalError({reset}:{reset:()=>void}){return <div className="mx-auto max-w-4xl rounded-xl border border-slate-200 bg-white p-8"><h2 className="text-xl font-bold">Unable to load your business account</h2><p className="my-3 text-slate-600">Please try again. Your saved orders and wallet are unchanged.</p><button className="rounded-lg bg-blue-600 px-4 py-2 text-white" onClick={()=>reset()}>Try again</button><Link className="ml-4 text-blue-600" href="/account/business">Business verification</Link></div>;}
