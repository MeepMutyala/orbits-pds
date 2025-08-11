export function requireAdmin(headers: Record<string, unknown>, adminPassword: string) {
  // Normalize headers to lowercase for consistent lookup
  const hRaw = headers as Record<string, string | string[] | undefined>
  const h: Record<string, string> = {}
  
  for (const k in hRaw) {
    if (Object.prototype.hasOwnProperty.call(hRaw, k)) {
      const v = hRaw[k]
      h[k.toLowerCase()] = Array.isArray(v) ? v[0] || '' : v || ''
    }
  }
  
  const candidate = 
    h['x-orbits-admin'] ||
    h['x-admin-secret'] ||
    h['x-admin-password'] ||
    h['admin'] ||
    h['admin_password'] ||
    h['admin-password']
  
  if (!candidate || candidate !== adminPassword) {
    throw xrpcError('AuthMissing', 'Authentication Required')
  }
}

export function xrpcError(code: string, message: string) {
  const err: any = new Error(message)
  err.error = code
  err.message = message
  return err
}