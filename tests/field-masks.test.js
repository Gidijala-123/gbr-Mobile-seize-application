const test = require('node:test');
const assert = require('node:assert/strict');

const {
  formatPhoneInput,
  formatImeiInput,
  formatRollNoInput,
  captureIntakeFormState,
  restoreIntakeFormState,
  captureRecentIntakeValues,
  restoreRecentIntakeValues,
} = require('../public/javascripts/field-masks.js');

test('formatPhoneInput applies the India mobile mask to raw digits', () => {
  assert.equal(formatPhoneInput('9876543210'), '+91 98765 43210');
  assert.equal(formatPhoneInput('+91 9876543210'), '+91 98765 43210');
});

test('formatImeiInput groups IMEI digits into the standard 4-4-4-3 pattern', () => {
  assert.equal(formatImeiInput('123456789012345'), '1234-5678-9012-345');
  assert.equal(formatImeiInput(' 123456789012345 '), '1234-5678-9012-345');
});

test('formatRollNoInput keeps the roll number readable and uppercase', () => {
  assert.equal(formatRollNoInput('23a8-1a01-01'), '23A8-1A01-01');
  assert.equal(formatRollNoInput('23a81a0101'), '23A8-1A01-01');
});

test('captureIntakeFormState and restoreIntakeFormState preserve recent intake values for reset and undo', () => {
  const form = {
    elements: [
      { name: 'sname', value: 'Aisha Khan', type: 'text' },
      { name: 'pname', value: 'Zaid Khan', type: 'text' },
      { name: 'spno', value: '+91 98765 43210', type: 'text' },
      { name: 'rno', value: '23A8-1A01-01', type: 'text' },
      { name: 'clg', value: 'ACET', tagName: 'SELECT' },
      { name: 'rsn', value: 'Lost phone in hostel', type: 'textarea' },
    ],
  };

  const snapshot = captureIntakeFormState(form);

  assert.equal(snapshot.sname, 'Aisha Khan');
  assert.equal(snapshot.spno, '+91 98765 43210');
  assert.equal(snapshot.rno, '23A8-1A01-01');

  for (const element of form.elements) {
    element.value = '';
  }

  restoreIntakeFormState(form, snapshot);

  assert.equal(form.elements.find((item) => item.name === 'sname').value, 'Aisha Khan');
  assert.equal(form.elements.find((item) => item.name === 'spno').value, '+91 98765 43210');
  assert.equal(form.elements.find((item) => item.name === 'clg').value, 'ACET');
});

test('recent intake values restore defaults without overwriting filled fields', () => {
  const form = {
    elements: [
      { name: 'clg', value: 'ADTP', tagName: 'SELECT', selectedIndex: 0 },
      { name: 'brch', value: '', tagName: 'SELECT', selectedIndex: 0 },
      { name: 'ename', value: 'Current Staff', type: 'text' },
      { name: 'eid', value: '', type: 'text' },
      { name: 'sname', value: 'New Student', type: 'text' },
    ],
  };

  const recentValues = captureRecentIntakeValues(form, ['clg', 'brch', 'ename', 'eid']);
  assert.deepEqual(recentValues, {
    clg: 'ADTP',
    brch: '',
    ename: 'Current Staff',
    eid: '',
  });

  recentValues.clg = 'ACET';
  recentValues.brch = 'BCA';
  recentValues.ename = 'Remembered Staff';
  recentValues.eid = 'EMP-42';
  restoreRecentIntakeValues(form, recentValues);

  assert.equal(form.elements[0].value, 'ACET');
  assert.equal(form.elements[1].value, 'BCA');
  assert.equal(form.elements[2].value, 'Current Staff');
  assert.equal(form.elements[3].value, 'EMP-42');
  assert.equal(form.elements[4].value, 'New Student');
});
