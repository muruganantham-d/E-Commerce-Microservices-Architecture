const {
  EVENT_VERSION,
  TOPICS,
  EVENT_TYPES,
  EVENT_TO_TOPIC,
  TOPIC_STRATEGY,
  getKafkaTopicDefinitions
} = require("./topics");
const { SCHEMA_FILES, resolveSchemaPath } = require("./schemas");

module.exports = {
  EVENT_VERSION,
  TOPICS,
  EVENT_TYPES,
  EVENT_TO_TOPIC,
  TOPIC_STRATEGY,
  getKafkaTopicDefinitions,
  SCHEMA_FILES,
  resolveSchemaPath
};
