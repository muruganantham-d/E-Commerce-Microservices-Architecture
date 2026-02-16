const path = require("path");

const SCHEMA_FILES = {
  "user.created": "auth.user.created.v1.schema.json",
  "user.updated": "auth.user.updated.v1.schema.json",
  "product.created": "product.created.v1.schema.json",
  "product.updated": "product.updated.v1.schema.json",
  "inventory.updated": "inventory.updated.v1.schema.json",
  "order.created": "order.created.v1.schema.json",
  "order.cancelled": "order.cancelled.v1.schema.json"
};

function resolveSchemaPath(eventType) {
  const file = SCHEMA_FILES[eventType];

  if (!file) {
    throw new Error(`Schema is not registered for event type: ${eventType}`);
  }

  return path.join(__dirname, file);
}

module.exports = {
  SCHEMA_FILES,
  resolveSchemaPath
};
