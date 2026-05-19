importScripts('https://www.gstatic.com/firebasejs/11.6.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.6.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyAeHS1qb4SzJTZWnwd8s_V8K3MuKPBCx5Y',
  authDomain: 'vote-94dda.firebaseapp.com',
  projectId: 'vote-94dda',
  storageBucket: 'vote-94dda.firebasestorage.app',
  messagingSenderId: '548877092595',
  appId: '1:548877092595:web:7d6381ceb779b7b319d986',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(payload => {
  const notification = payload.notification || {};
  const data = payload.data || {};
  self.registration.showNotification(notification.title || '새 유세 일정', {
    body: notification.body || '새 일정이 등록되었습니다.',
    icon: 'https://i.ibb.co/tTXCtkSP/removebg-preview.png',
    badge: 'https://i.ibb.co/tTXCtkSP/removebg-preview.png',
    data: {
      url: data.url || '/jinhae/vote.html',
    },
  });
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/jinhae/vote.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes('/jinhae/vote.html') && 'focus' in client) return client.focus();
      }
      return clients.openWindow(url);
    })
  );
});
