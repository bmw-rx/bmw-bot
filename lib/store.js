/**
 * BMW LITE - Message Store
 * Huhifadhi ujumbe wa muda mfupi kwenye memory (Map) kwa ajili
 * ya Anti Delete feature. Ujumbe huhifadhiwa kwa muda fulani
 * kisha kufutwa kiotomatiki ili kuepuka kuongezeka kwa memory.
 */

const messageStore = new Map(); // key: messageId, value: { message, sender, chatId, type, timestamp }

const MAX_AGE_MS = 1000 * 60 * 60 * 2; // saa 2

function saveMessage(id, data) {
    messageStore.set(id, { ...data, timestamp: Date.now() });
}

function getMessage(id) {
    return messageStore.get(id);
}

function deleteMessage(id) {
    messageStore.delete(id);
}

// Safisha ujumbe wa zamani kila dakika 30
const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [id, data] of messageStore.entries()) {
        if (now - data.timestamp > MAX_AGE_MS) {
            messageStore.delete(id);
        }
    }
}, 1000 * 60 * 30);

// Usizuie process kuisha kama hii ndiyo kazi pekee iliyobaki (haiathiri utendaji wa bot halisi)
if (cleanupInterval.unref) cleanupInterval.unref();

module.exports = {
    saveMessage,
    getMessage,
    deleteMessage,
    messageStore,
};
