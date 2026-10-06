export const STAGES = {
  school_stock: "School Office · verification and school stock entry",
  school_authority: "School Office · guide / employee / faculty approval",
  school_chair: "School Office · Chairperson approval",
  central_stock: "Store & Purchase · Central Stock Register",
  audit: "Audit review",
  finance: "Finance & Accounts · funds check",
  payment: "Finance & Accounts · payment processing",
  paid: "Payment recorded",
} as const;

export type Stage = keyof typeof STAGES;
export type Role = "claimant" | "school" | "store" | "audit" | "finance";
export type ClaimType = "Travel" | "Purchase";
export type Category = "Minor" | "Major" | "Consumables" | "Other";
export type Action = "advance" | "hold" | "reject";
export interface Actor { id: string; role: Role; department: string | null }
export interface Claim {
  id: string;
  claimant_id: string;
  claimant_name: string;
  claimant_type: "Student" | "Employee" | "Faculty";
  department: string;
  claim_type: ClaimType;
  category: Category | null;
  amount: number;
  details: Record<string, string>;
  stage: Stage;
  decision: "active" | "hold" | "rejected";
  version: number;
  created_at: string;
  documents: { id: string; name: string; path: string; kind: string }[];
  events: { actor: string; action: string; stage: Stage; reference: string; approver: string; note: string; at: string }[];
  fund_account_id: string | null;
  funds_reserved: boolean;
  payment_reference: string | null;
}

export function roleFor(employeeType: string | null | undefined): Role {
  if (["School Office", "bill_employee_fill", "bill_employee_edit"].includes(employeeType || "")) return "school";
  if (["Store & Purchase", "Student Purchase"].includes(employeeType || "")) return "store";
  if (employeeType === "Audit") return "audit";
  if (employeeType === "Finance Admin") return "finance";
  return "claimant";
}

export const QUEUES: Record<Role, Stage[]> = {
  claimant: [],
  school: ["school_stock", "school_authority", "school_chair"],
  store: ["central_stock"], audit: ["audit"], finance: ["finance", "payment"],
};

export function canReview(actor: Actor, claim: Pick<Claim, "stage" | "department" | "decision">) {
  return claim.decision !== "rejected" && QUEUES[actor.role].includes(claim.stage)
    && (actor.role !== "school" || actor.department === claim.department);
}

export function canRead(actor: Actor, claim: Claim) {
  return claim.claimant_id === actor.id || canReview(actor, claim) || (claim.events || []).some((event) => event.actor === actor.id);
}

export function isAsset(category: Category | null) { return category === "Minor" || category === "Major"; }

export function afterSchool(claim: Pick<Claim, "claim_type" | "category" | "amount">): Stage {
  if (claim.claim_type === "Travel") return "audit";
  if (isAsset(claim.category)) return "central_stock";
  if (claim.amount > 50000) return "audit";
  if (claim.category === "Consumables") return "finance";
  // User-confirmed clarification: other non-asset purchases <= Rs 50,000 go to F&A.
  return "finance";
}

export function nextStage(claim: Pick<Claim, "stage" | "claim_type" | "category" | "amount">): Stage {
  switch (claim.stage) {
    case "school_stock": return "school_authority";
    case "school_authority": return "school_chair";
    case "school_chair": return afterSchool(claim);
    case "central_stock": return claim.amount > 50000 ? "audit" : "finance";
    case "audit": return "finance";
    case "finance": return "payment";
    case "payment": return "paid";
    default: throw new Error("This claim cannot advance without an agreed routing rule.");
  }
}

export function routePreview(type: ClaimType, category: Category | null, amount: number) {
  const result: Stage[] = ["school_stock", "school_authority", "school_chair"];
  let stage = afterSchool({ claim_type: type, category, amount });
  result.push(stage);
  while (stage !== "paid") {
    stage = nextStage({ stage, claim_type: type, category, amount });
    result.push(stage);
  }
  return result;
}

export function validateAction(claim: Claim, actor: Actor, action: Action, reference: string, approver: string, note: string) {
  if (!canReview(actor, claim)) throw new Error("This claim is not in your review queue.");
  if (!["advance", "hold", "reject"].includes(action)) throw new Error("Unknown action.");
  if (action !== "advance") {
    if (!note.trim()) throw new Error("Provide a reason for holding or rejecting the claim.");
    return;
  }
  nextStage(claim);
  if (!reference.trim()) throw new Error("Enter the verification, approval, register, or payment reference.");
  if (["school_authority", "school_chair"].includes(claim.stage) && !approver.trim()) {
    throw new Error("Enter the name of the person whose approval was obtained.");
  }
}

export function validateSubmission(input: Record<string, unknown>, documentKinds: string[]) {
  if (!["Student", "Employee", "Faculty"].includes(String(input.claimant_type))) throw new Error("Select a claimant type.");
  if (!["Travel", "Purchase"].includes(String(input.claim_type))) throw new Error("Select a claim type.");
  if (!String(input.claimant_name || "").trim() || !String(input.department || "").trim()) throw new Error("Name and School / department are required.");
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 9999999999.99 || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.0001) throw new Error("Enter a positive amount with at most two decimal places.");
  if (input.claim_type === "Purchase") {
    if (!["Minor", "Major", "Consumables", "Other"].includes(String(input.category))) throw new Error("Select a purchase category.");
    if (!documentKinds.includes("invoice")) throw new Error("Attach the purchase invoice.");
  } else if (!documentKinds.includes("tada") || !documentKinds.includes("supporting")) {
    throw new Error("Attach the completed TA/DA form and supporting travel documents.");
  }
}
