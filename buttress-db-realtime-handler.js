import { PolymerElement, html } from '@polymer/polymer/polymer-element.js';

import './buttress-db-socket-io.js';

class ButtressDbRealtimeHandler extends PolymerElement {
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
        connected="{{connected}}",
        on-rx-event="__handleRxEvent"
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

      db: {
        type: Object,
        notify: true
      },
    };
  }

  __handleRxEvent(ev) {
    const userId = this.get('userId');
    const lastSequence = this.get('lastSequence');
    const type = ev.detail.type;

    if (this.get('logging')) console.log('silly', '__handleRxEvent', ev.detail);

    if (type !== 'db-activity') {
      return;
    }
    
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
      this.__parsePayload(data);
    }
    
    this.set('lastSequence', sequence);
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
        if (payload.path.includes('metadata') && params.id && params.key) {
          this.__handleMetadataPost(path, params, payload);
        } else {
          this.__handlePostCommon(path, params, payload);
        }

      } break;
      case 'put': {
        for (let x=0; x<payload.response.length; x++) {
          this.__handlePut(path, params, payload, payload.response[x]);
        }
      } break;
      case 'delete': {
        if (path.length === 2 && params.id) {
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
  }

  __handleMetadataPost(path, params, payload) {
    if (this.get('logging')) console.log('silly', '__handleMetadataPost', path[0], params, payload.response.value);
    let metadata = this.get(['db', path[0], 'metadata', params.id]);
    let metadataRoot = this.get(['db', path[0], 'metadata']);

    if (!metadata) {
      if (this.get('logging')) console.log('warn', 'ignoring metadata update, not already loaded');
      return;
    }
    if (this.get('logging')) console.log('silly', 'metadata', metadata);

    metadataRoot.__readOnlyChange__ = true;
    this.set(['db', path[0], 'metadata', params.id, params.key], payload.response.value);
  }


  __handlePostCommon(path, params, payload) {
    if (path.length !== 1) {
      return;
    }

    let responses = payload.response;
    if (!Array.isArray(responses)) {
      responses = [responses];
    }

    responses.forEach((response) => {
      if (!response.__readonly__) {
        response.__readonly__ = true;
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

    return ['db', path[0], 'data', entityIdx, response.path];
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
