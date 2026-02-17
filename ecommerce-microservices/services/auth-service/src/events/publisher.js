const { events } = require("@ecom/common");
const { EVENT_TYPES } = require("@ecom/contracts");

function createAuthEventPublisher(kafkaProducer) {
  return {
    async publishUserCreated(payload) {
      const result = await events.publisher.publishEvent(kafkaProducer, {
        eventType: EVENT_TYPES.USER_CREATED,
        source: "auth-service",
        payload,
        key: payload.userId
      });

      console.log(
        `[auth-service] Published ${EVENT_TYPES.USER_CREATED} eventId=${result.envelope.eventId} key=${result.key} topic=${result.topic}`
      );

      return result;
    }
  };
}

module.exports = {
  createAuthEventPublisher
};
