export function requireSecretValue(value, name) {
  if (!value || /^\[(?:SENSITIVE|REDACTED)\]$/i.test(String(value).trim())) {
    throw new Error(`${name} requires an actual provisioned secret; an environment-export placeholder cannot be used.`);
  }
  return value;
}
