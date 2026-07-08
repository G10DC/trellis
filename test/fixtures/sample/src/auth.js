export function validateToken(token) {
  if (!token) return false;
  return token.length > 10;
}

export function revokeToken(token) {
  return true;
}
