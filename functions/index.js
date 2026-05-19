const admin = require('firebase-admin');
const { logger } = require('firebase-functions');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');

admin.initializeApp();

const db = admin.firestore();
const PAGE_URL = 'https://djmonnar.github.io/jinhae/vote.html';

function normalizeEvents(value) {
  return Array.isArray(value) ? value.filter(event => event && event.id) : [];
}

function findAddedEvents(beforeData, afterData) {
  const beforeEvents = normalizeEvents(beforeData?.events);
  const afterEvents = normalizeEvents(afterData?.events);
  const beforeIds = new Set(beforeEvents.map(event => event.id));
  return afterEvents.filter(event => !beforeIds.has(event.id));
}

async function getTeamNames(teamIds = []) {
  if (!teamIds.length) return [];
  const names = [];
  for (const teamId of teamIds) {
    const snap = await db.collection('campaign_teams').doc(teamId).get();
    if (snap.exists && snap.data().name) names.push(snap.data().name);
  }
  return names;
}

function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) chunks.push(array.slice(i, i + size));
  return chunks;
}

async function getSubscribers() {
  const snap = await db.collection('notification_subscribers')
    .where('enabled', '==', true)
    .get();
  return snap.docs
    .map(doc => ({ id: doc.id, token: doc.data().token }))
    .filter(item => item.token);
}

async function deleteInvalidTokens(invalidDocIds) {
  if (!invalidDocIds.length) return;
  const batch = db.batch();
  invalidDocIds.forEach(id => batch.delete(db.collection('notification_subscribers').doc(id)));
  await batch.commit();
}

async function sendEventNotification(event, dayData) {
  const subscribers = await getSubscribers();
  if (!subscribers.length) {
    logger.info('No notification subscribers.');
    return;
  }

  const teams = await getTeamNames(event.teamIds || []);
  const title = '새 유세 일정이 등록되었습니다';
  const bodyParts = [
    `${event.time || ''} ${event.place || ''}`.trim(),
    event.title || '',
    teams.length ? `담당: ${teams.join(', ')}` : '',
  ].filter(Boolean);

  const invalidDocIds = [];
  for (const subscriberChunk of chunk(subscribers, 500)) {
    const response = await admin.messaging().sendEachForMulticast({
      tokens: subscriberChunk.map(item => item.token),
      notification: {
        title,
        body: bodyParts.join(' · '),
      },
      data: {
        url: PAGE_URL,
        date: String(dayData.date || ''),
        eventId: String(event.id || ''),
      },
      webpush: {
        fcmOptions: {
          link: PAGE_URL,
        },
      },
    });

    response.responses.forEach((result, index) => {
      if (!result.success) {
        const code = result.error?.code || '';
        logger.warn('FCM send failed', code, result.error?.message);
        if (
          code.includes('registration-token-not-registered') ||
          code.includes('invalid-registration-token')
        ) {
          invalidDocIds.push(subscriberChunk[index].id);
        }
      }
    });
  }

  await deleteInvalidTokens(invalidDocIds);
}

exports.notifyNewScheduleEvents = onDocumentWritten(
  {
    document: 'schedule_days/{dayId}',
    region: 'asia-northeast3',
  },
  async event => {
    const beforeData = event.data?.before.exists ? event.data.before.data() : null;
    const afterData = event.data?.after.exists ? event.data.after.data() : null;
    if (!afterData) return;

    const addedEvents = findAddedEvents(beforeData, afterData);
    if (!addedEvents.length) return;

    logger.info(`Sending notifications for ${addedEvents.length} new schedule event(s).`);
    for (const newEvent of addedEvents) {
      await sendEventNotification(newEvent, afterData);
    }
  }
);
