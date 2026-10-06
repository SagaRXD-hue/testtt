## Integrated Finance Management Portal for IIT Mandi

An **integrated, role-based finance management portal** for IIT Mandi built with **Next.js 15**, **React 19**, **Supabase**, and **NextAuth.js**.  
It streamlines workflows such as bill application and approval, auditing, student purchases, and finance administration in a single web interface.

---

## 🏗️ System Architecture

![System Architecture](./architecture.jpeg)

This architecture shows how the frontend, backend, authentication, and database layers interact to handle secure financial workflows and role-based operations.

---

## Features

- **Authentication & Security**
  - **NextAuth.js** authentication
  - **Supabase** as the primary data layer
  - **Role-based access control** (students, PDA managers, finance admins, auditors, etc.)

- **Finance & Bills**
  - **Apply Bill** flow with upload and history tracking
  - **Bill editor** and **bill details** view
  - **Bills dashboard** for quick overview and status
  - **Audit workflows** for reviewing and validating bills

- **Modules**
  - **Finance admin** panel
  - **PDA manager** interface
  - **Student purchase** management
  - **User management** pages

- **UX & UI**
  - Modern UI built with **Radix UI** primitives and utility components
  - **Responsive layout** optimized for desktop and mobile

---

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **UI / Styling**:
  - Tailwind CSS 4
  - Radix UI components
  - Custom reusable UI primitives
- **Auth & Data**:
  - Supabase
  - NextAuth.js
- **Email & Utilities**:
  - Nodemailer
  - LDAP integration

---

## Getting Started

### Prerequisites

- Node.js (LTS recommended)
- npm
- Supabase project

### Installation

```bash
git clone <your-repo-url>
cd integrated-finance-management-portal-for-iit-mandi
npm install
npm run dev
```

## Reimbursement workflows

The `/reimbursements` workspace supports employee, faculty and student travel/purchase claims, School Office approval records, separate central stock entries, Audit, and Finance & Accounts processing. The existing `/apply-bill` form also submits through this workflow and retains the original purchase fields.

Before using it, apply `supabase/migrations/202610060001_reimbursements.sql` to your Supabase project and configure the server-side `SUPABASE_SERVICE_ROLE_KEY` and `NEXTAUTH_URL` along with the existing authentication settings. The migration creates the claims table, private document bucket and atomic finance transition function. It does not automatically migrate old bills.

See [the reimbursement workflow guide](docs/reimbursement-workflow.md) for the full routing matrix, role mapping, funding behavior and test commands. Payment references are recorded after external disbursement; the portal does not initiate bank transfers.
