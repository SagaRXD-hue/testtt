import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { context, errorResponse, RequestError, requireSameOrigin } from "@/lib/reimbursements/server";
import { QUEUES, validateSubmission } from "@/lib/reimbursements/workflow";
import { DEPARTMENTS } from "@/lib/reimbursements/departments";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { actor, db } = await context();
    const url = new URL(request.url);
    const requestedPage = Number(url.searchParams.get("page"));
    const page = Number.isSafeInteger(requestedPage) && requestedPage >= 0 ? Math.min(requestedPage, 100000) : 0;
    const queue = url.searchParams.get("scope") === "queue";
    let query = db.from("reimbursement_claims").select("*").order("created_at", { ascending: false });
    if (queue) {
      query = query.in("stage", QUEUES[actor.role]).neq("decision", "rejected");
      if (actor.role === "school") query = query.eq("department", actor.department || "");
    } else if (url.searchParams.get("scope") === "history") query = query.contains("events", [{ actor: actor.id }]);
    else query = query.eq("claimant_id", actor.id);
    const { data, error } = await query.range(page * 25, page * 25 + 25);
    if (error) throw new RequestError("Claims are unavailable. Apply the reimbursement database migration before using this workspace.", 503);
    return NextResponse.json({ actor, departments: DEPARTMENTS, claims: data.slice(0, 25), hasMore: data.length > 25 });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  const uploaded: string[] = [];
  let cleanup: (() => Promise<unknown>) | undefined;
  try {
    requireSameOrigin(request);
    const { actor, db } = await context();
    cleanup = () => db.storage.from("reimbursement-documents").remove(uploaded);
    if (Number(request.headers.get("content-length")) > 27 * 1024 * 1024) throw new RequestError("Attachments must total at most 25 MB.");
    const form = await request.formData();
    let input;
    try { input = JSON.parse(String(form.get("claim"))); } catch { throw new RequestError("Invalid claim details."); }
    if (!input || typeof input !== "object") throw new RequestError("Invalid claim details.");
    const kinds = form.getAll("document_kind").map(String);
    const files = form.getAll("documents");
    if (!files.length || files.length > 8 || files.length !== kinds.length) throw new RequestError("Attach between 1 and 8 documents.");
    try { validateSubmission(input, kinds); } catch (e) { throw new RequestError((e as Error).message); }
    if (!DEPARTMENTS.includes(input.department)) throw new RequestError("Select a listed School / department.");
    if (actor.role === "school" && actor.department !== input.department) throw new RequestError("Submit claims only for your assigned School / department.", 403);
    const claimantId = actor.role === "school" ? String(input.employee_id || "").trim() : actor.id;
    if (!claimantId || claimantId.length > 100) throw new RequestError("Enter a valid employee / student ID.");
    const allowed = ["po_details","po_value","supplier_name","supplier_address","item_category","item_description","qty","bill_details","indenter_name","qty_issued","source_of_fund","stock_entry","location","travel_purpose","travel_from","travel_to","travel_start","travel_end"];
    const details: Record<string, string> = {};
    for (const field of allowed) {
      const value = String(input.details?.[field] ?? "").trim();
      if (value.length > 5000) throw new RequestError("A detail field exceeds 5,000 characters.");
      details[field] = value;
    }
    for (const field of ["qty", "qty_issued"]) {
      if (details[field] && (!Number.isInteger(Number(details[field])) || Number(details[field]) < 0)) throw new RequestError("Quantities must be non-negative whole numbers.");
    }
    const validDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
    if (input.claim_type === "Travel" && (!details.travel_purpose || !validDate(details.travel_start) || !validDate(details.travel_end) || details.travel_end < details.travel_start)) throw new RequestError("Enter a travel purpose and valid start / end dates.");
    const id = randomUUID();
    const documents = [];
    let total = 0;
    // Validate all documents before uploading any of them.
    const validated = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!(file instanceof File) || !file.size || file.size > 10 * 1024 * 1024) throw new RequestError("Each document must be non-empty and no larger than 10 MB.");
      if (!["invoice", "tada", "supporting"].includes(kinds[i])) throw new RequestError("Invalid document type.");
      total += file.size;
      if (total > 25 * 1024 * 1024) throw new RequestError("Attachments must total at most 25 MB.");
      const bytes = Buffer.from(await file.arrayBuffer());
      const mime = bytes.subarray(0, 5).toString() === "%PDF-" ? "application/pdf"
        : bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? "image/png"
        : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? "image/jpeg" : null;
      if (!mime) throw new RequestError("Only PDF, PNG and JPEG documents are supported.");
      validated.push({ file, bytes, mime, kind: kinds[i] });
    }
    for (const { file, bytes, mime, kind } of validated) {
      const docId = randomUUID();
      const path = `${id}/${docId}`;
      const { error } = await db.storage.from("reimbursement-documents").upload(path, bytes, { contentType: mime });
      if (error) throw new RequestError("Document upload failed. Check the private reimbursement storage bucket.", 503);
      uploaded.push(path);
      documents.push({ id: docId, path, name: file.name.slice(0, 200), kind });
    }
    const { data, error } = await db.from("reimbursement_claims").insert({
      id, claimant_id: claimantId, claimant_name: String(input.claimant_name).trim().slice(0, 200),
      claimant_type: input.claimant_type, department: input.department, claim_type: input.claim_type,
      category: input.claim_type === "Travel" ? null : input.category, amount: Number(input.amount),
      details, documents, stage: "school_stock",
      events: [{ actor: actor.id, action: "submit", stage: "school_stock", reference: "", approver: "", note: "Submitted to the School Office", at: new Date().toISOString() }],
    }).select("*").single();
    if (error) throw new RequestError("The claim could not be saved. Check the reimbursement database migration.", 503);
    return NextResponse.json({ claim: data }, { status: 201 });
  } catch (error) {
    if (uploaded.length && cleanup) await cleanup().catch(console.error);
    return errorResponse(error);
  }
}
