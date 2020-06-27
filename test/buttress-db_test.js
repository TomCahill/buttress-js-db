import {ButtressDb} from '../buttress-db';
// import {fixture, html} from '@open-wc/testing';

const assert = chai.assert;

suite('buttress-db', () => {
  test('is defined', () => {
    const el = document.createElement('buttress-db');
    assert.instanceOf(el, ButtressDb);
  });
});
