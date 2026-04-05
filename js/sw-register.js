'use strict';

if ('serviceWorker' in navigator && location.protocol !== 'chrome-extension:') {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
