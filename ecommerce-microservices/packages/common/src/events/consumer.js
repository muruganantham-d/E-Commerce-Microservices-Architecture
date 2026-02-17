const fs = require("fs");

const { EVENT_TO_TOPIC, resolveSchemaPath } = loadContractsModule();
const {
  claimEvent,
  markEventProcessed,
  releaseClaim
} = require("../idempotency/consumer-idempotency");

const DEFAULT_RETRY_POLICY = {
  maxRetries: 3,
  initialDelayMs: 250,
  maxDelayMs: 2000,
  backoffMultiplier: 2
};

const NON_RETRYABLE_CLASSIFICATIONS = new Set(["schema", "validation", "permanent"]);
const TRANSIENT_ERROR_CODES = new Set([
  "ETIMEDOUT",
  "ECONNRESET",
  "ECONNREFUSED",
  "EAI_AGAIN",
  "ENOTFOUND",
  "EHOSTUNREACH",
  "EPIPE"
]);
const TRANSIENT_ERROR_NAMES = new Set([
  "MongoNetworkError",
  "MongoServerSelectionError",
  "MongooseServerSelectionError",
  "MongoTimeoutError",
  "KafkaJSConnectionError",
  "KafkaJSRequestTimeoutError",
  "AbortError"
]);

function createEventSchemaValidator(options = {}) {
  const ajv = createAjv(options);
  const validatorCache = new Map();

  return function validateEventEnvelope(envelope) {
    const eventType = envelope && envelope.eventType;
    if (!eventType) {
      return {
        valid: false,
        errors: [{ message: "eventType is required on envelope." }],
        errorText: "eventType is required on envelope."
      };
    }

    const validator = getValidator(eventType, ajv, validatorCache);
    const valid = validator(envelope);

    if (valid) {
      return { valid: true, errors: [] };
    }

    return {
      valid: false,
      errors: validator.errors || [],
      errorText: ajv.errorsText(validator.errors, { separator: "; " })
    };
  };
}

async function processKafkaMessage({
  message,
  topic,
  partition,
  consumerGroup,
  redisClient,
  handleEvent,
  commitOffsets,
  validateEnvelope,
  heartbeat,
  dlqProducer,
  retryPolicy
}) {
  if (typeof handleEvent !== "function") {
    throw new Error("handleEvent(message) function is required.");
  }

  const rawValue = getKafkaMessageRawValue(message);
  let envelope = null;
  let claim = null;

  try {
    envelope = parseKafkaMessageValue(message, rawValue);
    ensureTopicMapping(envelope.eventType, topic);

    const validator = validateEnvelope || createEventSchemaValidator();
    const validation = validator(envelope);
    if (!validation.valid) {
      throw buildValidationError(envelope.eventType, validation.errorText, validation.errors);
    }
  } catch (error) {
    return routeToDlqAndCommit({
      error,
      message,
      rawValue,
      envelope,
      topic,
      partition,
      consumerGroup,
      commitOffsets,
      dlqProducer
    });
  }

  try {
    claim = await claimEvent(redisClient, {
      consumerGroup,
      eventId: envelope.eventId
    });
  } catch (error) {
    error.message = `Failed to claim idempotency for eventId=${envelope.eventId}: ${error.message}`;
    throw error;
  }

  if (!claim.claimed) {
    await commitMessageOffset({ commitOffsets, topic, partition, offset: message.offset });
    return {
      status: "duplicate",
      envelope
    };
  }

  try {
    const result = await processWithRetry({
      envelope,
      message,
      topic,
      partition,
      heartbeat,
      handleEvent,
      retryPolicy
    });

    await markEventProcessed(redisClient, { key: claim.key });
    await commitMessageOffset({ commitOffsets, topic, partition, offset: message.offset });

    return {
      status: "processed",
      envelope,
      attempts: result.attempts,
      result: result.value
    };
  } catch (error) {
    try {
      const dlqResult = await routeToDlqAndCommit({
        error,
        message,
        rawValue,
        envelope,
        topic,
        partition,
        consumerGroup,
        commitOffsets,
        dlqProducer
      });

      await markEventProcessed(redisClient, { key: claim.key });

      return {
        ...dlqResult,
        envelope
      };
    } catch (dlqError) {
      await safeReleaseClaim(redisClient, claim.key);
      throw dlqError;
    }
  }
}

async function processWithRetry({
  envelope,
  message,
  topic,
  partition,
  heartbeat,
  handleEvent,
  retryPolicy
}) {
  const policy = {
    ...DEFAULT_RETRY_POLICY,
    ...(retryPolicy || {})
  };

  let attempt = 0;
  let lastError = null;

  while (attempt <= policy.maxRetries) {
    attempt += 1;
    try {
      const value = await handleEvent(envelope, {
        topic,
        partition,
        heartbeat,
        message,
        attempt
      });
      return {
        value,
        attempts: attempt
      };
    } catch (error) {
      lastError = annotateProcessingError(error, attempt);
      const classification = classifyError(lastError);
      if (!isRetryableClassification(classification)) {
        throw lastError;
      }

      if (attempt > policy.maxRetries) {
        throw lastError;
      }

      if (typeof heartbeat === "function") {
        await heartbeat();
      }

      const delayMs = computeBackoffDelay(policy, attempt);
      await sleep(delayMs);
    }
  }

  throw lastError || new Error("Processing failed without a known error.");
}

async function routeToDlqAndCommit({
  error,
  message,
  rawValue,
  envelope,
  topic,
  partition,
  consumerGroup,
  commitOffsets,
  dlqProducer
}) {
  if (!dlqProducer || typeof dlqProducer.send !== "function") {
    throw error;
  }

  const classification = classifyError(error);
  const dlqTopic = buildDlqTopic(topic);
  const dlqEvent = buildDlqPayload({
    error,
    classification,
    message,
    rawValue,
    envelope,
    topic,
    partition,
    consumerGroup
  });

  await dlqProducer.send({
    topic: dlqTopic,
    messages: [
      {
        key: String(
          (envelope && envelope.eventId) ||
            (message && message.key && bufferToString(message.key)) ||
            "unknown-event"
        ),
        value: JSON.stringify(dlqEvent)
      }
    ]
  });

  await commitMessageOffset({ commitOffsets, topic, partition, offset: message.offset });

  return {
    status: "dlq",
    classification,
    dlqTopic,
    envelope
  };
}

function buildDlqPayload({
  error,
  classification,
  message,
  rawValue,
  envelope,
  topic,
  partition,
  consumerGroup
}) {
  return {
    timestamp: new Date().toISOString(),
    consumerGroup,
    sourceTopic: topic,
    sourcePartition: partition,
    sourceOffset: String(message.offset),
    originalMessage: {
      key: message && message.key ? bufferToString(message.key) : null,
      value: rawValue,
      headers: normalizeHeaders(message && message.headers ? message.headers : {})
    },
    envelope: envelope || null,
    error: {
      classification,
      name: error && error.name ? error.name : "Error",
      message: error && error.message ? error.message : "unknown error",
      stack: error && error.stack ? error.stack : null,
      code: error && error.code ? error.code : null,
      attempt: error && error.attempt ? error.attempt : null
    }
  };
}

function buildDlqTopic(topic) {
  const match = /^ecom\.([^.]+)\.([^.]+)\.[^.]+$/.exec(topic || "");
  if (match) {
    return `ecom.${match[1]}.${match[2]}.dlq.v1`;
  }

  return `${topic}.dlq.v1`;
}

function classifyError(error) {
  if (!error) {
    return "permanent";
  }

  if (
    error.name === "EventSchemaValidationError" ||
    error.name === "EventEnvelopeError" ||
    error.name === "EventPayloadParseError"
  ) {
    return "schema";
  }

  if (error.validationErrors) {
    return "validation";
  }

  if (error.transient === true || error.retryable === true) {
    return "transient";
  }

  if (TRANSIENT_ERROR_CODES.has(error.code) || TRANSIENT_ERROR_NAMES.has(error.name)) {
    return "transient";
  }

  const message = String(error.message || "").toLowerCase();
  if (
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("connection reset") ||
    message.includes("connection closed") ||
    message.includes("temporary") ||
    message.includes("network")
  ) {
    return "transient";
  }

  return "permanent";
}

function isRetryableClassification(classification) {
  return !NON_RETRYABLE_CLASSIFICATIONS.has(classification);
}

function computeBackoffDelay(policy, attempt) {
  const exponent = Math.max(0, attempt - 1);
  const delay = policy.initialDelayMs * policy.backoffMultiplier ** exponent;
  return Math.min(delay, policy.maxDelayMs);
}

function annotateProcessingError(error, attempt) {
  if (!error || typeof error !== "object") {
    const wrapped = new Error(String(error));
    wrapped.attempt = attempt;
    return wrapped;
  }

  error.attempt = attempt;
  return error;
}

async function commitMessageOffset({ commitOffsets, topic, partition, offset }) {
  if (typeof commitOffsets !== "function") {
    return false;
  }

  const nextOffset = incrementOffset(offset);
  await commitOffsets([
    {
      topic,
      partition,
      offset: nextOffset
    }
  ]);

  return true;
}

function getKafkaMessageRawValue(message) {
  if (!message || message.value === undefined || message.value === null) {
    throw buildEnvelopeError("Kafka message value is missing.");
  }

  return Buffer.isBuffer(message.value) ? message.value.toString("utf8") : String(message.value);
}

function parseKafkaMessageValue(message, rawValue) {
  try {
    return JSON.parse(rawValue);
  } catch (error) {
    throw buildPayloadParseError(error.message);
  }
}

function ensureTopicMapping(eventType, topic) {
  if (!eventType) {
    throw buildEnvelopeError("eventType is required on event envelope.");
  }

  const expectedTopic = EVENT_TO_TOPIC[eventType];
  if (!expectedTopic) {
    throw buildEnvelopeError(`No topic mapping found for event type: ${eventType}`);
  }

  if (topic !== expectedTopic) {
    throw buildEnvelopeError(
      `Event type '${eventType}' belongs to topic '${expectedTopic}', received from '${topic}'.`
    );
  }
}

function buildValidationError(eventType, errorText, errors) {
  const error = new Error(`Schema validation failed for ${eventType}: ${errorText}`);
  error.name = "EventSchemaValidationError";
  error.validationErrors = errors;
  return error;
}

function buildEnvelopeError(message) {
  const error = new Error(message);
  error.name = "EventEnvelopeError";
  return error;
}

function buildPayloadParseError(details) {
  const error = new Error(`Kafka message contains invalid JSON: ${details}`);
  error.name = "EventPayloadParseError";
  return error;
}

function getValidator(eventType, ajv, cache) {
  if (cache.has(eventType)) {
    return cache.get(eventType);
  }

  const schemaPath = resolveSchemaPath(eventType);
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  const validator = ajv.compile(schema);
  cache.set(eventType, validator);
  return validator;
}

function createAjv(options) {
  const AjvCtor = requireAjv();
  return new AjvCtor({
    allErrors: true,
    strict: false,
    ...options
  });
}

function requireAjv() {
  try {
    const maybeAjv = require("ajv");
    return maybeAjv.default || maybeAjv;
  } catch (error) {
    throw new Error(
      "'ajv' is required for schema validation. Install dependencies before using consumer helper."
    );
  }
}

function incrementOffset(offset) {
  if (offset === undefined || offset === null) {
    throw new Error("Kafka message offset is required for commit.");
  }

  return (BigInt(String(offset)) + 1n).toString();
}

function normalizeHeaders(headers) {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key, bufferToString(value)])
  );
}

function bufferToString(value) {
  if (Buffer.isBuffer(value)) {
    return value.toString("utf8");
  }

  if (value === undefined || value === null) {
    return null;
  }

  return String(value);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function safeReleaseClaim(redisClient, key) {
  try {
    await releaseClaim(redisClient, { key });
  } catch (_error) {
    // Ignore release errors so original processing error is preserved.
  }
}

function loadContractsModule() {
  try {
    return require("@ecom/contracts");
  } catch (_error) {
    return require("../../../contracts/events");
  }
}

module.exports = {
  DEFAULT_RETRY_POLICY,
  createEventSchemaValidator,
  processKafkaMessage,
  parseKafkaMessageValue,
  commitMessageOffset,
  classifyError,
  buildDlqTopic,
  safeReleaseClaim
};
