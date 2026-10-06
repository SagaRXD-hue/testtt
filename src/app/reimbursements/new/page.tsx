import Link from "next/link";
import ClaimForm from "@/components/reimbursements/ClaimForm";

export default function NewClaimPage() {
  return <main className="min-h-screen bg-[#f4f7fb] px-4 py-8 sm:px-8"><div className="mx-auto max-w-5xl"><Link href="/reimbursements" className="mb-6 inline-block text-sm font-medium text-teal-800">← Reimbursement claims</Link><ClaimForm /></div></main>;
}
