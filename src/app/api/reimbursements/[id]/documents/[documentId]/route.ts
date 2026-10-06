import { NextResponse } from "next/server";
import { errorResponse, loadClaim, RequestError } from "@/lib/reimbursements/server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; documentId: string }> }) {
  try {
    const { id, documentId } = await params;
    const { db, claim } = await loadClaim(id);
    const document = claim.documents.find((item) => item.id === documentId);
    if (!document) throw new RequestError("Document not found.", 404);
    const { data, error } = await db.storage.from("reimbursement-documents").createSignedUrl(document.path, 60, { download: document.name });
    if (error) throw new RequestError("Unable to download this document.", 503);
    return NextResponse.redirect(data.signedUrl);
  } catch (error) { return errorResponse(error); }
}
