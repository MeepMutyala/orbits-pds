export function requireAdmin(headers: Record<string, unknown>, adminPassword: string) {
  // Accept common header spellings (case-insensitive). Node/Express lowercases headers.
  const h = headers as Record<string, string | undefined>;
  const candidate =
    h['x-orbits-admin'] ||
    h['x-admin-secret'] ||
    h['x-admin-password'] ||
    h['admin'] ||
    h['admin_password'] ||
    h['admin-password'];
    
  if (!candidate || candidate !== adminPassword) {
    const err = new Error('AuthMissing');
    // Attach proper XRPC error format
    (err as any).status = 401;
    throw err;
  }
}