const { randomUUID } = require("crypto");

const {
  EVENT_TO_TOPIC,
  TOPIC_STRATEGY,
  EVENT_VERSION
} = loadContractsModule();

function createEventEnvelope({
  eventType,
  source,
  payload,
  eventId = randomUUID(),
  timestamp = new Date().toISOString(),
  version = EVENT_VERSION
}) {
  if (!eventType) {
    throw new Error("eventType is required.");
  }

  if (!source) {
    throw new Error("source is required.");
  }

  if (!payload || typeof payload !== "object") {
    throw new Error("payload must be an object.");
  }

  return {
    eventId,
    eventType,
    timestamp,
    version,
    source,
    payload
  };
}

function resolveTopic(eventType) {
  const topic = EVENT_TO_TOPIC[eventType];

  if (!topic) {
    throw new Error(`No Kafka topic mapping defined for eventType: ${eventType}`);
  }

  return topic;
}

function resolveMessageKey({ topic, payload, fallbackKey }) {
  if (fallbackKey !== undefined && fallbackKey !== null) {
    return String(fallbackKey);
  }

  const partitionKeyField = TOPIC_STRATEGY[topic] && TOPIC_STRATEGY[topic].partitionKey;
  if (partitionKeyField && payload[partitionKeyField] !== undefined && payload[partitionKeyField] !== null) {
    return String(payload[partitionKeyField]);
  }

  return String(randomUUID());
}

function buildPublishRequest({
  eventType,
  source,
  payload,
  key,
  headers,
  eventId,
  timestamp,
  version
}) {
  const topic = resolveTopic(eventType);
  const envelope = createEventEnvelope({
    eventType,
    source,
    payload,
    eventId,
    timestamp,
    version
  });

  const messageKey = resolveMessageKey({ topic, payload: envelope.payload, fallbackKey: key });
  const normalizedHeaders = toKafkaHeaders({
    eventId: envelope.eventId,
    eventType: envelope.eventType,
    source: envelope.source,
    version: envelope.version,
    timestamp: envelope.timestamp,
    ...(headers || {})
  });

  return {
    topic,
    message: {
      key: messageKey,
      value: JSON.stringify(envelope),
      headers: normalizedHeaders
    },
    envelope
  };
}

async function publishEvent(producer, args) {
  if (!producer || typeof producer.send !== "function") {
    throw new Error("A Kafka producer with send(...) is required.");
  }

  const { topic, message, envelope } = buildPublishRequest(args);
  await producer.send({
    topic,
    messages: [message]
  });

  return {
    topic,
    key: message.key,
    envelope
  };
}

function toKafkaHeaders(headers) {
  const entries = Object.entries(headers).filter(([, value]) => value !== undefined && value !== null);
  return Object.fromEntries(entries.map(([key, value]) => [key, String(value)]));
}

function loadContractsModule() {
  try {
    return require("@ecom/contracts");
  } catch (error) {
    return require("../../../contracts/events");
  }
}

module.exports = {
  createEventEnvelope,
  resolveTopic,
  resolveMessageKey,
  buildPublishRequest,
  publishEvent
};
