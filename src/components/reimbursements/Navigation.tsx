"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";

export default function ReimbursementNavigation() {
  const { data: session } = useSession();
  const pathname = usePathname();
  if (!session || pathname === "/login") return null;
  const legacy: Record<string, string> = { "Finance Admin": "/finance-admin", "Audit": "/audit", "Student Purchase": "/student-purchase", "bill_employee_fill": "/apply-bill", "bill_employee_edit": "/bill-editor", "pda-manager": "/pda-manager" };
  return <nav aria-label="Finance workspaces" className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-slate-200 bg-white px-5 py-3 text-sm">
    <Link href="/reimbursements" className="font-semibold text-teal-800">Reimbursement claims</Link>
    <Link href="/reimbursements/new" className="text-slate-600">New claim</Link>
    <Link href={legacy[session.user.employee_type || ""] || "/user"} className="text-slate-600">Existing bills / administration</Link>
    <button onClick={() => signOut({ callbackUrl: "/login" })} className="ml-auto text-slate-500">Sign out</button>
  </nav>;
}
