import {ButtressDb} from '../buttress-db';
import {AppDb} from '../buttress-db-schema';
import {fixture, html, waitUntil} from '@open-wc/testing';

const assert = chai.assert;

suite('buttress-db', async () => {

  const Schema = 'board';

  let entityId = null;
  const entityOriginalName = `Test Board Original ${Math.floor(Math.random() * 999) + 1}`;
  const entityNewName = `Test Board Modified ${Math.floor(Math.random() * 999) + 1}`;

  const element = /** @type {ButtressDb} */ (await fixture(html`
    <buttress-db
      endpoint="http://test.buttressjs.com",
      app-id="45tRsh1R0Vo80ANAAJEs8gFB5NNk4A14",
      api-path="bjs",
      user-id="1",
      token="I8N9hRAZhcJZQB4kM41YIc8o11M5VpwYl1Qc" 
    ></buttress-db>
  `));

  test('should be defined', () => {
    assert.instanceOf(element, ButtressDb);
  });

  test('should connect to buttress', async () => {
    await waitUntil(() => element.loaded, `Slow load or unable to connect to Buttress ${element.endpoint}`);
  });

  test(`should add a new ${Schema} to the ${Schema}s collection`, async() => {
    const entity = AppDb.Factory.create(`${Schema}s`);
    entity.name = entityOriginalName;

    // Check the initial state of the data service
    assert.equal(element.db.board.status, 'done');

    // Get the current array length & Push the new element
    const collectionLength = element.db.board.data.length;
    element.push(`db.board.data`, entity);

    // Check and wait for the data service state to go back to done
    assert.equal(element.db.board.status, 'working');
    await waitUntil(() => element.db.board.status === 'done');

    // The newly created board should now have an id
    assert.exists(entity.id, 'board doesn\'t have an id');
    entityId = entity.id;

    // Check the length of the data service
    assert.lengthOf(element.db.board.data, collectionLength + 1);
  });

  test(`should find & edit a Schema`, async() => {
    // Find the entity we created in the collection
    const entityIdx = element.db.board.data.findIndex((b) => b.id === entityId);
    assert.isAbove(entityIdx, -1, `Unable to find board with id ${entityId}'`);
    
    // Double check the name
    assert.equal(element.db.board.data[entityIdx].name, entityOriginalName);

    // Check the initial state of the data service
    assert.equal(element.db.board.status, 'done');

    // // Get the current array length & Push the new element
    element.set(`db.board.data.${entityIdx}.name`, entityNewName);

    // Check and wait for the data service state to go back to done
    assert.equal(element.db.board.status, 'working');
    await waitUntil(() => element.db.board.status === 'done');

    // Check the name of the board
    assert.equal(element.db.board.data[entityIdx].name, entityNewName);
  });

  test(`should remove a ${Schema} from the collection`, async() => {
    // Find the board we created in the collection
    const entityIdx = element.db.board.data.findIndex((b) => b.id === entityId);
    assert.isAbove(entityIdx, -1, `Unable to find board with id ${entityId}'`);

    // Check the initial state of the data service
    assert.equal(element.db.board.status, 'done');

    // Get the current array length & Push the new element
    const collectionLength = element.db.board.data.length;
    element.splice(`db.board.data`, entityIdx, 1);

    // Check and wait for the data service state to go back to done
    assert.equal(element.db.board.status, 'working');
    await waitUntil(() => element.db.board.status === 'done');

    // Check the length of the data service
    assert.lengthOf(element.db.board.data, collectionLength - 1);
  });
});
