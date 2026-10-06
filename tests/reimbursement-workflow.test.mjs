import test from 'node:test';
import assert from 'node:assert/strict';
import { afterSchool, nextStage, routePreview, roleFor, canRead, canReview, validateAction, validateSubmission } from '../src/lib/reimbursements/workflow.ts';

const base = { id: 'claim', claimant_id: 'applicant', claimant_name: 'Applicant', claimant_type: 'Student', department: 'School A', claim_type: 'Purchase', category: 'Minor', amount: 50000, stage: 'school_stock', decision: 'active', version: 0 };
const school = { id: 'clerk', role: 'school', department: 'School A' };
const firstStages = ['school_stock', 'school_authority', 'school_chair'];

for (const claimant of ['Student', 'Employee', 'Faculty']) {
  for (const amount of [49999.99, 50000, 50000.01]) {
    test(`${claimant}: travel ${amount} always requires Audit and no central stock`, () => {
      const route = routePreview('Travel', null, amount);
      assert.deepEqual(route, [...firstStages, 'audit', 'finance', 'payment', 'paid']);
    });
    for (const category of ['Minor', 'Major', 'Consumables', 'Other']) {
      test(`${claimant}: ${category} ${amount} follows the approved route`, () => {
        const stages = [...firstStages];
        if (category === 'Minor' || category === 'Major') stages.push('central_stock');
        if (amount > 50000) stages.push('audit');
        stages.push('finance', 'payment', 'paid');
        assert.deepEqual(routePreview('Purchase', category, amount), stages);
      });
    }
  }
}

test('minor items take the central stock route before the amount-based route', () => {
  assert.equal(afterSchool({ ...base, amount: 100000 }), 'central_stock');
  assert.equal(nextStage({ ...base, stage: 'central_stock', amount: 50000 }), 'finance');
});
test('school permissions require the same department', () => {
  assert.ok(canReview(school, base));
  assert.equal(canReview({ ...school, department: 'School B' }, base), false);
  assert.equal(canReview({ ...school, department: null }, base), false);
  assert.equal(canReview({ id: 'finance', role: 'finance', department: null }, base), false);
});
test('claimants can read their own claims but cannot approve them', () => {
  const claimant = { id: 'applicant', role: 'claimant', department: 'School A' };
  assert.ok(canRead(claimant, base));
  assert.equal(canReview(claimant, base), false);
  assert.equal(canRead({ ...claimant, id: 'stranger' }, base), false);
});
test('a past reviewer can follow a claim but cannot act in the next section', () => {
  const claim = { ...base, stage: 'audit', events: [{ actor: school.id }] };
  assert.ok(canRead(school, claim));
  assert.equal(canReview(school, claim), false);
  assert.equal(canRead({ ...school, id: 'another-clerk' }, claim), false);
});
test('hold stays with the same reviewer and rejected / paid claims cannot advance', () => {
  assert.ok(canReview(school, { ...base, decision: 'hold' }));
  assert.equal(canReview(school, { ...base, decision: 'rejected' }), false);
  assert.throws(() => nextStage({ ...base, stage: 'paid' }));
});
test('both authority approvals require a named approver and a reference', () => {
  for (const stage of ['school_authority', 'school_chair']) {
    assert.throws(() => validateAction({ ...base, stage }, school, 'advance', 'REF', '', ''));
    assert.throws(() => validateAction({ ...base, stage }, school, 'advance', '', 'Approver', ''));
    assert.doesNotThrow(() => validateAction({ ...base, stage }, school, 'advance', 'REF', 'Approver', ''));
  }
});
test('hold/reject require reasons and cannot bypass role checks', () => {
  for (const action of ['hold', 'reject']) {
    assert.throws(() => validateAction(base, school, action, '', '', ''));
    assert.doesNotThrow(() => validateAction(base, school, action, '', '', 'Missing evidence'));
    assert.throws(() => validateAction(base, { ...school, role: 'claimant' }, action, '', '', 'Reason'));
  }
});
test('purchase invoices and travel TA/DA plus supporting documents are mandatory', () => {
  assert.throws(() => validateSubmission(base, []));
  assert.doesNotThrow(() => validateSubmission(base, ['invoice']));
  const travel = { ...base, claim_type: 'Travel', category: null };
  for (const kinds of [[], ['invoice'], ['tada'], ['supporting']]) assert.throws(() => validateSubmission(travel, kinds));
  assert.doesNotThrow(() => validateSubmission(travel, ['tada', 'supporting']));
});
test('invalid money, category and claimant types are rejected', () => {
  for (const amount of [0, -1, NaN, Infinity, 10.001, 10000000000]) assert.throws(() => validateSubmission({ ...base, amount }, ['invoice']));
  assert.throws(() => validateSubmission({ ...base, category: 'invalid' }, ['invoice']));
  assert.throws(() => validateSubmission({ ...base, claimant_type: 'invalid' }, ['invoice']));
});
test('existing role names map to the correct processing sections', () => {
  for (const role of ['bill_employee_fill', 'bill_employee_edit', 'School Office']) assert.equal(roleFor(role), 'school');
  assert.equal(roleFor('Student Purchase'), 'store');
  assert.equal(roleFor('Store & Purchase'), 'store');
  assert.equal(roleFor('Audit'), 'audit');
  assert.equal(roleFor('Finance Admin'), 'finance');
  assert.equal(roleFor(undefined), 'claimant');
});
