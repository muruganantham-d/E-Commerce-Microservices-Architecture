const { events } = require("@ecom/common");
const { EVENT_TYPES } = require("@ecom/contracts");

function createProductEventPublisher(kafkaProducer) {
  return {
    async publishInventoryUpdated(payload) {
      const result = await events.publisher.publishEvent(kafkaProducer, {
        eventType: EVENT_TYPES.INVENTORY_UPDATED,
        source: "product-service",
        payload,
        key: payload.productId
      });

      console.log(
        `[product-service] Published ${EVENT_TYPES.INVENTORY_UPDATED} eventId=${result.envelope.eventId} key=${result.key} topic=${result.topic}`
      );

      return result;
    }
  };
}

module.exports = {
  createProductEventPublisher
};
