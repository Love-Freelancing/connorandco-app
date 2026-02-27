import { RedisCache } from "./redis-client";

const cache = new RedisCache("portal-login-code", 15 * 60);

type PortalLoginCodePayload = {
  code: string;
  actionLink: string;
};

function getKey(portalId: string, email: string) {
  return `${portalId}:${email}`;
}

export const portalLoginCodeCache = {
  async set(
    portalId: string,
    email: string,
    payload: PortalLoginCodePayload,
    ttlSeconds = 15 * 60,
  ) {
    await cache.set(getKey(portalId, email), payload, ttlSeconds);
  },

  async get(portalId: string, email: string) {
    return cache.get<PortalLoginCodePayload>(getKey(portalId, email));
  },

  async delete(portalId: string, email: string) {
    await cache.delete(getKey(portalId, email));
  },
};
