import {cut} from './libs/utils';

class QuickReplies {
  constructor() {
    this._quickReplies = [];
  }

  add({text, data, event, isLocation, image}) {
    if (!data && !event && !isLocation) {
      throw Error('Must provide a url or data i.e. {data: null} or {url: \'https://facebook.com\'}');
    }

    this._quickReplies.push({text: text || 'QuickReply', event, data, isLocation, image});
    return this;
  }

  toJSON() {
    const quickReplies = [];
    for (const reply of this._quickReplies) {
      let contentType = 'text';
      const payload = JSON.stringify({data: reply.data, event: reply.event});
      if (!reply.text) {
        throw new Error('No text attribute');
      }
      if (reply.isLocation) {
        contentType = 'location';
      }

	  let toPush = {
		  payload,
		  title: cut(String(reply.text), 20),
		  content_type: contentType
	  };
	  if (reply.image) {
		  toPush.image_url = reply.image
	  }

      quickReplies.push(toPush);
    }

    return quickReplies;
  }

  static from(array) {
    const quickreplies = new QuickReplies();
    array.forEach(arg => quickreplies.add(arg));
    return quickreplies;
  }

  get length() {
    return this._quickReplies.length;
  }
}

export default QuickReplies;
