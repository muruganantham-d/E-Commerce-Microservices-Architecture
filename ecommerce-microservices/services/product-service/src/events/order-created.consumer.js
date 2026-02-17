const fs = require("fs");
const Ajv2020 = require("ajv/dist/2020");
const addFormats = require("ajv-formats");
const { events } = require("@ecom/common");
const { EVENT_TYPES, EVENT_TO_TOPIC, resolveSchemaPath } = require("@ecom/contracts");
const Product = require("../data/models/product.model");

function createOrderCreatedValidator() {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const cache = new Map();

  return (envelope) => {
    const eventType = envelope && envelope.eventType;
    if (!eventType) {
      return {
        valid: false,
        errors: [{ message: "eventType is required" }],
        errorText: "eventType is required"
      };
    }

    if (!cache.has(eventType)) {
      const schemaPath = resolveSchemaPath(eventType);
      const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
      const schemaId = schema.$id || schema.id;
      const existingValidator = schemaId ? ajv.getSchema(schemaId) : null;

      if (existingValidator) {
        cache.set(eventType, existingValidator);
      } else {
        cache.set(eventType, ajv.compile(schema));
      }
    }

    const validator = cache.get(eventType);
    const valid = validator(envelope);
    return {
      valid,
      errors: validator.errors || [],
      errorText: valid ? "" : ajv.errorsText(validator.errors, { separator: "; " })
    };
  };
}

async function handleOrderCreated(envelope, { productEventPublisher }) {
  const payload = envelope.payload || {};
  const orderId = payload.orderId;
  const items = Array.isArray(payload.items) ? payload.items : [];

  if (!orderId || items.length === 0) {
    throw new Error("order.created payload must include orderId and items");
  }

  for (const item of items) {
    const quantity = Number(item.quantity || 0);
    if (!item.productId || quantity <= 0) {
      throw new Error("order.created item must include productId and positive quantity");
    }

    const existing = await Product.findOne({
      productId: item.productId,
      "reservations.orderId": orderId
    });

    if (existing) {
      const reservation = existing.reservations.find((entry) => entry.orderId === orderId);
      if (reservation && reservation.status !== "confirmed") {
        reservation.status = "confirmed";
        reservation.confirmedAt = new Date();
        await existing.save();
      }
      continue;
    }

    const updated = await Product.findOneAndUpdate(
      { productId: item.productId, inventory: { $gte: quantity } },
      {
        $inc: { inventory: -quantity },
        $push: {
          reservations: {
            orderId,
            quantity,
            status: "confirmed",
            reservedAt: new Date(),
            confirmedAt: new Date()
          }
        }
      },
      { new: true }
    );

    if (!updated) {
      throw new Error(`Inventory update failed for productId=${item.productId} orderId=${orderId}`);
    }

    const previousQty = updated.inventory + quantity;
    await productEventPublisher.publishInventoryUpdated({
      productId: item.productId,
      warehouseId: "default",
      delta: -quantity,
      previousQty,
      newQty: updated.inventory,
      reason: "order_created_consumer",
      updatedAt: new Date().toISOString()
    });

    console.log(
      `[product-service] order.created inventory update orderId=${orderId} productId=${item.productId} previousQty=${previousQty} newQty=${updated.inventory}`
    );
  }
}

async function startOrderCreatedConsumer({
  kafka,
  redisClient,
  consumerGroup,
  productEventPublisher,
  dlqProducer,
  retryPolicy
}) {
  const topic = EVENT_TO_TOPIC[EVENT_TYPES.ORDER_CREATED];
  const consumer = kafka.consumer({ groupId: consumerGroup });
  const validateEnvelope = createOrderCreatedValidator();

  await consumer.connect();
  await consumer.subscribe({ topic, fromBeginning: false });

  await consumer.run({
    autoCommit: false,
    eachMessage: async ({ topic: currentTopic, partition, message, heartbeat }) => {
      const result = await events.consumer.processKafkaMessage({
        message,
        topic: currentTopic,
        partition,
        consumerGroup,
        redisClient,
        validateEnvelope,
        heartbeat,
        commitOffsets: (offsets) => consumer.commitOffsets(offsets),
        dlqProducer,
        retryPolicy,
        handleEvent: (envelope) => handleOrderCreated(envelope, { productEventPublisher })
      });

      const eventId = result && result.envelope ? result.envelope.eventId : "unknown";
      const orderId =
        result && result.envelope && result.envelope.payload ? result.envelope.payload.orderId : "n/a";
      const key = message && message.key ? message.key.toString("utf8") : "n/a";

      if (result.status === "duplicate") {
        console.log(
          `[product-service] Duplicate prevented eventType=${EVENT_TYPES.ORDER_CREATED} eventId=${eventId} orderId=${orderId} topic=${currentTopic} key=${key}`
        );
        return;
      }

      if (result.status === "dlq") {
        console.log(
          `[product-service] Routed to DLQ eventType=${EVENT_TYPES.ORDER_CREATED} eventId=${eventId} orderId=${orderId} topic=${currentTopic} dlqTopic=${result.dlqTopic} classification=${result.classification}`
        );
        return;
      }

      console.log(
        `[product-service] Consumed eventType=${EVENT_TYPES.ORDER_CREATED} eventId=${eventId} orderId=${orderId} topic=${currentTopic} key=${key} status=${result.status} attempts=${result.attempts || 1}`
      );
    }
  });

  console.log(`[product-service] Kafka consumer subscribed topic=${topic} group=${consumerGroup}`);
  return consumer;
}

module.exports = {
  startOrderCreatedConsumer
};
