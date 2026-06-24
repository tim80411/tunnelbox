// TIM-226: well-known ports that usually front sensitive services. Sharing one
// publicly is rarely intended, so we confirm before opening a tunnel to it.

export const SENSITIVE_PORTS: Readonly<Record<number, string>> = {
  22: 'SSH',
  23: 'Telnet',
  25: 'SMTP',
  445: 'SMB',
  1433: 'Microsoft SQL Server',
  1521: 'Oracle DB',
  2049: 'NFS',
  3306: 'MySQL / MariaDB',
  3389: 'RDP (遠端桌面)',
  5432: 'PostgreSQL',
  5900: 'VNC',
  5984: 'CouchDB',
  6379: 'Redis',
  9200: 'Elasticsearch',
  11211: 'Memcached',
  27017: 'MongoDB'
}

/** Returns the human service name if `port` is a known sensitive port, else null. */
export function sensitivePortName(port: number | undefined | null): string | null {
  if (typeof port !== 'number' || !Number.isFinite(port)) return null
  return SENSITIVE_PORTS[port] ?? null
}

export function isSensitivePort(port: number | undefined | null): boolean {
  return sensitivePortName(port) !== null
}
