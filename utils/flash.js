function setFlash(session, type, message) {
  if (!session) return [];
  if (!session.flash || typeof session.flash !== "object") {
    session.flash = {};
  }

  const key = typeof type === "string" && type.trim() ? type.trim() : "info";
  const nextMessage =
    typeof message === "string"
      ? message.trim()
      : message === undefined || message === null
        ? ""
        : String(message).trim();

  if (!nextMessage) return session.flash[key] || [];

  if (!Array.isArray(session.flash[key])) {
    session.flash[key] = [];
  }

  session.flash[key].push(nextMessage);
  return session.flash[key];
}

function consumeFlash(session) {
  if (!session || !session.flash || typeof session.flash !== "object") {
    return [];
  }

  const flattened = [];
  Object.entries(session.flash).forEach(([type, messages]) => {
    const list = Array.isArray(messages) ? messages : [messages];
    list.forEach((message) => {
      if (message !== undefined && message !== null && String(message).trim()) {
        flattened.push({ type, message: String(message).trim() });
      }
    });
  });

  session.flash = {};
  return flattened;
}

module.exports = { setFlash, consumeFlash };
