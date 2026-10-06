import { createClient } from "@supabase/supabase-js";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { NextResponse } from "next/server";
import { canRead, roleFor, type Actor, type Claim } from "./workflow";

export class RequestError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export async function context() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new RequestError("Sign in to continue.", 401);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new RequestError("Reimbursements are not configured on this server.", 503);
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.from("employees").select("employee_type,department")
    .eq("employee_code", session.user.id).maybeSingle();
  if (error) throw new RequestError("Unable to load your employee permissions.", 503);
  const actor: Actor = { id: session.user.id, role: roleFor(data?.employee_type), department: data?.department || null };
  return { actor, db };
}

export async function loadClaim(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new RequestError("Invalid claim ID.");
  const ctx = await context();
  const { data, error } = await ctx.db.from("reimbursement_claims").select("*").eq("id", id).maybeSingle();
  if (error) throw new RequestError("Unable to read claims. Check that the reimbursement migration has been applied.", 503);
  if (!data || !canRead(ctx.actor, data as Claim)) throw new RequestError("Claim not found or access denied.", 404);
  return { ...ctx, claim: data as Claim };
}

export function errorResponse(error: unknown) {
  if (error instanceof RequestError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error("Reimbursement request failed", error);
  return NextResponse.json({ error: "The request could not be completed. Please try again." }, { status: 500 });
}

export function requireSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = new URL(process.env.NEXTAUTH_URL || request.url).origin;
  if (!origin || origin !== expected) throw new RequestError("Invalid request origin.", 403);
}
