import EventEmitter from 'events';
import bodyParser from 'body-parser';
import {Router} from 'express';
import Elements from './Elements.js';
import Buttons from './Buttons.js';
import QuickReplies from './QuickReplies.js';
import fetch from './libs/fetch.js';
import _ from 'lodash';

//export {Elements, Buttons, QuickReplies};

const userCache = {};

async function wait(time) {
  return new Promise(resolve => setTimeout(() => resolve(), time));
}

class Bot extends EventEmitter {
  constructor(token, verification, debug = false) {
    super();

    this.Buttons  = Buttons;
    this.Elements = Elements;
    this.wait     = wait;

    this._token = token;
    this._debug = debug;
    this._verification = verification;
  }

  async setGreeting(text) {
    const {body: {result}} = await fetch('https://graph.facebook.com/v2.6/me/thread_settings', {
      method: 'post',
      json: true,
      query: {access_token: this._token},
      body: {setting_type: 'greeting', greeting: {text}}
    });

    return result;
  }

  async setGetStarted(input) {
    if (!input) {
      const {body: {result}} = await fetch('https://graph.facebook.com/v2.6/me/thread_settings', {
        method: 'delete',
        json: true,
        query: {access_token: this._token},
        body: {
          setting_type: 'call_to_actions',
          thread_state: 'new_thread'
        }
      });

      return result;
    }

    const {data, event} = input;
    const {body: {result}} = await fetch('https://graph.facebook.com/v2.6/me/thread_settings', {
      method: 'post',
      json: true,
      query: {access_token: this._token},
      body: {
        setting_type: 'call_to_actions',
        thread_state: 'new_thread',
        call_to_actions: [{payload: JSON.stringify({data, event})}]
      }
    });

    return result;
  }

  async setPersistentMenu(input) {
    if (!input) {
      const {body: {result}} = await fetch('https://graph.facebook.com/v2.6/me/thread_settings', {
        method: 'delete',
        json: true,
        query: {access_token: this._token},
        body: {
          setting_type: 'call_to_actions',
          thread_state: 'existing_thread'
        }
      });

      return result;
    }

    const {body: {result}} = await fetch('https://graph.facebook.com/v2.6/me/messenger_profile', {
      method: 'post',
      json: true,
      query: {access_token: this._token},
      body: {
        persistent_menu: input, 
      }
    });

    return result;
  }


  async send(to, message) {
    if (this._debug) {
      console.log({recipient: {id: to}, message: message ? message.toJSON() : message});
    }

    try {
      await fetch('https://graph.facebook.com/v2.6/me/messages', {
        method: 'post',
        json: true,
        query: {access_token: this._token},
        body: {recipient: {id: to}, message}
      });
    } catch (e) {
      if (e.text) {
        let text = e.text;
        try {
          const err = JSON.parse(e.text).error;
          text = `${err.type || 'Unknown'}: ${err.message || 'No message'}`;
        } catch (ee) {
          // ignore
        }

        throw Error(text);
      } else {
        throw e;
      }
    }
  }

  async senderAction(to, senderAction) {
    if (this._debug) {
      console.log({recipient: {id: to}, senderAction});
    }

    try {
      await fetch('https://graph.facebook.com/v2.6/me/messages', {
        method: 'post',
        json: true,
        query: {access_token: this._token},
        body: {recipient: {id: to}, sender_action: senderAction}
      });
    } catch (e) {
      if (e.text) {
        let text = e.text;
        try {
          const err = JSON.parse(e.text).error;
          text = `${err.type || 'Unknown'}: ${err.message || 'No message'}`;
        } catch (ee) {
          // ignore
        }

        throw Error(text);
      } else {
        throw e;
      }
    }
  }

  async setTyping(to, isTyping) {
    const senderAction = isTyping ? 'typing_on' : 'typing_off';
    this.senderAction(to, senderAction);
  }

  async startTyping(to) {
    this.setTyping(to, true);
  }

  async stopTyping(to) {
    this.setTyping(to, false);
  }

  async fetchUser(id, fields = 'first_name,last_name,profile_pic', cache = false) {
    const key = id + fields;
    let props;

    if (cache && userCache[key]) {
      props = userCache[key];
      props.fromCache = true;
    } else {
      const {body} = await fetch(`https://graph.facebook.com/v2.6/${id}`, {
        query: {access_token: this._token, fields}, json: true
      });

      props = body;
      props.fromCache = false;

      if (cache) {
        userCache[key] = props;
      }
    }

    return props;
  }

  async handleMessage(input) {
    const body = JSON.parse(JSON.stringify(input));
    const message = body.entry[0].messaging[0];
    Object.assign(message, message.message);
    delete message.message;

    message.raw = input;

    message.sender.fetch = async(fields, cache) => {
      const props = await this.fetchUser(message.sender.id, fields, cache);
      Object.assign(message.sender, props);
      return message.sender;
    };

    // POSTBACK
    if (message.postback) {
      let payload = {};
      let referral = {};

      try {
        payload = JSON.parse(message.postback.payload);
        referral = JSON.parse(JSON.stringify(message.postback.referral));
      } catch (e) {
        // console.error(e);
      }
      console.log("PAYLOAD: " + JSON.stringify(message.postback, null, 2));
      message.isButton = true;

      if (payload.hasOwnProperty('data')) {
        message.postback = payload;
        message.data = payload.data;
        message.event = payload.event;
        message.referral = referral;

        this.emit('postback', message.event, message, message.data);

        if (payload.hasOwnProperty('event')) {
          this.emit(message.event, message, message.data);
        }
      } else {
        this.emit('invalid-postback', message, message.postback);
      }

      return;
    }

    // DELIVERY
    if (message.delivery) {
      Object.assign(message, message.delivery);
      message.delivered = message.delivery.mids;

      delete message.delivery;

      this.emit('delivery', message, message.delivered);
      return;
    }

    // OPTIN
    if (message.optin) {
      message.param = message.optin.ref || true;
      message.optin = message.param;
      this.emit('optin', message, message.optin);
      return;
    }

    // QUICK_REPLY
    if (message.quick_reply && !message.is_echo) {
      let postback = {};

      try {
        postback = JSON.parse(message.quick_reply.payload) || {};
      } catch (e) {
        // ignore
      }

      message.isQuickReply = true;

      if (postback.hasOwnProperty('data')) {
        message.postback = postback;
        message.data = postback.data;
        message.event = postback.event;

        this.emit('postback', message.event, message, message.data);

        if (postback.hasOwnProperty('event')) {
          this.emit(message.event, message, message.data);
        }
      } else {
        this.emit('invalid-postback', message, message.postback);
      }

      return;
    }

    const attachments = _.groupBy(message.attachments, 'type');

    if (attachments.image) {
      message.images = attachments.image.map(a => a.payload.url);
    }

    if (attachments.video) {
      message.videos = attachments.video.map(a => a.payload.url);
    }

    if (attachments.audio) {
      message.audio = attachments.audio.map(a => a.payload.url)[0];
    }

    if (attachments.location) {
      const location = attachments.location[0];
      message.location = Object.assign(location, location.payload.coordinates);
      delete message.location.payload;
    }

    message.object = body.object;

    delete message.attachments;

    this.emit('message', message);
  }

  router() {
    const router = new Router();

    router.use(bodyParser.json());

    router.get('/', (req, res) => {
      if (req.query['hub.verify_token'] === this._verification) {
        res.send(req.query['hub.challenge']);
      } else {
        res.send('Error, wrong validation token');
      }
    });

    router.post('/', (req, res) => {
      this.handleMessage(req.body);
      res.send().status(200);
    });

    return router;
  }
}

export default Bot;
