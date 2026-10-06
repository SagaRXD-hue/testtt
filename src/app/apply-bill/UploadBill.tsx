"use client";

import ClaimForm from "@/components/reimbursements/ClaimForm";

// Preserve the existing route and all bill fields; new submissions use the complete workflow.
export default function UploadBill({ onBillSubmitted }: { onBillSubmitted: () => void; department?: string | null }) {
  return <ClaimForm onSubmitted={onBillSubmitted} />;
}
