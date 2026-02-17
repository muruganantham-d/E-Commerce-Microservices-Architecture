const { events } = require("@ecom/common");
const { EVENT_TYPES } = require("@ecom/contracts");

function createOrderEventPublisher(kafkaProducer) {
  return {
    async publishOrderCreated(payload) {
      const result = await events.publisher.publishEvent(kafkaProducer, {
        eventType: EVENT_TYPES.ORDER_CREATED,
        source: "order-service",
        payload,
        key: payload.orderId
      });

      console.log(
        `[order-service] Published ${EVENT_TYPES.ORDER_CREATED} eventId=${result.envelope.eventId} key=${result.key} topic=${result.topic}`
      );

      return result;
    }
  };
}

module.exports = {
  createOrderEventPublisher
};
