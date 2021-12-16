import { PolymerElement, html } from '@polymer/polymer/polymer-element.js';

import './libs/socket.io.js';

export class ButtressDbSocketIo extends PolymerElement {
  static get is() { return 'buttress-db-socket-io'; }

  static get template() {
    return html`
      <style>
        :host {
          display: none;
        }
      </style>
    `;
  }

  static get properties() {
    return {
      token: String,
      endpoint: String,
      appId: String,

      settings: Object,

      logging: {
        type: Boolean,
        value: false
      },

      _scriptDependencyLoaded: {
        type: Boolean,
        value: false
      },

      _hasMadeConnection: {
        type: Boolean,
        value: false
      },

      isConnected: {
        type: Boolean,
        notify: true,
        value: false
      },

      disconnectedAt: {
        type: Object,
        value: function() { return new Date(); }
      }
    };
  }
  static get observers() {
    return [
      '__pauseRealtime(settings.pause_realtime)',
      '__tokenChanged(token, _scriptDependencyLoaded)'
    ]
  }

  connectedCallback() {
    super.connectedCallback();

    if (io) {
      this.set('_scriptDependencyLoaded', true);
    } else {
      this.set('connected', false);
      this.dispatchEvent(new CustomEvent('error', {detail: new Error('Failed to load Socket IO Library'), bubbles: true, composed: true}));
    }
  }

  __tokenChanged() {
    const token = this.get('token');
    const scriptDependencyLoaded = this.get('_scriptDependencyLoaded');
    if (!token || !scriptDependencyLoaded) {
      // io.disconnect();
      return;
    }

    this.connect();
  }

  __pauseRealtime(val) {
    if (!this.socket) return;

    if (val) {
      this.socket.disconnect();
    } else {
      this.socket.connect();
    }
  }

  connect() {
    const token = this.get('token');
    const appPublicId = this.get('appId');

    if (!token) return;

    const uri = (appPublicId) ? `${this.endpoint}/${appPublicId}` : `${this.endpoint}`;

    if (this.get('logging')) console.log('debug', 'Attempting Socket connection', uri);
    try {
      this.socket = io.connect(uri, {
        query: {
          token: token
        }
      });

      this.socket.on('connect',() => {
        if (this.get('logging')) console.log('debug', `Connected to ${uri}`);
        this.set('isConnected', true);

        // If we've already made a connection lets dispatch that is is a re-connection.
        if (this.get('_hasMadeConnection')) {
          if (this.get('logging')) console.log('debug', 'Reconnected');
          this.dispatchEvent(new CustomEvent('reconnected', {
            detail: {
              disconnectedAt: this.get('disconnectedAt'),
            },
            bubbles: true
          }));
        } else {
          if (this.get('logging')) console.log('debug', 'Connected');
          this.set('_hasMadeConnection', true);
        }
      });

      this.socket.on('disconnect',() => {
        this.set('isConnected', false);
        this.set('disconnectedAt', new Date());
      });

      this.socket.on('db-activity', (data) => {
        this.dispatchEvent(new CustomEvent('rx-event', {
          detail: {type: 'db-activity', payload: data},
          bubbles: true
        }));
      });

    } catch (err) {
      this.set('isConnected', false);
      if (this.get('logging')) console.log('err', err);
      this.dispatchEvent(new CustomEvent('error', {detail: err, bubbles: true, composed: true}));
    }
  }
}
window.customElements.define(ButtressDbSocketIo.is, ButtressDbSocketIo);
