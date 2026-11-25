const test = require('node:test');
const assert = require('node:assert/strict');
const { selectDisplaySource } = require('../src/main/display-matcher');

test('matches desktopCapturer source by display_id even when array order differs', () => {
  const displays = [{ id: 101 }, { id: 202 }];
  const sources = [
    { id: 'screen:2:0', display_id: '202' },
    { id: 'screen:1:0', display_id: '101' }
  ];
  const chosen = selectDisplaySource(sources, displays, { id: 101 });
  assert.equal(chosen.display_id, '101');
});
