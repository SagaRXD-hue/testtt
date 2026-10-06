import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '../tmp/db-test/node_modules/@electric-sql/pglite/dist/index.js';
import { routePreview } from '../src/lib/reimbursements/workflow.ts';

// An isolated PostgreSQL engine; never connects to the configured Supabase project.
const db = new PGlite();
before(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create type public.department as enum ('School A','School B');
    create table public.employees (employee_type text constraint employees_employee_type_check check (employee_type in ('Audit')));
    create table public.pda_balances (id uuid primary key, employee_id text, balance numeric(12,2), updated_at timestamptz, department public.department);
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  `);
  await db.exec(await readFile(new URL('../supabase/migrations/202610060001_reimbursements.sql', import.meta.url), 'utf8'));
});
after(async () => { await db.close(); });

async function account(balance = 100000, department = 'School A') {
  const id = randomUUID();
  await db.query('insert into pda_balances (id, employee_id, balance, department) values ($1,$2,$3,$4)', [id, 'fund-owner', balance, department]);
  return id;
}
async function claim({ amount = 50000, stage = 'finance', type = 'Purchase', category = 'Minor' } = {}) {
  const id = randomUUID();
  await db.query(`insert into reimbursement_claims (id, claimant_id, claimant_name, claimant_type, department, claim_type, category, amount, stage) values ($1,'student','Student','Student','School A',$2,$3,$4,$5)`, [id, type, type === 'Travel' ? null : category, amount, stage]);
  return id;
}
async function act(id, version, next, { action = 'advance', reference = randomUUID(), approver = 'Recorded approver', note = '', fund = null } = {}) {
  return (await db.query('select * from public.advance_reimbursement($1,$2,$3,$4,$5,$6,$7,$8,$9)', [id, version, 'reviewer', action, next, reference, approver, note, fund])).rows[0];
}
async function balance(id) { return Number((await db.query('select balance from pda_balances where id=$1', [id])).rows[0].balance); }

for (const type of ['Travel', 'Minor', 'Major', 'Consumables', 'Other']) {
  for (const amount of [49999.99, 50000, 50000.01]) {
    test(`database routes ${type} ${amount} identically to the UI`, async () => {
      const travel = type === 'Travel';
      const id = await claim({ type: travel ? 'Travel' : 'Purchase', category: travel ? null : type, amount, stage: 'school_stock' });
      const fund = await account(100000);
      const route = routePreview(travel ? 'Travel' : 'Purchase', travel ? null : type, amount);
      for (let i = 1; i < route.length; i++) {
        const result = await act(id, i - 1, route[i], { fund: route[i - 1] === 'finance' ? fund : null });
        assert.equal(result.stage, route[i]);
      }
      assert.equal(Math.round((await balance(fund)) * 100), Math.round((100000 - amount) * 100));
    });
  }
}

test('database rejects stage skipping and missing approval evidence', async () => {
  const id = await claim({ stage: 'school_authority' });
  await assert.rejects(act(id, 0, 'finance'), /Invalid workflow transition/);
  await assert.rejects(act(id, 0, 'school_chair', { approver: '' }), /Approval holder/);
  await assert.rejects(act(id, 0, 'school_chair', { reference: '' }), /reference is required/);
});
test('insufficient funds and wrong-department accounts leave the claim unchanged', async () => {
  const id = await claim();
  const fund = await account(49999.99);
  await assert.rejects(act(id, 0, 'payment', { fund }), /Insufficient funds/);
  await assert.rejects(act(id, 0, 'payment', { fund: await account(100000, 'School B') }), /claim department/);
  const row = (await db.query('select stage,version from reimbursement_claims where id=$1', [id])).rows[0];
  assert.deepEqual(row, { stage: 'finance', version: 0 });
  assert.equal(await balance(fund), 49999.99);
});
test('replaying the same approval cannot deduct funds twice', async () => {
  const id = await claim(); const fund = await account();
  await act(id, 0, 'payment', { fund });
  await assert.rejects(act(id, 0, 'payment', { fund }), /Refresh/);
  assert.equal(await balance(fund), 50000);
});
test('competing claims cannot overspend one account', async () => {
  const fund = await account(100000);
  const first = await claim({ amount: 80000 }); const second = await claim({ amount: 80000 });
  const results = await Promise.allSettled([act(first, 0, 'payment', { fund }), act(second, 0, 'payment', { fund })]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(await balance(fund), 20000);
});
test('holding retains funds; rejecting returns them exactly once', async () => {
  const id = await claim(); const fund = await account();
  await act(id, 0, 'payment', { fund });
  await act(id, 1, 'payment', { action: 'hold', note: 'Awaiting payment details' });
  assert.equal(await balance(fund), 50000);
  await act(id, 2, 'payment', { action: 'reject', note: 'Claim withdrawn before payment' });
  assert.equal(await balance(fund), 100000);
  await assert.rejects(act(id, 3, 'payment', { action: 'reject', note: 'Retry' }), /closed/);
  assert.equal(await balance(fund), 100000);
});
test('payment completion does not deduct again and paid claims cannot be refunded', async () => {
  const id = await claim(); const fund = await account();
  await act(id, 0, 'payment', { fund });
  const result = await act(id, 1, 'paid', { reference: 'BANK-TEST-001' });
  assert.equal(result.payment_reference, 'BANK-TEST-001');
  assert.equal(await balance(fund), 50000);
  await assert.rejects(act(id, 2, 'paid', { action: 'reject', note: 'Retry' }), /closed/);
});
test('duplicate payment references are rejected without closing the other claim', async () => {
  const id = await claim(); const fund = await account();
  await act(id, 0, 'payment', { fund });
  await assert.rejects(act(id, 1, 'paid', { reference: 'BANK-TEST-001' }), /duplicate key/);
  const result = await act(id, 1, 'paid', { reference: 'BANK-TEST-002' });
  assert.equal(result.stage, 'paid');
});
test('anonymous and browser-authenticated roles have no direct workflow access', async () => {
  const rows = (await db.query(`select
    has_table_privilege('anon','public.reimbursement_claims','SELECT') as anon_read,
    has_table_privilege('authenticated','public.reimbursement_claims','UPDATE') as client_update,
    has_function_privilege('anon','public.advance_reimbursement(uuid,integer,text,text,text,text,text,text,uuid)','EXECUTE') as anon_rpc,
    has_function_privilege('service_role','public.advance_reimbursement(uuid,integer,text,text,text,text,text,text,uuid)','EXECUTE') as server_rpc`)).rows;
  assert.deepEqual(rows[0], { anon_read: false, client_update: false, anon_rpc: false, server_rpc: true });
  assert.equal((await db.query('select public from storage.buckets')).rows[0].public, false);
});
