-- New claims use an isolated, server-only workflow. Existing bills remain legacy records.
begin;

create table public.reimbursement_claims (
  id uuid primary key default gen_random_uuid(),
  claimant_id text not null,
  claimant_name text not null,
  claimant_type text not null check (claimant_type in ('Student','Employee','Faculty')),
  department public.department not null,
  claim_type text not null check (claim_type in ('Travel','Purchase')),
  category text check (category in ('Minor','Major','Consumables','Other')),
  amount numeric(12,2) not null check (amount > 0),
  details jsonb not null default '{}',
  documents jsonb not null default '[]',
  stage text not null default 'school_stock' check (stage in ('school_stock','school_authority','school_chair','central_stock','audit','finance','payment','paid')),
  decision text not null default 'active' check (decision in ('active','hold','rejected')),
  version integer not null default 0,
  events jsonb not null default '[]',
  fund_account_id uuid references public.pda_balances(id),
  funds_reserved boolean not null default false,
  payment_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((claim_type = 'Travel' and category is null) or (claim_type = 'Purchase' and category is not null))
);
create index reimbursement_claimant_idx on public.reimbursement_claims(claimant_id, created_at desc);
create index reimbursement_queue_idx on public.reimbursement_claims(stage, department, created_at desc);
create unique index reimbursement_payment_reference_idx on public.reimbursement_claims(payment_reference) where payment_reference is not null;
alter table public.reimbursement_claims enable row level security;
revoke all on public.reimbursement_claims from anon, authenticated;
grant all on public.reimbursement_claims to service_role;

alter table public.employees drop constraint if exists employees_employee_type_check;
alter table public.employees add constraint employees_employee_type_check check (
  employee_type in ('Finance Admin','Finance Employee','Audit','Bill Employee','Student Purchase','bill_employee_edit','bill_employee_fill','pda-manager','School Office','Store & Purchase')
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reimbursement-documents', 'reimbursement-documents', false, 10485760, array['application/pdf','image/jpeg','image/png'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Called only by the authenticated server after checking the actor's current DB role.
-- Row locks and a version check serialize approvals and prevent duplicate fund deductions.
create function public.advance_reimbursement(
  p_id uuid, p_version integer, p_actor text, p_action text,
  p_next_stage text, p_reference text, p_approver text, p_note text,
  p_account uuid default null
) returns public.reimbursement_claims
language plpgsql security definer set search_path = '' as $$
declare
  c public.reimbursement_claims;
  account public.pda_balances;
  expected_stage text;
begin
  select * into c from public.reimbursement_claims where id = p_id for update;
  if not found then raise exception 'Claim not found'; end if;
  if c.version is distinct from p_version then raise exception 'This claim changed. Refresh and try again.'; end if;
  if c.decision = 'rejected' or c.stage = 'paid' then raise exception 'This claim is closed'; end if;
  if p_action is null or p_action not in ('advance','hold','reject') then raise exception 'Invalid action'; end if;
  if p_action <> 'advance' and nullif(btrim(p_note), '') is null then raise exception 'A reason is required'; end if;

  if p_action = 'advance' then
    if nullif(btrim(p_reference), '') is null then raise exception 'A reference is required'; end if;
    if c.stage in ('school_authority','school_chair') and nullif(btrim(p_approver), '') is null then raise exception 'Approval holder name is required'; end if;
    expected_stage := case c.stage
      when 'school_stock' then 'school_authority'
      when 'school_authority' then 'school_chair'
      when 'school_chair' then case
        when c.claim_type = 'Travel' then 'audit'
        when c.category in ('Minor','Major') then 'central_stock'
        when c.amount > 50000 then 'audit'
        when c.category = 'Consumables' then 'finance'
        else 'finance' end
      when 'central_stock' then case when c.amount > 50000 then 'audit' else 'finance' end
      when 'audit' then 'finance'
      when 'finance' then 'payment'
      when 'payment' then 'paid'
      else null end;
    if expected_stage is null or p_next_stage is distinct from expected_stage then raise exception 'Invalid workflow transition'; end if;

    if c.stage = 'finance' then
      select * into account from public.pda_balances where id = p_account for update;
      if not found or account.department is distinct from c.department then raise exception 'Select a fund account in the claim department'; end if;
      if account.balance is null or account.balance < c.amount then raise exception 'Insufficient funds. Claim remains with Finance & Accounts.'; end if;
      update public.pda_balances set balance = balance - c.amount, updated_at = now() where id = account.id;
      c.fund_account_id := account.id;
      c.funds_reserved := true;
    end if;
    if c.stage = 'payment' then
      if not c.funds_reserved then raise exception 'Funds have not been checked and reserved'; end if;
      c.payment_reference := btrim(p_reference);
    end if;
  elsif p_action = 'reject' and c.funds_reserved then
    update public.pda_balances set balance = balance + c.amount, updated_at = now() where id = c.fund_account_id;
    c.funds_reserved := false;
  end if;

  update public.reimbursement_claims set
    stage = case when p_action = 'advance' then p_next_stage else c.stage end,
    decision = case p_action when 'hold' then 'hold' when 'reject' then 'rejected' else 'active' end,
    events = c.events || jsonb_build_array(jsonb_build_object(
      'actor', p_actor, 'action', p_action, 'stage', c.stage, 'reference', p_reference,
      'approver', p_approver, 'note', p_note, 'at', now())),
    fund_account_id = c.fund_account_id, funds_reserved = c.funds_reserved,
    payment_reference = c.payment_reference,
    version = c.version + 1, updated_at = now()
  where id = c.id returning * into c;
  return c;
end;
$$;
revoke all on function public.advance_reimbursement(uuid,integer,text,text,text,text,text,text,uuid) from public, anon, authenticated;
grant execute on function public.advance_reimbursement(uuid,integer,text,text,text,text,text,text,uuid) to service_role;
commit;
