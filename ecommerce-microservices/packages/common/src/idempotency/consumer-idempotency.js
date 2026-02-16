const DEFAULT_CLAIM_TTL_SECONDS = 60 * 60 * 24 * 7;
const DEFAULT_PROCESSED_TTL_SECONDS = 60 * 60 * 24 * 30;

function assertRedisClient(redisClient) {
  if (!redisClient || typeof redisClient.set !== "function") {
    throw new Error("A connected Redis client is required.");
  }
}

function buildIdempotencyKey({ consumerGroup, eventId }) {
  if (!consumerGroup) {
    throw new Error("consumerGroup is required.");
  }

  if (!eventId) {
    throw new Error("eventId is required.");
  }

  return `idem:${consumerGroup}:${eventId}`;
}

async function claimEvent(redisClient, {
  consumerGroup,
  eventId,
  ttlSeconds = DEFAULT_CLAIM_TTL_SECONDS,
  now = new Date().toISOString()
}) {
  assertRedisClient(redisClient);

  const key = buildIdempotencyKey({ consumerGroup, eventId });
  const value = JSON.stringify({
    status: "processing",
    eventId,
    consumerGroup,
    claimedAt: now
  });

  const response = await redisClient.set(key, value, {
    NX: true,
    EX: ttlSeconds
  });

  return {
    key,
    claimed: response === "OK"
  };
}

async function markEventProcessed(redisClient, {
  key,
  ttlSeconds = DEFAULT_PROCESSED_TTL_SECONDS,
  now = new Date().toISOString()
}) {
  assertRedisClient(redisClient);

  if (!key) {
    throw new Error("key is required.");
  }

  const current = await redisClient.get(key);
  if (!current) {
    return { updated: false };
  }

  const parsed = safeParse(current);
  const value = JSON.stringify({
    ...parsed,
    status: "processed",
    processedAt: now
  });

  const response = await redisClient.set(key, value, {
    XX: true,
    EX: ttlSeconds
  });

  return {
    updated: response === "OK"
  };
}

async function getClaimState(redisClient, { consumerGroup, eventId }) {
  assertRedisClient(redisClient);

  const key = buildIdempotencyKey({ consumerGroup, eventId });
  const raw = await redisClient.get(key);

  if (!raw) {
    return null;
  }

  return {
    key,
    data: safeParse(raw)
  };
}

async function releaseClaim(redisClient, { key }) {
  assertRedisClient(redisClient);

  if (!key) {
    throw new Error("key is required.");
  }

  return redisClient.del(key);
}

function safeParse(value) {
  try {
    return JSON.parse(value);
  } catch (error) {
    return { raw: value };
  }
}

module.exports = {
  DEFAULT_CLAIM_TTL_SECONDS,
  DEFAULT_PROCESSED_TTL_SECONDS,
  buildIdempotencyKey,
  claimEvent,
  markEventProcessed,
  getClaimState,
  releaseClaim
};
