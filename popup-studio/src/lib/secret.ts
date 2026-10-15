import "server-only";

/**
 * The one signing secret for review links and the results push API.
 * Falls back to a fixed development value; production must set REVIEW_SECRET.
 */
const DEFAULT_SECRET = "dev-review-secret-change-me";

export function appSecret() {
  return process.env.REVIEW_SECRET || DEFAULT_SECRET;
}

/** True when the deployment signs with the public default (unset, or set to the default string). */
export function secretIsDefault() {
  return appSecret() === DEFAULT_SECRET;
}

/** Production running on the default secret: review links are forgeable and the push API is disabled. */
export function weakSecretInProduction() {
  return process.env.NODE_ENV === "production" && secretIsDefault();
}
