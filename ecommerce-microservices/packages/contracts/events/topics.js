const EVENT_VERSION = "v1";

const TOPICS = {
  AUTH_USER: `ecom.auth.user.${EVENT_VERSION}`,
  PRODUCT_CATALOG: `ecom.product.catalog.${EVENT_VERSION}`,
  PRODUCT_INVENTORY: `ecom.product.inventory.${EVENT_VERSION}`,
  ORDER: `ecom.order.order.${EVENT_VERSION}`
};

const EVENT_TYPES = {
  USER_CREATED: "user.created",
  USER_UPDATED: "user.updated",
  PRODUCT_CREATED: "product.created",
  PRODUCT_UPDATED: "product.updated",
  INVENTORY_UPDATED: "inventory.updated",
  ORDER_CREATED: "order.created",
  ORDER_CANCELLED: "order.cancelled"
};

const EVENT_TO_TOPIC = {
  [EVENT_TYPES.USER_CREATED]: TOPICS.AUTH_USER,
  [EVENT_TYPES.USER_UPDATED]: TOPICS.AUTH_USER,
  [EVENT_TYPES.PRODUCT_CREATED]: TOPICS.PRODUCT_CATALOG,
  [EVENT_TYPES.PRODUCT_UPDATED]: TOPICS.PRODUCT_CATALOG,
  [EVENT_TYPES.INVENTORY_UPDATED]: TOPICS.PRODUCT_INVENTORY,
  [EVENT_TYPES.ORDER_CREATED]: TOPICS.ORDER,
  [EVENT_TYPES.ORDER_CANCELLED]: TOPICS.ORDER
};

const TOPIC_STRATEGY = {
  [TOPICS.AUTH_USER]: {
    partitions: 6,
    replicationFactor: 3,
    localReplicationFactor: 1,
    partitionKey: "userId",
    events: [EVENT_TYPES.USER_CREATED, EVENT_TYPES.USER_UPDATED]
  },
  [TOPICS.PRODUCT_CATALOG]: {
    partitions: 12,
    replicationFactor: 3,
    localReplicationFactor: 1,
    partitionKey: "productId",
    events: [EVENT_TYPES.PRODUCT_CREATED, EVENT_TYPES.PRODUCT_UPDATED]
  },
  [TOPICS.PRODUCT_INVENTORY]: {
    partitions: 24,
    replicationFactor: 3,
    localReplicationFactor: 1,
    partitionKey: "productId",
    events: [EVENT_TYPES.INVENTORY_UPDATED]
  },
  [TOPICS.ORDER]: {
    partitions: 12,
    replicationFactor: 3,
    localReplicationFactor: 1,
    partitionKey: "orderId",
    events: [EVENT_TYPES.ORDER_CREATED, EVENT_TYPES.ORDER_CANCELLED]
  }
};

function getKafkaTopicDefinitions(isLocal = false) {
  return Object.entries(TOPIC_STRATEGY).map(([topic, strategy]) => ({
    topic,
    numPartitions: strategy.partitions,
    replicationFactor: isLocal
      ? strategy.localReplicationFactor
      : strategy.replicationFactor
  }));
}

module.exports = {
  EVENT_VERSION,
  TOPICS,
  EVENT_TYPES,
  EVENT_TO_TOPIC,
  TOPIC_STRATEGY,
  getKafkaTopicDefinitions
};
