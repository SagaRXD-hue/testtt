"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, FileText, Send } from "lucide-react";
import { DEPARTMENTS } from "@/lib/reimbursements/departments";
import { routePreview, STAGES, type Actor, type Category, type ClaimType } from "@/lib/reimbursements/workflow";

const control = "mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-teal-700 focus:ring-4 focus:ring-teal-700/10 disabled:bg-slate-100";
const initialDetails: Record<string, string> = {
  po_details: "", po_value: "", supplier_name: "", supplier_address: "", item_category: "Minor",
  item_description: "", qty: "", bill_details: "", indenter_name: "", qty_issued: "",
  source_of_fund: "", stock_entry: "", location: "", travel_purpose: "", travel_from: "", travel_to: "", travel_start: "", travel_end: "",
};

export default function ClaimForm({ onSubmitted }: { onSubmitted?: () => void }) {
  const [actor, setActor] = useState<Actor | null>(null);
  const [claimType, setClaimType] = useState<ClaimType>("Purchase");
  const [claimantType, setClaimantType] = useState("Employee");
  const [employeeId, setEmployeeId] = useState("");
  const [name, setName] = useState("");
  const [department, setDepartment] = useState("");
  const [details, setDetails] = useState({ ...initialDetails });
  const [documents, setDocuments] = useState<Record<string, File[]>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/reimbursements?scope=mine").then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (cancelled) return;
      setActor(data.actor);
      setEmployeeId(data.actor.id);
      setDepartment(data.actor.department || "");
    }).catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !actor) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("claim", JSON.stringify({ employee_id: employeeId, claimant_name: name, claimant_type: claimantType,
        department, claim_type: claimType, category: details.item_category, amount: details.po_value, details }));
      for (const [kind, files] of Object.entries(documents)) {
        for (const file of files) { form.append("documents", file); form.append("document_kind", kind); }
      }
      const response = await fetch("/api/reimbursements", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setSubmitted(true);
      onSubmitted?.();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to submit the claim."); }
    finally { setBusy(false); }
  }

  const field = (key: string, label: string, type = "text", required = false, multiline = false) => (
    <label className={`block text-sm font-medium text-slate-700 ${multiline ? "sm:col-span-2" : ""}`} key={key}>
      {label}{required && <span className="text-rose-600"> *</span>}
      {multiline ? <textarea className={control} rows={3} value={details[key]} required={required} onChange={(e) => setDetails({ ...details, [key]: e.target.value })} />
        : <input className={control} type={type} value={details[key]} required={required} min={type === "number" ? "0" : undefined}
          step={key === "po_value" ? "0.01" : type === "number" ? "1" : undefined}
          onChange={(e) => setDetails({ ...details, [key]: e.target.value })} />}
    </label>
  );
  const upload = (kind: string, label: string, required: boolean) => (
    <label key={`${claimType}-${kind}`} className="block rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm font-medium text-slate-700">
      {label}{required ? " *" : " (optional)"}
      <input className="mt-3 block w-full text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-teal-100 file:px-3 file:py-2 file:text-teal-900" type="file"
        accept="application/pdf,image/jpeg,image/png" multiple required={required}
        onChange={(e) => setDocuments({ ...documents, [kind]: Array.from(e.target.files || []) })} />
    </label>
  );
  const section = (title: string, content: ReactNode, hint?: string) => (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {hint && <p className="mt-1 text-sm leading-6 text-slate-500">{hint}</p>}
      <div className="mt-5 grid gap-5 sm:grid-cols-2">{content}</div>
    </section>
  );

  if (submitted) return (
    <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-emerald-950">
      <CheckCircle2 className="mb-3" />
      <h2 className="text-xl font-semibold">Claim submitted to the School Office</h2>
      <p className="mt-2 text-sm">The School Office will verify the documents, record applicable school stock entries, and obtain the required approvals.</p>
      <Link className="mt-5 inline-block font-semibold underline" href="/reimbursements">View claims and progress →</Link>
      <button type="button" className="ml-5 font-semibold underline" onClick={() => { setSubmitted(false); setDetails({ ...initialDetails }); setDocuments({}); }}>Submit another claim</button>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-5xl text-slate-900">
      <div className="mb-7">
        <p className="flex items-center gap-2 text-sm font-semibold text-teal-700"><FileText size={17} /> Reimbursement application</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Submit a claim</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">Travel and purchase claims begin at your School Office. Required fields are marked *.</p>
      </div>
      <form onSubmit={submit} className="space-y-5">
        <fieldset disabled={busy} className="space-y-5">
          {section("Applicant and claim", <>
            <label className="text-sm font-medium">Claim type *<select className={control} value={claimType} onChange={(e) => { setClaimType(e.target.value as ClaimType); setDocuments({}); }}><option>Purchase</option><option>Travel</option></select></label>
            <label className="text-sm font-medium">Claimant type *<select className={control} value={claimantType} onChange={(e) => setClaimantType(e.target.value)}><option>Employee</option><option>Faculty</option><option>Student</option></select></label>
            <label className="text-sm font-medium">Employee / student ID *<input className={control} value={employeeId} readOnly={actor?.role !== "school"} required onChange={(e) => setEmployeeId(e.target.value)} />{actor?.role === "school" && <span className="mt-1 block text-xs text-slate-500">School Office may enter a claim received from this applicant.</span>}</label>
            <label className="text-sm font-medium">Applicant name *<input className={control} value={name} required onChange={(e) => setName(e.target.value)} /></label>
            <label className="text-sm font-medium sm:col-span-2">School / department *<select className={control} value={department} required disabled={actor?.role === "school"} onChange={(e) => setDepartment(e.target.value)}><option value="">Select a School / department</option>{DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}</select></label>
          </>, claimantType === "Student" ? "The School Office must obtain your guide’s approval, followed by the School Chairperson’s approval." : "The School Office must obtain the concerned employee / faculty member’s approval, followed by the School Chairperson’s approval.")}

          {claimType === "Purchase" ? <>
            {section("Purchase order", <>
              {field("po_details", "PO details")}{field("po_value", "PO value / claim amount (₹)", "number", true)}
              <label className="text-sm font-medium">Item category *<select className={control} value={details.item_category} onChange={(e) => setDetails({ ...details, item_category: e.target.value })}><option value="Minor">Minor items / assets</option><option value="Major">Major assets</option><option value="Consumables">Consumables</option><option value="Other">Other non-asset purchases</option></select></label>
            </>)}
            {section("Supplier and items", <>{field("supplier_name", "Supplier name", "text", true)}{field("qty", "Quantity", "number")}{field("supplier_address", "Supplier address", "text", false, true)}{field("item_description", "Item description", "text", true, true)}{field("bill_details", "Bill details", "text", false, true)}</>)}
            {section("Indenter, location and stock", <>{field("indenter_name", "Indenter name")}{field("qty_issued", "Quantity issued", "number")}{field("location", "Location")}{field("source_of_fund", "Source of fund")}{field("stock_entry", "School stock reference (if already available)")}</>, "The School Office records the applicable school-register entry during verification. Store & Purchase records a separate central entry for assets.")}
          </> : <>
            {section("Travel details", <>{field("travel_purpose", "Purpose of travel", "text", true, true)}{field("travel_from", "Travel from")}{field("travel_to", "Destination")}{field("travel_start", "Start date", "date", true)}{field("travel_end", "End date", "date", true)}{field("po_value", "TA/DA claim amount (₹)", "number", true)}{field("source_of_fund", "Source of fund")}{field("bill_details", "Claim details", "text", false, true)}</>, "Complete and attach the TA/DA form with all supporting documents. Stock entry does not apply to travel claims.")}
          </>}

          {section("Supporting documents", <>{claimType === "Travel" ? <>{upload("tada", "Completed TA/DA form", true)}{upload("supporting", "Travel supporting documents", true)}</> : <>{upload("invoice", "Purchase invoice / bill", true)}{upload("supporting", "Additional supporting documents", false)}</>}</>, "PDF, PNG or JPEG. Up to 8 files, 10 MB per file and 25 MB in total.")}

          {Number(details.po_value) > 0 && <section className="rounded-2xl border border-teal-100 bg-teal-50 p-5">
            <h2 className="font-semibold text-teal-950">Your claim’s route</h2>
            <ol className="mt-3 space-y-2 text-sm text-teal-900">{routePreview(claimType, claimType === "Travel" ? null : details.item_category as Category, Number(details.po_value)).map((stage, index) => <li key={stage}>{index + 1}. {stage === "school_stock" && claimType === "Travel" ? "School Office · document verification (no stock entry)" : STAGES[stage]}</li>)}</ol>
            <p className="mt-3 text-xs text-teal-800">F&A checks and reserves funds after the reviews. Payment is recorded after disbursement.</p>
          </section>}
          {error && <div role="alert" className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><AlertCircle size={18} className="shrink-0" />{error}</div>}
          <div className="flex justify-end"><button disabled={busy || !actor} type="submit" className="flex items-center gap-2 rounded-xl bg-[#17627a] px-6 py-3 font-semibold text-white disabled:opacity-50"><Send size={17} />{busy ? "Submitting…" : "Submit to School Office"}</button></div>
        </fieldset>
      </form>
    </div>
  );
}
