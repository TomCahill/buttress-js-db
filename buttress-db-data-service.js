import { PolymerElement, html } from '@polymer/polymer/polymer-element.js';

import '@polymer/iron-ajax/iron-ajax.js';

class ButtressDbDataService extends PolymerElement {
  static get is() { return 'buttress-db-data-service'; }

  static get template() {
    return html`
      <style>
        :host {
          display: none;
        }
      </style>

      <iron-ajax 
        id="ajaxService"
        url="{{rqUrl}}",
        handleAs="json",
        method="{{rqMethod}}",
        content-type="{{rqContentType}}",
        params="{{rqParams}}",
        body="{{rqBody}}",
        on-response="__ajaxResponse",
        on-error="__ajaxError",
        last-response="{{rqResponse}}">
      </iron-ajax>
    `;
  }
  static get properties() {
    return {
      token: String,
      endpoint: String,
      apiPath: String,
      status: {
        type: String,
        value: '',
        notify: true,
      },

      logging: {
        type: Boolean,
        value: false
      },

      fingerPrint: Object,

      core: {
        type: Boolean,
        value: false
      },

      priority: {
        type: Number,
        value: '99'
      },
      loaded: {
        type: Boolean,
        value: false,
        notify: true,
        reflectToAttribute: true
      },
      route: {
        type: String,
        value: ''
      },
      data: {
        type: Array,
        value: function() { return []; },
        notify: true
      },
      metadata: {
        type: Object,
        value: function() { return {}; },
        notify: true
      },
      liveData: {
        type: Array,
        value: []
      },
      readOnly: {
        type: Boolean,
        value: false,
        reflectToAttribute: true
      },
      vectorBaseUrl: {
        type: String,
        computed: "__computeVectorBaseUrl(endpoint, route, core, apiPath)"
      },
      scalarBaseUrl: {
        type: String,
        computed: "__computeScalarBaseUrl(endpoint, route, rqEntityId, core, apiPath)"
      },
      requestQueue: {
        type: Array,
        value: function () {
          return [];
        }
      },
      request: {
        type: Object
      },
      rqEntityId: String,
      rqUrl: String,
      rqContentType: String,
      rqParams: {},
      rqBody: {},
      rqResponse: []
    };
  }
  static get observers() {
    return [
      '__dataSplices(data.splices)',
      '__dataChanges(data.*)',
      '__metadataChanged(metadata.*)',
    ];
  }

  connectedCallback() {
    this.dispatchEvent(new CustomEvent('data-service-ready', {detail: this, bubbles: true, composed: true}));
  }

  triggerGet() {
    this.__generateListRequest();
  }

  /**
   * Used to generate Add and Remove requests
   * @param {Object} cr - data needed to calculate what has changed
   * @private
   */
  __dataSplices(cr) {
    if (!cr || this.readOnly) {
      return;
    }
    if (this.get('logging')) console.log('__dataSplices', cr);

    cr.indexSplices.forEach(i => {
      let o = i.object[i.index];
      if (i.addedCount > 0) {
        if (!o.__readonly__) {
          o.id = this.genObjectId(); // don't trigger a notification
          this.__generateAddRequest(o);
        } else {
          delete o.__readonly__;
        }
      }

      // i.object.forEach((a, idx) => {
      //   this.__generateAddRequest(this.get(`data.${idx}`));
      // });

      i.removed.forEach(r => {
        if (!r.__readonly__) {
          this.__generateRmRequest(r.id);
        } else {
          if (this.get('logging')) console.log(`Ignoring __readonly__ splice for ${r.id}`);
          delete r.__readonly__;
        }
      });
    });
  }

  /**
   * Used to update individual records
   * @param {Object} cr - definition of what's changed
   * @private
   */
  __dataChanges(cr) {
    // if (this.get('logging')) console.log(`Internal Change: ${this.__internalChange}`);
    if (this.__internalChange__) {
      delete this.__internalChange__;
      return;
    }
    if (/\.length$/.test(cr.path) === true
      || this.readOnly) {
      return;
    }

    if (this.get('logging')) console.log('__dataChanges: ', cr);
    // Ignore mutations on the whole array
    // if (cr.base.length !== 1) {
    //   return;
    // }

    // ignore paths with fields with __ as prefix and suffix
    if (/__(\w+)__/.test(cr.path)) {
      if (this.get('logging')) console.log(`Ignoring internal change: ${cr.path}`);
      return;
    }

    let path = cr.path.split('.');
    // Is this an array mutation?
    if (/\.splices$/.test(cr.path) === true) {
      if (path.length < 4) {
        if (this.get('logging')) console.log('Ignoring path too short:', path);
        return;
      }

      let entity = this.get(path.slice(0,2));
      // let index = path[1].replace('#', '');
      // if (!cr.base[index]) {
      //   if (this.get('logging')) console.log(`Ignoring: invalid change index: ${index}`);
      //   return;
      // }
      // let entity = cr.base[index];

      // Ignore a one-off readonly change (remove the field afterwards)
      if (entity.__readOnlyChange__) {
        if (this.get('logging')) console.log(`Ignoring readonly change: ${cr.path}`);
        delete entity.__readOnlyChange__;
        return;
      }

      if (this.get('logging')) console.log('Child array mutation', cr);

      if (this.get('logging')) console.log('Key Splices: ', cr.value.indexSplices.length);

      cr.value.indexSplices.forEach(i => {
        let o = i.object[i.index];
        if (i.addedCount > 0) {
          path.splice(0,2);
          path.splice(-1,1);
          // if (this.get('logging')) console.log('Update request', entity.id, path.join('.'), cr.value);
          if (typeof o === 'object') {
            o.id = this.genObjectId();
          }
          this.__generateUpdateRequest(entity.id, path.join('.'), o);
        } else if (i.removed.length > 0){
          if(i.removed.length > 1) {
            if (this.get('logging')) console.log('Index splice removed.length > 1', i.removed);
          } else {
            path.splice(0, 2);
            path.splice(-1, 1);
            path.push(i.index);
            path.push('__remove__');

            this.__generateUpdateRequest(entity.id, path.join('.'), '');
          }
        }
      });

      if (cr.value.indexSplices.length || !cr.value.keySplices) {
        return;
      }

      if (this.get('logging')) console.log('Key Splices: ', cr.value.keySplices.length);

      cr.value.keySplices.forEach((k, idx) => {
        k.removed.forEach(() => {
          let itemIndex = cr.value.indexSplices[idx].index;
          if (this.get('logging')) console.log(itemIndex);

          path.splice(0, 2); // drop the prefix
          path.splice(-1, 1); // drop the .splices
          path.push(itemIndex); // add the correct index

          // path.push(k.replace('#', ''));
          path.push('__remove__'); // add the remove command
          this.__generateUpdateRequest(entity.id, path.join('.'), '');
        });
      });
    } else {
      if (path.length < 3) {
        // if (this.get('logging')) console.log('Ignoring path too short:', path);
        return;
      }
      let entity = this.get(path.slice(0,2));

      // let index = path[1].replace('#', '');
      if (!entity) {
        if (this.get('logging')) console.log(`Ignoring: invalid change index: ${path.slice(0,2)}`);
        return;
      }

      // let entity = cr.base[index];
      // Ignore a one-off readonly change (remove the field afterwards)
      if (entity.__readOnlyChange__) {
        if (this.get('logging')) console.log(`Ignoring readonly change: ${cr.path}`);
        delete entity.__readOnlyChange__;
        return;
      }

      let pathPrefix = path.splice(0, 2).join('.');
      path.forEach((p, idx) => {
        const rex = /^#\d+$/;
        // Is this an assignment directly into an array item?
        if (rex.test(p)) {
          // Grab the base array
          let arr = this.get(pathPrefix);
          // Get the item
          let item = this.get(`${pathPrefix}.${p}`);
          // Replace the 'opaque key' with the correct array index
          path[idx] = arr.indexOf(item);
        }
        pathPrefix += `.${p}`;
      });

      // path.splice(0,2);

      // let tail = path[path.length-1];
      // const rex = /#\d+$/;
      // // Is this an assignment directly into an array item?
      // if (rex.test(tail)) {
      //   // Look up the item
      //   let item = this.get(path);
      //   // Grab the base array
      //   let arr = this.get(path.slice(0,-1));
      //   // Replace the 'opaque key' with the correct array index
      //   path[path.length-1] = arr.indexOf(item);
      // }


      // if (this.get('logging')) console.log('Update request', entity.id, path.join('.'), cr.value);
      this.__generateUpdateRequest(entity.id, path.join('.'), cr.value);
    }
  }

  __metadataChanged(cr) {
    if (this.__internalChange__) {
      if (this.get('logging')) console.log(`Ignoring internal metadata change: ${cr.path}`);
      delete this.__internalChange__;
      return;
    }

    if (/\.length$/.test(cr.path) === true
      || this.readOnly) {
      if (this.get('logging')) console.log('Ignoring .length or readOnly change');
      return;
    }

    // ignore paths with fields with __ as prefix and suffix
    let matches = /^metadata.([0-9a-fA-F]+)/.exec(cr.path);
    if (!matches) {
      if (this.get('logging')) console.log(`Ignoring invalid metadata path: ${cr.path}`);
      return;
    }
    let entityId = matches[1];
    if (this.get('logging')) console.log('__metadataChange', cr);
    if (cr.base.__readOnlyChange__) {
      delete cr.base.__readOnlyChange__;
      if (this.get('logging')) console.log(`Ignoring read only change`);
      return;
    }

    if (cr.value.__populate__) {
      if (this.get('logging')) console.log(`Populating metadata for ${entityId}`);
      delete cr.value.__populate__;
      this.__generateMetadataGetAllRequest(entityId, cr.value);
      return;
    }

    // ignore paths with fields with __ as prefix and suffix
    if (/__(\w+)__/.test(cr.path)) {
      if (this.get('logging')) console.log(`Ignoring internal change: ${cr.path}`);
      return;
    }

    this.__info('__metadataChanged', cr);
    let path = cr.path.split('.');
    // Is this an array mutation?
    if (/\.splices$/.test(cr.path) === true) {
      let remotePath = path.concat();
      remotePath.splice(-1,1);
      let base = this.get(remotePath);
      remotePath.splice(0,2);

      cr.value.indexSplices.forEach(sp => {
        if (!sp.addedCount) return;
        if (typeof sp.object[sp.index] === 'object') {
          sp.object[sp.index].id = this.genObjectId();
        }
      });
      if (this.get('logging')) console.log(base);

      this.__assert(remotePath.length === 1); // Metadata doesn't support remote paths
      this.__generateMetadataUpdateRequest(entityId, remotePath.join('.'), base);
    } else {
      let value = cr.value;
      if (path.length > 3) {
        path = path.splice(0, 3);
        value = this.get(path);
      }
      path.splice(0,2);

      this.__assert(path.length === 1); // Metadata doesn't support remote paths
      this.__generateMetadataUpdateRequest(entityId, path[0], value);
    }
  }

  __generateMetadataGetAllRequest(entityId, defaults) {
    this.rqEntityId = entityId;
    let request = {
      type: 'list-metadata',
      url: `${this.scalarBaseUrl}/metadata`,
      entityId: this.rqEntityId,
      method: 'GET',
      contentType: '',
      body: {},
      defaults: defaults
    };

    this.__queueRequest(request);
  }

  __generateMetadataUpdateRequest(entityId, key, value) {
    this.rqEntityId = entityId;
    let request = {
      type: 'update-metadata',
      url: `${this.scalarBaseUrl}/metadata/${key}`,
      entityId: this.rqEntityId,
      method: 'POST',
      contentType: 'application/json',
      body: {
        value: JSON.stringify(value)
      }
    };

    this.__queueRequest(request);
  }

  __generateListRequest() {
    this.rqEntityId = -1;
    let request = {
      type: 'list',
      url: this.vectorBaseUrl,
      entityId: this.rqEntityId,
      method: 'GET',
      contentType: '',
      body: {}
    };

    this.__queueRequest(request);
  }
  __generateRmRequest(entityId) {
    if (this.get('logging')) console.log(`remove rq: ${entityId}`);

    this.rqEntityId = entityId;
    let request = {
      type: 'rm',
      url: this.scalarBaseUrl,
      entityId: this.rqEntityId,
      method: 'DELETE',
      contentType: '',
      body: {}
    };

    this.__queueRequest(request);
  }
  __generateAddRequest(entity) {
    if (this.get('logging')) console.log(`add rq: ${entity.name}`);

    this.rqEntityId = -1;
    let request = {
      type: 'add',
      url: this.vectorBaseUrl,
      entityId: this.rqEntityId,
      method: 'POST',
      contentType: 'application/json',
      body: entity
    };
    this.__queueRequest(request);
  }
  __generateUpdateRequest(entityId, path, value) {
    if (this.get('logging')) console.log('update rq:',entityId, path, value);

    this.rqEntityId = entityId;
    let request = {
      type: 'update',
      url: this.scalarBaseUrl,
      entityId: this.rqEntityId,
      method: 'PUT',
      contentType: 'application/json',
      body: {
        path: path,
        value: value
      }
    };
    this.__queueRequest(request);
  }

  __queueRequest(request) {
    this.requestQueue.push(request);
    this.__updateQueue();
  }

  __updateQueue() {
    if (this.requestQueue.length === 0) {
      return;
    }

    if (this.status === 'working') {
      return;
    }

    this.__generateRequest(this.requestQueue[0]);
  }

  __generateRequest(rq) {
    const token = this.get('token');
    rq.response = null;
    rq.params = {
      urq: Date.now(),
      token: token
    };

    if (this.get('logging')) console.log(rq.body);
    this.rqUrl = rq.url;
    this.rqMethod = rq.method;
    this.rqContentType = rq.contentType;
    this.rqParams = rq.params;
    this.rqBody = rq.body;

    this.$.ajaxService.generateRequest();
    this.status = 'working';
  }

  __ajaxResponse(ev) {
    let rq = this.requestQueue.shift();

    if (!rq) {
      if (this.get('logging')) console.log('warn', 'Response on an empty requestQueue!!!');
      return;
    }

    rq.response = ev.detail.response;
    switch (rq.type) {
      default:
        break;
      case 'list':
        this.__ajaxListResponse(rq);
        break;
      case 'list-metadata':
        this.__ajaxListMetadataResponse(rq);
        break;
      // case 'update': {
      //   this.__ajaxUpdateResponse(rq);
      // } break;
      // case 'add': {
      //   this.__ajaxAddResponse(rq);
      // } break;
    }

    this.status = 'done';
    this.__updateQueue();
  }
  __ajaxError() {
    this.status = 'error';
  }

  __ajaxListResponse(rq) {
    if (this.get('logging')) console.log('__ajaxListResponse', rq);
    this.__internalChange__ = true;
    this.data = this.liveData = rq.response;
    this.dispatchEvent(new CustomEvent('data-service-list', {detail: this, bubbles: true, composed: true}));
    this.set('loaded', true);
  }
  __ajaxListMetadataResponse(rq) {
    // this.set(['metadata',rq.entityId], rq.response);
    for (let field in rq.defaults) {
      if (!Object.prototype.hasOwnProperty.call(rq.defaults, field)) {
        continue;
      }
      this.__internalChange__ = true;
      if (rq.response[field]) {
        this.set(['metadata', rq.entityId, field], rq.response[field]);
      } else {
        this.set(['metadata', rq.entityId, field], rq.defaults[field]);
      }
    }
  }

  __ajaxAddResponse(rq) {
    let data = this.data;
    for (let x=0; x<data.length; x++) {
      if (!data[x].id) {
        this.data[x].__readOnlyChange__ = true;
        this.set(['data', x, 'id'], rq.response.id);
        break;
      }
    }
  }

  __ajaxUpdateResponse(rq) {
    if (this.get('logging')) console.log('__ajaxUpdateResponse', rq);
    const responses = rq.response;
    responses.forEach(r => {
      if (!(r.value instanceof Object) || r.type !== 'vector-add' || !r.value.id) {
        if (this.get('logging')) console.log('update early out', r.value instanceof Object);
        return;
      }
      let idx = this.get('data').findIndex(e => e.id == rq.entityId); //eslint-disable-line eqeqeq
      if (idx === -1) {
        if (this.get('logging')) console.log('warn', 'Invalid entity id', rq.entityId);
        return;
      }
      let base = this.get(['data', idx, r.path]);
      if (this.get('logging')) console.log(['data', idx, r.path], base);
      if (base instanceof Array) {
        for (let x=0; x<base.length; x++) {
          if (!base[x].id) {
            if (base[x].name !== undefined && r.value.name === base[x].name) {
              if (this.get('logging')) console.log('Setting array item id using item name', r.value.id, r.value.name);
              this.data[idx].__readOnlyChange__ = true;
              if (this.get('logging')) console.log(['data', idx, rq.body.path, x, 'id']);
              this.set(['data', idx, rq.body.path, x, 'id'], r.value.id);

              break;
            } else if (base[x].name === undefined) {
              this.data[idx].__readOnlyChange__ = true;
              if (this.get('logging')) console.log(['data', idx, rq.body.path, x, 'id']);
              this.set(['data', idx, rq.body.path, x, 'id'], r.value.id);

              break;
            }
          }
        }
      }
    });
  }

  genObjectId(time) {
    const fingerPrint = this.get('fingerPrint');

    if ('number' != typeof time) {
      time = ~~(Date.now()/1000);
    }

    const memory = new ArrayBuffer(12);
    const buffer   = new Uint8Array(memory);

    this.set('fingerPrint.inc', fingerPrint.inc + 1);

    if (this.get('logging')) console.log(time);

    // Encode time
    buffer[3] = time & 0xff;
    buffer[2] = (time >> 8) & 0xff;
    buffer[1] = (time >> 16) & 0xff;
    buffer[0] = (time >> 24) & 0xff;
    // Encode machine
    buffer[6] = fingerPrint.machineId & 0xff;
    buffer[5] = (fingerPrint.machineId >> 8) & 0xff;
    buffer[4] = (fingerPrint.machineId >> 16) & 0xff;
    // Encode pid
    buffer[8] = fingerPrint.processId & 0xff;
    buffer[7] = (fingerPrint.processId >> 8) & 0xff;
    // Encode index
    buffer[11] = fingerPrint.inc & 0xff;
    buffer[10] = (fingerPrint.inc >> 8) & 0xff;
    buffer[9] = (fingerPrint.inc >> 16) & 0xff;

    if (this.get('logging')) console.log('silly', fingerPrint.inc);
    if (this.get('logging')) console.log('silly', buffer);
    let objectStr = '';

    for (let x=0; x<12; x++) {
      objectStr += buffer[x].toString(16).padStart(2, '0');
    }

    if (this.get('logging')) console.log('silly', objectStr);

    let hexRex = new RegExp("^[0-9a-fA-F]{24}$");
    // this.__assert(hexRex.test(objectStr));

    return objectStr;
  }

  __computeVectorBaseUrl(endpoint, route) {
    if (!this.get('core') && this.get('apiPath')) {
      return `${endpoint}/${this.get('apiPath')}/api/v1/${route}`;
    }

    return `${endpoint}/api/v1/${route}`;
  }
  __computeScalarBaseUrl(endpoint) {
    if (!this.get('core') && this.get('apiPath')) {
      return `${endpoint}/${this.get('apiPath')}/api/v1/${this.route}/${this.rqEntityId}`;
    }

    return `${endpoint}/api/v1/${this.route}/${this.rqEntityId}`;
  }
}
window.customElements.define(ButtressDbDataService.is, ButtressDbDataService);