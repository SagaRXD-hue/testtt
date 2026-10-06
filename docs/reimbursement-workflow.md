# Reimbursement workflow

New claims are created at `/reimbursements/new` or the existing `/apply-bill` form. `/reimbursements` provides My claims and role-scoped Review queue views. Login opens the new workspace, except for PDA managers. Existing bills and administration remain accessible through the navigation bar.

## Source requirements

The two Employee_Student_Reimbursement_Flowchart PDFs contain the same employee/student flow. All four supplied PDFs were read and visually inspected; the updated routing diagram and School Office diagram define the onward workflow.

Every new claim starts with School Office verification, then the appropriate guide/employee/faculty approval, then School Chairperson approval. School officers **record approvals already obtained**, including the approver's name and reference. These records do not impersonate the guide or Chairperson or send approval requests automatically.

| Claim | School stock entry | After School Chairperson approval | After Store & Purchase |
| --- | --- | --- | --- |
| Travel, any amount | Not applicable; verify TA/DA and supporting documents | Audit → F&A | Not applicable |
| Minor items / assets, up to and including ₹50,000 | Applicable school-register entry | Store & Purchase: separate Central Stock Register entry | F&A |
| Minor items / assets, above ₹50,000 | Applicable school-register entry | Store & Purchase: separate Central Stock Register entry | Audit → F&A |
| Major assets | Applicable school-register entry | Same asset route as minor items | Amount-based as above |
| Consumables, up to and including ₹50,000 | Applicable school-register entry | F&A | Not applicable |
| Consumables, above ₹50,000 | Applicable school-register entry | Audit → F&A | Not applicable |
| Other non-asset purchases, up to and including ₹50,000 | Applicable school-register entry | F&A | Not applicable |
| Other non-asset purchases, above ₹50,000 | Applicable school-register entry | Audit → F&A | Not applicable |

The user explicitly confirmed direct F&A routing for assets <= ₹50,000 after central stock entry, and for other non-asset/non-consumable purchases <= ₹50,000. The existing Major category is presented as Major assets, so it requires central stock entry as an asset.

Students require guide approval; employees/faculty require the concerned employee/faculty member's approval. All require Chairperson approval. Purchase invoices are mandatory. Travel requires both the completed TA/DA form and supporting documents. The original 15 bill fields remain available for purchases.

## Installation

Apply `supabase/migrations/202610060001_reimbursements.sql` to the configured Supabase project using your usual migration process before using the new screens. It adds a separate server-only claims table, a private document bucket, two role names, and a transaction function. It does not migrate existing bills or change their balances.

The server requires `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXTAUTH_SECRET`, and `NEXTAUTH_URL`, alongside the existing LDAP settings (`URL`, `BaseDN`, optional JSON `OU`). No credentials are included in the repository. The origin of `NEXTAUTH_URL` must match the deployed portal.

Assign School Office staff their exact School / department in `employees.department`. Existing `bill_employee_fill` and `bill_employee_edit` roles map to School Office. Existing `Student Purchase` maps to Store & Purchase (the database's historical role name is preserved). `Audit` and `Finance Admin` review their respective queues. New `School Office` and `Store & Purchase` roles are also available in employee administration. Permissions are read using an exact employee-code lookup on every request, rather than trusting client state.

Authenticated applicants submit for themselves. School Office staff can enter paper claims on behalf of another employee/student in their own department; the submission event records the staff actor. Approval references and a chronological processing history are stored separately from applicant-entered stock information.

## Financial and document handling

Submission never deducts funds. F&A chooses a PDA account in the claim's department; a locked database transaction checks and reserves the amount, recording the account. This supports student claims funded from an appropriate departmental/faculty account. The existing PDA ledger is the available funding backend; another fund ledger would need an integration.

Payment processing is a separate stage. After payment is made externally, F&A records the payment reference and explicitly confirms disbursement. This portal does not initiate bank transfers. Duplicate payment references are rejected. Rejecting an unpaid reserved claim refunds its reservation exactly once; holding it retains the reservation. Paid and rejected claims are closed.

Only the server service role can access the new claims table or transition function. Private attachments are served through an authenticated, claim-scoped route using short-lived signed downloads. PDF/PNG/JPEG file signatures are checked, with limits of 8 files, 10 MB each and 25 MB total. Upload failures clean up files uploaded by that failed submission. Database migration and live storage permissions must be checked in the deployment environment.

The new workflow is isolated from legacy client-side bill updates, so legacy approval and refund pages cannot skip new claim stages or refund new reservations. Existing bills retain their previous processing behavior and are not automatically backfilled.

## Verification

Run `node --test tests/reimbursement-workflow.test.mjs` using Node 24 (or a Node version supporting TypeScript type stripping). The tests cover all claimant/category combinations around the exact ₹50,000 boundary, travel routing, department permissions, named approvals, attachment requirements, and invalid amounts.

For isolated database tests, install the temporary test runtime with `npm install --prefix tmp/db-test --no-save --package-lock=false @electric-sql/pglite`, then run `node --test tests/reimbursement-database.test.mjs`. These tests run the actual migration in an embedded PostgreSQL engine with minimal Supabase schema fixtures. They verify every route, stage-order enforcement, insufficient funds, duplicate requests, competing claims, hold/reject refund behavior, payment reference uniqueness, and database grants. They never connect to the live database.

Run a configured end-to-end check after applying the migration: authenticate through LDAP, submit a claim with real test documents, process each role, and download its attachments. No real payment needs to be initiated to validate the portal in a test environment.
