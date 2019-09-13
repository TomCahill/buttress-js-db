if (!window.Buttress) window.Buttress = {};

window.Buttress.Worker = () => {
  let db = null;

  const tasks = {
    init: (payload) => __init(payload),
    write: (payload) => __write(payload.collection, collection.item),
    bulkWrite: (payload) => __bulkWrite(payload),
    readAll: (payload) => __readAll(payload),
  }
  
  self.onmessage = function(event) {
    const payload = event.data;
    if (!payload) return;
    if (!payload.task) throw new Error('Task name not passed');

    const id = (payload.id) ? payload.id : null;
    const task = tasks[payload.task];

    return task(payload)
      .then(res => {
        self.postMessage({
          id: id,
          task: payload.task,
          result: res
        })
      });
  }

  const __init = (payload) => {
    if (db) return Promise.reject('DB already init');

    return new Promise((resolve) => {
      const req = indexedDB.open(payload.name, payload.version);
      req.onupgradeneeded = function(ev) {
        const upgradeDB = ev.target.result;
        payload.collections.forEach((name) => {
          if (!upgradeDB.objectStoreNames.contains(name)) {
            upgradeDB.createObjectStore(name, {
              keyPath: 'id'
            });
          }
        });
      };
      req.onsuccess = function() {
        console.log('DB init');
        db = req.result;
        return resolve(true);
      };
      req.onerror = function(ev) {
        console.error('Error init DB');
        return reject(ev);
      };
    });
  };

  const __write = (collectionName, item) => {
    if (!db) return Promise.reject('DB isn\'t init');
  
    return new Promise((resolve, reject) => {
      const tx = db.transaction(collectionName, 'readwrite');
      const collection = tx.objectStore(collectionName);
      collection.add(item);
      tx.oncomplete = () => {
        return resolve(true);
      };
      tx.onerror = (err) => {
        return reject(err);
      };
    });
  };

  const __bulkWrite = (payload) => {
    if (!db) return Promise.reject('DB isn\'t init');

    if (!payload.items) return Promise.reject('Items not part of bulk write payload');

    console.log('__bulkWrite', payload.collection, payload.items.length);
  
    return new Promise((resolve, reject) => {
      return payload.items.reduce((prev, item) => {
        return prev.then(() => __write(payload.collection, item));
      }, Promise.resolve())
      .then(resolve);
    });
  }

  const __readAll = (payload) => {
    if (!db) return Promise.reject('DB isn\'t init');
  
    return new Promise((resolve, reject) => {
      const tx = db.transaction(payload.collection);
      const collection = tx.objectStore(payload.collection);
      const cmd = collection.getAll();
      tx.oncomplete = () => {
        return resolve(cmd.result);
      };
      tx.onerror = (err) => {
        return reject(err);
      };
    });
  };
};