const { createHash } = require('node:crypto')
const { logger } = require('firebase-functions')
const { onDocumentCreated } = require('firebase-functions/v2/firestore')
const { onSchedule } = require('firebase-functions/v2/scheduler')
const admin = require('firebase-admin')
const { buildExpoMessage, isExpoToken, retryDelay, shouldRetry } = require('./nativePushProtocol')

const db = admin.firestore()
const { Timestamp, FieldValue } = admin.firestore
const queue = db.collection('nativePushQueue')
const receiptDelay = 15 * 60_000
const expiry = 24 * 60 * 60_000
const sendAttempts = 6

// Separate trigger and token collection leave the original FCM web sender unchanged.
exports.sendNativePushForNotification = onDocumentCreated({
  document: 'users/{recipientUid}/notifications/{notificationId}',
  retry: true, timeoutSeconds: 120, maxInstances: 10,
}, async event => {
  if (!event.data) return
  const issuedAt = event.data.createTime?.toMillis() || Date.now()
  if (issuedAt + expiry <= Date.now()) return
  const { recipientUid, notificationId } = event.params
  const notification = event.data.data()
  const tokens = await db.collection('users').doc(recipientUid).collection('expoPushTokens').get()
  const ready = []
  // Queue creation is idempotent, including repeated Firestore event delivery.
  for (const tokenDoc of tokens.docs) {
    const token = tokenDoc.data().token
    if (!isExpoToken(token)) continue
    const id = createHash('sha256').update(`${recipientUid}:${notificationId}:${token}`).digest('hex')
    const ref = queue.doc(id)
    try {
      await ref.create({
        recipientUid, notificationId, token, tokenPath: tokenDoc.ref.path,
        message: buildExpoMessage(token, notification, notificationId),
        state: 'pending', attempts: 0, createdAt: Timestamp.now(),
        nextAttemptAt: Timestamp.now(), expiresAt: Timestamp.fromMillis(issuedAt + expiry),
      })
      ready.push(ref)
    } catch (error) {
      if (error.code !== 6 && error.code !== 'already-exists') throw error
    }
  }
  // Jobs remain queued if the HTTP request fails or this invocation is interrupted.
  // The web sender runs independently and is never blocked by this result.
  await processJobs(ready)
})

exports.processNativePushQueue = onSchedule({
  schedule: 'every 5 minutes', timeZone: 'Asia/Seoul',
  timeoutSeconds: 120, maxInstances: 1,
}, async () => {
  // One indexed field; no additional compound Firestore index is required.
  const due = await queue.where('nextAttemptAt', '<=', Timestamp.now()).orderBy('nextAttemptAt').limit(100).get()
  await processJobs(due.docs.map(doc => doc.ref))
})

async function claim(ref) {
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref)
    const job = snapshot.data()
    if (!job || !['pending', 'receipt'].includes(job.state) || !job.nextAttemptAt || job.nextAttemptAt.toMillis() > Date.now()) return null
    // A lease avoids overlap between a trigger invocation and the scheduled worker.
    transaction.update(ref, { nextAttemptAt: Timestamp.fromMillis(Date.now() + 180_000) })
    return { ...job, ref }
  })
}

async function finish(job, state, code = '') {
  await job.ref.update({
    state, errorCode: code, finishedAt: Timestamp.now(),
    nextAttemptAt: FieldValue.delete(), token: FieldValue.delete(),
    tokenPath: FieldValue.delete(), message: FieldValue.delete(), ticketId: FieldValue.delete(),
  })
  const details = { deliveryId: job.ref.id, notificationId: job.notificationId, state, code }
  if (state === 'failed') logger.error('Native push failed', details)
  else logger.info('Native push processing result', details)
}

async function removeInvalidToken(job) {
  const tokenRef = db.doc(job.tokenPath)
  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(tokenRef)
    if (snapshot.data()?.token === job.token) transaction.delete(tokenRef)
  })
}

async function retry(job, code, stage = job.state) {
  const attempts = job.attempts || 0
  if (job.expiresAt.toMillis() <= Date.now() || (stage === 'pending' && attempts >= sendAttempts)) {
    await finish(job, 'failed', code || 'RetryLimitExceeded')
    return
  }
  await job.ref.update({
    state: stage, errorCode: code,
    nextAttemptAt: Timestamp.fromMillis(Date.now() + (stage === 'receipt' ? receiptDelay : retryDelay(attempts))),
  })
  logger.warn('Native push will retry', { deliveryId: job.ref.id, stage, code, attempts })
}

async function api(path, payload) {
  const response = await fetch(`https://exp.host/--/api/v2/push/${path}`, {
    method: 'POST', signal: AbortSignal.timeout(20_000),
    headers: {
      Accept: 'application/json', 'Content-Type': 'application/json',
      ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}),
    },
    body: JSON.stringify(payload),
  })
  const body = await response.json()
  if (!response.ok || body.errors?.length) {
    const error = new Error('Expo push request failed')
    error.status = response.status
    error.code = body.errors?.[0]?.code || `HTTP_${response.status}`
    throw error
  }
  return body.data
}

async function processJobs(refs) {
  // Each job is isolated; a bad token or receipt never discards other recipients.
  const claimed = await Promise.all(refs.map(async ref => {
    try { return await claim(ref) }
    catch (error) { logger.error('Native push queue lease failed', { deliveryId: ref.id, code: error.code || 'Unknown' }); return null }
  }))
  const jobs = []
  for (const job of claimed.filter(Boolean)) {
    try {
      if (job.expiresAt.toMillis() <= Date.now()) { await finish(job, 'failed', 'ReceiptOrDeliveryExpired'); continue }
      if (job.state === 'pending') {
        const [registered, user] = await Promise.all([
          db.doc(job.tokenPath).get(), db.collection('users').doc(job.recipientUid).get(),
        ])
        // Respect logout, token rotation and disabling notifications before a retry.
        if (!user.exists || registered.data()?.token !== job.token) { await finish(job, 'cancelled', 'AccountOrTokenRemoved'); continue }
        if ((job.attempts || 0) >= sendAttempts) { await finish(job, 'failed', 'RetryLimitExceeded'); continue }
        job.attempts = (job.attempts || 0) + 1
        await job.ref.update({ attempts: job.attempts })
      }
      jobs.push(job)
    } catch (error) { logger.error('Native push queue preparation failed', { deliveryId: job.ref.id, code: error.code || 'Unknown' }) }
  }
  const pending = jobs.filter(job => job.state === 'pending')
  const receipts = jobs.filter(job => job.state === 'receipt')
  // Expo accepts at most 100 messages per request. Requests are sequential.
  for (let i = 0; i < pending.length; i += 100) await sendBatch(pending.slice(i, i + 100))
  for (let i = 0; i < receipts.length; i += 100) await checkReceipts(receipts.slice(i, i + 100))
}

async function handleResultError(job, result, stage) {
  const code = result?.details?.error || 'UnknownExpoError'
  if (code === 'DeviceNotRegistered') {
    await removeInvalidToken(job)
    await finish(job, 'failed', code)
  } else if (code === 'MessageRateExceeded') {
    // The provider explicitly rejected this attempt; resend with backoff.
    await retry(job, code, 'pending')
  } else if (['MessageTooBig', 'InvalidCredentials', 'MismatchSenderId'].includes(code)) {
    await finish(job, 'failed', code)
  } else await retry(job, code, stage)
}

async function sendBatch(jobs) {
  let results
  try {
    results = await api('send', jobs.map(job => job.message))
    if (!Array.isArray(results) || results.length !== jobs.length) throw new Error('Invalid ticket response')
  } catch (error) {
    await settleJobUpdates(jobs, job => shouldRetry(error) ? retry(job, error.code || 'NetworkError', 'pending') : finish(job, 'failed', error.code || 'ExpoRequestRejected'))
    return
  }
  await Promise.all(jobs.map(async (job, index) => {
    try {
      const ticket = results[index]
      if (ticket?.status === 'ok' && typeof ticket.id === 'string') {
        await job.ref.update({ state: 'receipt', ticketId: ticket.id, acceptedAt: Timestamp.now(), nextAttemptAt: Timestamp.fromMillis(Date.now() + receiptDelay) })
        logger.info('Expo accepted native push; receipt pending', { deliveryId: job.ref.id })
      } else await handleResultError(job, ticket, 'pending')
    } catch (error) { logger.error('Native push ticket persistence failed', { deliveryId: job.ref.id, code: error.code || 'Unknown' }) }
  }))
}

async function checkReceipts(jobs) {
  let receipts
  try {
    receipts = await api('getReceipts', { ids: jobs.map(job => job.ticketId) })
    if (!receipts || typeof receipts !== 'object' || Array.isArray(receipts)) throw new Error('Invalid receipt response')
  } catch (error) {
    await settleJobUpdates(jobs, job => shouldRetry(error) ? retry(job, error.code || 'ReceiptRequestFailed', 'receipt') : finish(job, 'failed', error.code || 'ReceiptRequestRejected'))
    return
  }
  await Promise.all(jobs.map(async job => {
    try {
      const receipt = receipts[job.ticketId]
      if (!receipt) await retry(job, 'ReceiptNotAvailable', 'receipt')
      // 'ok' confirms provider acceptance, not display or receipt on the physical device.
      else if (receipt.status === 'ok') await finish(job, 'provider_accepted')
      else await handleResultError(job, receipt, 'receipt')
    } catch (error) { logger.error('Native push receipt processing failed', { deliveryId: job.ref.id, code: error.code || 'Unknown' }) }
  }))
}

async function settleJobUpdates(jobs, action) {
  const results = await Promise.allSettled(jobs.map(action))
  results.forEach((result, index) => {
    if (result.status === 'rejected') logger.error('Native push result persistence failed', {
      deliveryId: jobs[index].ref.id, code: result.reason?.code || 'Unknown',
    })
  })
}
