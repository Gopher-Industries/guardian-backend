let messageEmitter = null;

function setMessageEmit(fn) {
  messageEmitter = fn;
}

function emitMessageToUser(userId, event, payload) {
  if (typeof messageEmitter === 'function') {
    messageEmitter(userId, event, payload);
  }
}

module.exports = {
  setMessageEmit,
  emitMessageToUser
};