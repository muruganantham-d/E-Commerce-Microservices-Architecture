const fs = require("fs");

const { EVENT_TO_TOPIC, resolveSchemaPath } = loadContractsModule();
const {
  claimEvent,
  markEventProcessed,
  releaseClaim
} = require("../idempotency/consumer-idempotency");

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
  heartbeat
}) {
  if (typeof handleEvent !== "function") {
    throw new Error("handleEvent(message) function is required.");
  }

  const envelope = parseKafkaMessageValue(message);
  ensureTopicMapping(envelope.eventType, topic);

  const validator = validateEnvelope || createEventSchemaValidator();
  const validation = validator(envelope);
  if (!validation.valid) {
    throw buildValidationError(envelope.eventType, validation.errorText, validation.errors);
  }

  const claim = await claimEvent(redisClient, {
    consumerGroup,
    eventId: envelope.eventId
  });

  if (!claim.claimed) {
    await commitMessageOffset({ commitOffsets, topic, partition, offset: message.offset });
    return {
      status: "duplicate",
      envelope
    };
  }

  try {
    const result = await handleEvent(envelope, {
      topic,
      partition,
      heartbeat,
      message
    });

    await markEventProcessed(redisClient, { key: claim.key });
    await commitMessageOffset({ commitOffsets, topic, partition, offset: message.offset });

    return {
      status: "processed",
      envelope,
      result
    };
  } catch (error) {
    await safeReleaseClaim(redisClient, claim.key);
    throw error;
  }
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

function parseKafkaMessageValue(message) {
  if (!message || message.value === undefined || message.value === null) {
    throw new Error("Kafka message value is missing.");
  }

  const rawValue = Buffer.isBuffer(message.value)
    ? message.value.toString("utf8")
    : String(message.value);

  try {
    return JSON.parse(rawValue);
  } catch (error) {
    throw new Error(`Kafka message contains invalid JSON: ${error.message}`);
  }
}

function ensureTopicMapping(eventType, topic) {
  const expectedTopic = EVENT_TO_TOPIC[eventType];
  if (!expectedTopic) {
    throw new Error(`No topic mapping found for event type: ${eventType}`);
  }

  if (topic !== expectedTopic) {
    throw new Error(
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

async function safeReleaseClaim(redisClient, key) {
  try {
    await releaseClaim(redisClient, { key });
  } catch (error) {
    // Ignore release errors so original processing error is preserved.
  }
}

function loadContractsModule() {
  try {
    return require("@ecom/contracts");
  } catch (error) {
    return require("../../../contracts/events");
  }
}

module.exports = {
  createEventSchemaValidator,
  processKafkaMessage,
  parseKafkaMessageValue,
  commitMessageOffset
};
