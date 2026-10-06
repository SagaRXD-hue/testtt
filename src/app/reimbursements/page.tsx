"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, FileText, Plus, RefreshCw } from "lucide-react";
import { STAGES, canReview, type Actor, type Claim, type Action } from "@/lib/reimbursements/workflow";

const money = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(value);
const inputClass = "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm";
type Account = { id: string; employee_id: string; balance: number };

function ReviewForm({ claim, accounts, onDone }: { claim: Claim; accounts: Account[]; onDone: () => void }) {
  const [reference, setReference] = useState("");
  const [approver, setApprover] = useState("");
  const [note, setNote] = useState("");
  const [account, setAccount] = useState("");
  const [paid, setPaid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const references: Record<string, string> = {
    school_stock: claim.claim_type === "Travel" ? "Document verification reference (stock entry not applicable)" : "School stock register reference, or reason not applicable",
    school_authority: "Approval reference / document number",
    school_chair: "School Chairperson approval reference",
    central_stock: "Central Stock Register entry reference",
    audit: "Audit clearance reference",
    finance: "F&A processing / authorization reference",
    payment: "Bank / payment transaction reference",
  };

  async function act(action: Action) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/reimbursements/${claim.id}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: claim.version, action, reference, approver, note, account, payment_confirmed: paid }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      onDone();
    } catch (e) { setError(e instanceof Error ? e.message : "The action failed."); }
    finally { setBusy(false); }
  }

  return <form onSubmit={(e: FormEvent) => { e.preventDefault(); void act("advance"); }} className="mt-6 rounded-2xl border border-teal-200 bg-teal-50 p-5">
    <h3 className="font-semibold text-teal-950">Complete this stage</h3>
    {claim.stage === "school_authority" && <p className="mt-2 text-sm text-teal-900">Record the approval already obtained from {claim.claimant_type === "Student" ? "the student’s guide" : "the employee / faculty member concerned"}.</p>}
    {claim.stage === "school_chair" && <p className="mt-2 text-sm text-teal-900">Record the approval obtained from the School Chairperson before forwarding.</p>}
    {claim.stage === "central_stock" && <p className="mt-2 text-sm text-teal-900">Make a separate entry in the Central Stock Register. The School Office entry is recorded in the history below.</p>}
    {claim.stage === "finance" && <p className="mt-2 text-sm text-teal-900">Select the department’s PDA account. Available funds will be checked and the claim amount reserved in one transaction.</p>}
    {claim.stage === "payment" && <p className="mt-2 text-sm text-teal-900">Record payment only after it has been disbursed through your payment system. This portal records the transaction; it does not transfer money.</p>}
    <fieldset disabled={busy} className="mt-4 space-y-4">
      {["school_authority", "school_chair"].includes(claim.stage) && <label className="block text-sm">{claim.stage === "school_chair" ? "School Chairperson name" : claim.claimant_type === "Student" ? "Guide name" : "Employee / faculty approver name"}<input className={inputClass} value={approver} onChange={(e) => setApprover(e.target.value)} /></label>}
      <label className="block text-sm">{references[claim.stage]}<input className={inputClass} value={reference} onChange={(e) => setReference(e.target.value)} /></label>
      {claim.stage === "finance" && <label className="block text-sm">Fund account<select className={inputClass} value={account} onChange={(e) => setAccount(e.target.value)}><option value="">Select an account</option>{accounts.map((item) => <option key={item.id} value={item.id}>{item.employee_id} · {money(item.balance || 0)}</option>)}</select>{!accounts.length && <span className="mt-1 block text-rose-700">No department fund accounts are available. Ask the PDA manager to add one.</span>}</label>}
      {claim.stage === "payment" && <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} />I confirm that the payment has been disbursed and the reference above is correct.</label>}
      <label className="block text-sm">Notes / reason for hold or rejection<textarea className={inputClass} rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="rounded-xl bg-[#17627a] px-4 py-2.5 text-sm font-semibold text-white">{busy ? "Saving…" : claim.stage === "payment" ? "Record payment" : claim.stage === "finance" ? "Check funds and process" : "Record and forward"}</button>
        <button type="button" onClick={() => void act("hold")} className="rounded-xl border border-amber-300 bg-white px-4 py-2.5 text-sm text-amber-900">Hold</button>
        <button type="button" onClick={() => void act("reject")} className="rounded-xl border border-rose-300 bg-white px-4 py-2.5 text-sm text-rose-800">Reject</button>
      </div>
      {claim.funds_reserved && <p className="text-xs text-slate-600">Rejecting this unpaid claim returns its reserved funds to the account. Holding it keeps the reservation.</p>}
    </fieldset>
  </form>;
}

export default function ReimbursementsPage() {
  const { status } = useSession();
  const [actor, setActor] = useState<Actor | null>(null);
  const [scope, setScope] = useState("mine");
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [selected, setSelected] = useState<Claim | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/reimbursements?scope=${scope}&page=${page}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setActor(data.actor); setClaims(data.claims); setHasMore(data.hasMore);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load claims."); }
    finally { setBusy(false); }
  }, [scope, page]);
  useEffect(() => {
    if (status === "unauthenticated") window.location.href = "/login";
    if (status === "authenticated") void refresh();
  }, [status, refresh]);

  async function openClaim(id: string) {
    setError(""); setNotice(""); setBusy(true);
    try {
      const response = await fetch(`/api/reimbursements/${id}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setSelected(data.claim); setAccounts(data.accounts);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to open claim."); }
    finally { setBusy(false); }
  }

  return <main className="min-h-screen bg-[#f4f7fb] px-4 py-8 text-slate-900 sm:px-8">
    <div className="mx-auto max-w-6xl">
      <header className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <div><p className="text-sm font-semibold text-teal-700">IIT Mandi · Finance workspace</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Reimbursement claims</h1><p className="mt-2 text-sm text-slate-500">Submit, review and track travel and purchase reimbursements.</p></div>
        <Link href="/reimbursements/new" className="inline-flex items-center gap-2 rounded-xl bg-[#17627a] px-5 py-3 text-sm font-semibold text-white"><Plus size={17} />New claim</Link>
      </header>
      {error && <div role="alert" className="mb-5 flex gap-2 rounded-xl bg-rose-50 p-4 text-sm text-rose-800"><AlertCircle size={18} />{error}</div>}
      {notice && <p role="status" className="mb-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</p>}
      {selected ? <>
        <button onClick={() => setSelected(null)} className="mb-5 flex items-center gap-2 text-sm font-medium text-teal-800"><ArrowLeft size={17} />Back to claims</button>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">{selected.claimant_name} · {selected.claim_type}</h2><p className="mt-1 text-sm text-slate-500">{selected.claimant_type} · {selected.claimant_id} · {selected.department}</p><p className="mt-2 break-all text-xs text-slate-400">Claim {selected.id}</p></div><p className="text-2xl font-semibold">{money(selected.amount)}</p></div>
          <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm"><strong>{STAGES[selected.stage]}</strong> · {selected.decision === "active" ? selected.stage === "paid" ? "Completed" : "Awaiting processing" : selected.decision === "hold" ? "On hold" : "Rejected"}{selected.payment_reference && <p className="mt-2">Payment reference: {selected.payment_reference}</p>}</div>
          <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">{Object.entries(selected.details).filter(([, value]) => value).map(([key, value]) => <div key={key}><dt className="capitalize text-slate-500">{key.replaceAll("_", " ")}</dt><dd className="mt-1 whitespace-pre-wrap break-words">{value}</dd></div>)}</dl>
          <h3 className="mt-6 font-semibold">Documents</h3><ul className="mt-3 space-y-2">{selected.documents.map((doc) => <li key={doc.id}><a href={`/api/reimbursements/${selected.id}/documents/${doc.id}`} className="inline-flex items-center gap-2 break-all text-sm text-teal-800 underline"><FileText size={16} className="shrink-0" />{doc.name} ({doc.kind})</a></li>)}</ul>
          {actor && canReview(actor, selected) && <ReviewForm key={`${selected.id}-${selected.version}`} claim={selected} accounts={accounts} onDone={() => { setSelected(null); setNotice("Claim updated. The next stage and any fund changes have been recorded."); void refresh(); }} />}
          <h3 className="mt-7 font-semibold">Processing history</h3><ol className="mt-3 space-y-3">{selected.events.map((event, index) => <li key={index} className="border-l-2 border-teal-200 pl-4 text-sm"><p className="font-medium">{STAGES[event.stage]} · {event.action}</p><p className="mt-1 text-xs text-slate-500">{event.actor} · {new Date(event.at).toLocaleString()}</p>{event.approver && <p className="mt-1">Approval obtained from: {event.approver}</p>}{event.reference && <p className="mt-1 break-words">Reference: {event.reference}</p>}{event.note && <p className="mt-1 whitespace-pre-wrap">{event.note}</p>}</li>)}</ol>
        </article>
      </> : <>
        <div className="mb-5 flex flex-wrap items-center gap-2">
          {["mine", ...(actor && actor.role !== "claimant" ? ["queue", "history"] : [])].map((tab) => <button key={tab} onClick={() => { setScope(tab); setPage(0); setNotice(""); }} className={`rounded-xl px-4 py-2.5 text-sm font-medium ${scope === tab ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600"}`}>{tab === "mine" ? "My claims" : tab === "queue" ? "Review queue" : "Handled by me"}</button>)}
          <button onClick={() => void refresh()} disabled={busy} aria-label="Refresh claims" className="ml-auto rounded-xl border bg-white p-2.5"><RefreshCw size={17} className={busy ? "animate-spin" : ""} /></button>
        </div>
        <div className="space-y-3">{claims.map((claim) => <button key={claim.id} disabled={busy} onClick={() => void openClaim(claim.id)} className="flex w-full flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-teal-300"><div><p className="font-semibold">{claim.claimant_name} · {claim.claim_type}{claim.category ? ` / ${claim.category}` : ""}</p><p className="mt-1 text-sm text-slate-500">{STAGES[claim.stage]}{claim.decision !== "active" ? ` · ${claim.decision}` : ""}</p><p className="mt-2 text-xs text-slate-400">{new Date(claim.created_at).toLocaleDateString()} · {claim.department}</p></div><span className="text-lg font-semibold">{money(claim.amount)}</span></button>)}</div>
        {!claims.length && !busy && !error && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">{scope === "queue" ? "No claims are awaiting your section." : "You haven’t submitted a reimbursement claim yet."}</div>}
        {busy && <p role="status" className="mt-5 text-sm text-slate-500">Loading…</p>}
        <div className="mt-5 flex items-center justify-between text-sm"><button disabled={page === 0 || busy} onClick={() => setPage(page - 1)} className="rounded-lg border bg-white px-3 py-2 disabled:opacity-40">Previous</button><span>Page {page + 1}</span><button disabled={!hasMore || busy} onClick={() => setPage(page + 1)} className="rounded-lg border bg-white px-3 py-2 disabled:opacity-40">Next</button></div>
      </>}
    </div>
  </main>;
}
