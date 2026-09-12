import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getBirthDateError, getSignupRequirementsError, koreaToday, UNDERAGE_MESSAGE } from '../src/lib/signupRequirements.ts'

const now = new Date('2026-09-09T03:00:00Z')
test('14th birthday is inclusive; the previous day and younger birthdays are rejected', () => {
  assert.equal(getBirthDateError('2012-09-09', now), '')
  assert.equal(getBirthDateError('2012-09-10', now), UNDERAGE_MESSAGE)
  assert.equal(getBirthDateError('2020-01-01', now), UNDERAGE_MESSAGE)
  assert.equal(getBirthDateError('2012-09-08', now), '')
})
test('empty, impossible, future, and noncanonical dates are rejected', () => {
  for (const value of ['', '2001-02-29', '2012-02-30', '2000-13-01', '2000-00-00', '2027-01-01', '1899-12-31', '2000-1-01', 'invalid']) {
    assert.notEqual(getBirthDateError(value, now), '', value)
  }
  assert.equal(getBirthDateError('2000-02-29', now), '')
})
test('Korean midnight determines eligibility regardless of the device timezone', () => {
  assert.equal(koreaToday(new Date('2026-09-08T15:00:00Z')), '2026-09-09')
  assert.equal(getBirthDateError('2012-09-09', new Date('2026-09-08T14:59:59Z')), UNDERAGE_MESSAGE)
  assert.equal(getBirthDateError('2012-09-09', new Date('2026-09-08T15:00:00Z')), '')
})
test('February 29 birthdays become eligible on March 1 in a non-leap year', () => {
  assert.equal(getBirthDateError('2012-02-29', new Date('2026-02-28T03:00:00Z')), UNDERAGE_MESSAGE)
  assert.equal(getBirthDateError('2012-02-29', new Date('2026-03-01T03:00:00Z')), '')
})
test('required consents are independent and location consent is optional', () => {
  const valid = { birthDate: '2000-01-01', termsAccepted: true, privacyAccepted: true, locationAccepted: false }
  assert.equal(getSignupRequirementsError(valid, now), '')
  assert.notEqual(getSignupRequirementsError({ ...valid, termsAccepted: false }, now), '')
  assert.notEqual(getSignupRequirementsError({ ...valid, privacyAccepted: false }, now), '')
  assert.equal(getSignupRequirementsError({ ...valid, birthDate: '2020-01-01' }, now), UNDERAGE_MESSAGE)
})
