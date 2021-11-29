import ButtressDb from '../buttress-db.js';
import {AppDb} from '../buttress-db-schema.js';

import chai from '@esm-bundle/chai';
import {fixture, html, waitUntil} from '@open-wc/testing';

const assert = chai.assert;

describe('buttress-db', async () => {

  const Schema = 'post';

  let entityId = null;
  const entityOriginalContent = `Test Post Original ${Math.floor(Math.random() * 999) + 1}`;
  const entityNewContent = `Test Post Modified ${Math.floor(Math.random() * 999) + 1}`;

  const element = /** @type {ButtressDb} */ (await fixture(html`
    <buttress-db
      endpoint="https://test.local.buttressjs.com",
      app-id="Q814lldQYVh5o0UAd1kRpwlkIVcZIw9N",
      api-path="bjs",
      user-id="1",
      token="ddxpIdw1pQEhokFV05A9AoN5QplJMpBhsIkA" 
    ></buttress-db>
  `));

  it('should be defined', () => {
    assert.instanceOf(element, ButtressDb);
  });

  it('should connect to buttress', async () => {
    await waitUntil(() => element.loaded, `Slow load or unable to connect to Buttress ${element.endpoint}`);
    await waitUntil(() => element.io.connected, `Unable to connected to socket ${element.endpoint}`);
  });

  it(`should add a new ${Schema} to the ${Schema}s collection`, async() => {
    const entity = AppDb.Factory.create(`${Schema}s`);
    entity.content = entityOriginalContent;

    // Check the initial state of the data service
    assert.equal(element.db.post.status, 'done');

    // Get the current array length & Push the new element
    const collectionLength = element.db.post.data.length;
    element.push(`db.post.data`, entity);

    // Check and wait for the data service state to go back to done
    assert.equal(element.db.post.status, 'working');
    await waitUntil(() => element.db.post.status === 'done');

    // The newly created post should now have an id
    assert.exists(entity.id, 'post doesn\'t have an id');
    entityId = entity.id;

    // Check the length of the data service
    assert.lengthOf(element.db.post.data, collectionLength + 1);
  });

  it(`should find & edit a Schema`, async() => {
    // Find the entity we created in the collection
    const entityIdx = element.db.post.data.findIndex((b) => b.id === entityId);
    assert.isAbove(entityIdx, -1, `Unable to find post with id ${entityId}'`);
    
    // Double check the content
    assert.equal(element.db.post.data[entityIdx].content, entityOriginalContent);

    // Check the initial state of the data service
    assert.equal(element.db.post.status, 'done');

    // // Get the current array length & Push the new element
    element.set(`db.post.data.${entityIdx}.content`, entityNewContent);

    // Check and wait for the data service state to go back to done
    assert.equal(element.db.post.status, 'working');
    await waitUntil(() => element.db.post.status === 'done');

    // Check the content of the post
    assert.equal(element.db.post.data[entityIdx].content, entityNewContent);
  });

  it(`should remove a ${Schema} from the collection`, async() => {
    // Find the post we created in the collection
    const entityIdx = element.db.post.data.findIndex((b) => b.id === entityId);
    assert.isAbove(entityIdx, -1, `Unable to find post with id ${entityId}'`);

    // Check the initial state of the data service
    assert.equal(element.db.post.status, 'done');

    // Get the current array length & Push the new element
    const collectionLength = element.db.post.data.length;
    element.splice(`db.post.data`, entityIdx, 1);

    // Check and wait for the data service state to go back to done
    assert.equal(element.db.post.status, 'working');
    await waitUntil(() => element.db.post.status === 'done');

    // Check the length of the data service
    assert.lengthOf(element.db.post.data, collectionLength - 1);
  });
});
