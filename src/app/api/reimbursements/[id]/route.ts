import { NextResponse } from "next/server";
import { loadClaim, errorResponse, RequestError, requireSameOrigin } from "@/lib/reimbursements/server";
import { nextStage, validateAction, type Action } from "@/lib/reimbursements/workflow";
type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { actor, db, claim } = await loadClaim((await params).id);
    let accounts: { id: string; employee_id: string | null; balance: number | null; department: string | null }[] = [];
    if (actor.role === "finance" && claim.stage === "finance") {
      const { data, error } = await db.from("pda_balances").select("id,employee_id,balance,department").eq("department", claim.department);
      if (error) throw new RequestError("Unable to load fund accounts.", 503);
      accounts = data || [];
    }
    return NextResponse.json({ claim, accounts });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request, { params }: Params) {
  try {
    requireSameOrigin(request);
    const { actor, db, claim } = await loadClaim((await params).id);
    const input = await request.json();
    const action = input.action as Action;
    const reference = String(input.reference || "").trim();
    const approver = String(input.approver || "").trim();
    const note = String(input.note || "").trim();
    if (reference.length > 500 || approver.length > 200 || note.length > 5000) throw new RequestError("Review text is too long.");
    try { validateAction(claim, actor, action, reference, approver, note); } catch (e) { throw new RequestError((e as Error).message); }
    if (input.version !== claim.version) throw new RequestError("This claim changed. Refresh and try again.", 409);
    if (action === "advance" && claim.stage === "payment" && input.payment_confirmed !== true) throw new RequestError("Confirm that the payment has actually been disbursed.");
    if (action === "advance" && claim.stage === "finance" && !/^[0-9a-f-]{36}$/i.test(input.account || "")) throw new RequestError("Select the fund account to charge.");
    const { data, error } = await db.rpc("advance_reimbursement", {
      p_id: claim.id, p_version: claim.version, p_actor: actor.id, p_action: action,
      p_next_stage: action === "advance" ? nextStage(claim) : claim.stage,
      p_reference: reference, p_approver: approver, p_note: note,
      p_account: action === "advance" && claim.stage === "finance" ? input.account : null,
    });
    if (error) throw new RequestError(error.code === "23505" ? "That payment reference has already been recorded." : error.message, 409);
    return NextResponse.json({ claim: data });
  } catch (error) { return errorResponse(error); }
}
