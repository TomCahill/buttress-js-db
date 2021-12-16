import { PolymerElement, html } from '@polymer/polymer/polymer-element.js';
import { Debouncer } from '@polymer/polymer/lib/utils/debounce.js';

import './buttress-db-socket-io.js';

export class ButtressDbRealtimeHandler extends PolymerElement {
  static get is() { return 'buttress-db-realtime-handler'; }

  static get template() {
    return html`
      <style>
        :host {
          display: none;
        }
      </style>

      <buttress-db-socket-io
        endpoint="[[endpoint]]",
        app-id="[[appId]]",
        token="[[token]]",
        logging="[[logging]]",
        settings="[[settings]]",
        is-connected="{{connected}}",
        on-rx-event="_handleRxEvent"
        on-reconnected="_handleReconnected"
      ></buttress-db-socket-io>
    `;
  }

  static get properties() {
    return {
      endpoint: String,
      token: String,
      appId: String,
      userId: String,

      logging: {
        type: Boolean,
        value: false
      },

      connected: {
        type: Boolean,
        notify: true,
        value: false
      },
      synced: {
        type: Boolean,
        notify: true,
        value: true
      },

      lastSequence: {
        type: Number,
        value: null
      },
      lastRxDate: {
        type: Object,
      },

      _rxQueue: {
        type: Array,
        value: function() {
          return [];
        }
      },
      _pauseQueue: {
        type: Boolean,
        value: false,
      },

      db: {
        type: Object,
        notify: true
      },
    };
  }

  _handleRxEvent(ev) {
    const userId = this.get('userId');
    const lastSequence = this.get('lastSequence');
    const type = ev.detail.type;

    if (this.get('logging')) console.log('silly', '_handleRxEvent', ev.detail);

    const sequence = ev.detail.payload.sequence;
    const data = ev.detail.payload.data;

    if (lastSequence !== null) {
      if (lastSequence === sequence) {
        this.set('synced', false);
        this.dispatchEvent(new CustomEvent('realtime-payload-duplicate', {
          detail: {
            payload: ev.detail.payload,
            lastSequence: lastSequence
          },
          bubbles: true
        }));
        return;
      }
      if (lastSequence + 1 !== sequence) {
        this.set('synced', false);
        this.dispatchEvent(new CustomEvent('realtime-payload-mismatch', {
          detail: {
            payload: ev.detail.payload,
            lastSequence: lastSequence
          },
          bubbles: true
        }));
        return;
      }
    }
    
    if (this.get('logging')) console.log('USERID', userId, data.user);
    if (userId !== data.user) {
      this._rxQueue.push(data);
      this._processRxQueue();
    }

    this.set('lastSequence', sequence);
  }

  resynced() {
    this._pauseQueue = false;
  }

  _handleReconnected(ev) {
    // Buffer up rx & send a request to catch up to the data services
    this._pauseQueue = true;

    console.log(this.get('connected'));

    this.dispatchEvent(new CustomEvent('reconnected', {
      detail: ev.detail,
      bubbles: true
    }));
  }

  _processRxQueue() {
    if (this._rxQueue.length < 1) return;

    const rxData = this._rxQueue.shift();

    console.log('silly', '_processRxQueue processing paused', this._pauseQueue)

    // We're pausing the processing of the queue so we can catch up with the latest data
    if (this._pauseQueue) return;

    console.log(rxData);

    this.__parsePayload(rxData);
  }

  __parsePayload(payload) {
    if (payload.response && typeof payload.response === 'object') {
      payload.response.__readonly__ = true;
    }
    
    let pathSpec = payload.pathSpec.split('/').map(ps => Sugar.String.camelize(ps, false)).filter(s => s && s !== '');
    let path = payload.path.split('/').map(p => Sugar.String.camelize(p, false)).filter(s => s && s !== '');
    let paramsRegex = /:(([a-z]|[A-Z]|[0-9]|[\-])+)(?:\(.*?\))?$/;

    let params = {};
    for (let idx=0; idx<path.length; idx++) {
      let pathParamMatches = pathSpec[idx].match(paramsRegex);
      if (pathParamMatches && pathParamMatches[1]) {
        params[pathParamMatches[1]] = path[idx];
      }
    }
    if (this.get('logging')) console.log('silly', path);
    if (this.get('logging')) console.log('silly', pathSpec);
    if (this.get('logging')) console.log('silly', params);

    if (path.length > 0 && !this.get(['db', path[0], 'data'])) {
      if (this.get('logging')) console.log('silly', `__parsePayload: No data service for ${path[0]}`);
      return; // We don't have a data service for this data
    }

    switch (payload.verb) {
      case 'post': {
        this.__handlePostCommon(path, params, payload);
      } break;
      case 'put': {
        for (let x=0; x<payload.response.length; x++) {
          this.__handlePut(path, params, payload, payload.response[x]);
        }
      } break;
      case 'delete': {
        if (path.length === 1) {
          let data = this.get(['db', path[0], 'data']);
          data.forEach((item) => item.__readonly__ = true);
          this.splice(['db', path[0], 'data'], 0, data.length);
        } else if (path.length === 2 && params.id) {
          let data = this.get(['db', path[0], 'data']);
          let itemIndex = data.findIndex(d => d.id === params.id);
          if (itemIndex !== -1) {
            let item = data[itemIndex];
            item.__readonly__ = true;
            this.splice(['db',path[0],'data'], itemIndex, 1);
          }
        }
      } break;
    }

    this._processRxQueue();
  }

  __handlePostCommon(path, params, payload) {
    if (path.length > 1 && !path.includes('bulk')) {
      return;
    }

    let responses = payload.response;
    if (!Array.isArray(responses)) {
      responses = [responses];
    }

    const data = this.get(['db', path[0], 'data']);

    responses.forEach((response) => {
      if (!response.__readonly__) {
        response.__readonly__ = true;
      }

      const entityIdx = data.findIndex((e) => e.id === response.id);
      if (entityIdx !== -1) {
        return;
      }

      this.push(['db', path[0], 'data'], response);
    })
  }

  __getUpdatePath(path, params, payload, response) {
    if (path.length !== 2) {
      return false;
    }

    let data = this.get(['db', path[0], 'data']);
    if (!data) {
      return false;
    }

    let entityIdx = data.findIndex(e => e.id === path[1]);
    if (entityIdx === -1) {
      return false;
    }

    let tail = [];

    if (response && response.path) {
      tail = response.path.split('.');
 
      if (tail.indexOf('__increment__') !== -1) {
        tail.splice(tail.indexOf('__increment__'), 1);
      }
    }

    return ['db', path[0], 'data', entityIdx].concat(tail);
  }

  __handlePut(path, params, payload, response) {
    let updatePath = this.__getUpdatePath(path, params, payload, response);
    if (updatePath === false) {
      if (this.get('logging')) console.log('silly', `__handlePut Invalid Update: `, path);
      return;
    }
    if (this.get('logging')) console.log('silly', `__handlePut`, path, updatePath);

    this.db[path[0]].data[updatePath[3]].__readOnlyChange__ = true;
    switch (response.type) {
      case 'scalar': {
        if (this.get('logging')) console.log('silly', 'updating', updatePath, response.value);
        this.set(updatePath, response.value);
        break;
      }
      case 'scalar-increment': {
        if (this.get('logging')) console.log('silly', 'updating', updatePath, response.value);
        this.set(updatePath, this.get(updatePath) + response.value);
        break;
      }
      case 'vector-add': {
        if (this.get('logging')) console.log('silly', 'inserting', updatePath, response.value);
        this.push(updatePath, response.value);
        break;
      }
      case 'vector-rm': {
        if (this.get('logging')) console.log('silly', 'removing', updatePath, response.value);
        this.splice(updatePath, response.value.index, response.value.numRemoved);
        break;
      }
    }
  }
}

window.customElements.define(ButtressDbRealtimeHandler.is, ButtressDbRealtimeHandler);
