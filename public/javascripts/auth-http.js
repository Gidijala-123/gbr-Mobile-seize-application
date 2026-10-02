(function () {
  window.authRequest = async function (url, data) {
    var tokenMeta = document.querySelector('meta[name="csrf-token"]');
    var response = await window.fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': tokenMeta ? tokenMeta.content : ''
      },
      body: JSON.stringify(data)
    });
    var text = await response.text();
    var responseData = null;
    if (text) {
      try {
        responseData = JSON.parse(text);
      } catch (error) {
        responseData = text;
      }
    }
    if (!response.ok) {
      var message = responseData && responseData.error
        ? responseData.error
        : (typeof responseData === 'string' ? responseData : 'Request failed. Please try again.');
      throw new Error(message);
    }
    return { status: response.status, data: responseData };
  };
})();