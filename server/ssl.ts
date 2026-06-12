/**
 * Spotix Scanner — Professional Event Check-in System
 * Copyright © 2026 Spotix Technologies. All rights reserved.
 *
 * This source code is proprietary and confidential.
 * Unauthorized copying, modification, distribution, or use of this file,
 * via any medium, is strictly prohibited without the express written
 * permission of Spotix Technologies.
 *
 * For licensing inquiries, contact: legal@spotix.com.ng
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import selfsigned from 'selfsigned';

// ─── Network helpers ──────────────────────────────────────────────────────────

export function getLocalIPs(): string[] {
  const ips: string[] = [];
  for (const iface of Object.values(os.networkInterfaces())) {
    for (const config of iface ?? []) {
      if (config.family === 'IPv4' && !config.internal) ips.push(config.address);
    }
  }
  return ips;
}

// ─── SSL cert management ──────────────────────────────────────────────────────

export function getOrCreateCert(certDir: string): { cert: Buffer; key: Buffer; localIPs: string[] } {
  const certPath    = path.join(certDir, 'cert.pem');
  const keyPath     = path.join(certDir, 'key.pem');
  const ipStampPath = path.join(certDir, 'cert-ips.json');

  fs.mkdirSync(certDir, { recursive: true });

  const currentIPs = getLocalIPs();
  let needsRegen   = true;

  if (fs.existsSync(certPath) && fs.existsSync(keyPath) && fs.existsSync(ipStampPath)) {
    try {
      const stamped: string[] = JSON.parse(fs.readFileSync(ipStampPath, 'utf-8'));
      needsRegen = !(stamped.length === currentIPs.length && currentIPs.every(ip => stamped.includes(ip)));
    } catch { /* regen */ }
  }

  if (!needsRegen) {
    console.log(`[SSL] Using cached cert (IPs: ${currentIPs.join(', ')})`);
    return { cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath), localIPs: currentIPs };
  }

  const altNames = [
    { type: 2, value: 'localhost' },
    { type: 2, value: 'spotix-scanner.local' },
    { type: 7, ip: '127.0.0.1' },
    ...currentIPs.map(ip => ({ type: 7, ip })),
  ];

  const pems = selfsigned.generate(
    [{ name: 'commonName', value: 'spotix-scanner.local' }],
    { days: 3650, algorithm: 'sha256', keySize: 2048, extensions: [{ name: 'subjectAltName', altNames }] }
  );

  fs.writeFileSync(certPath, pems.cert);
  fs.writeFileSync(keyPath,  pems.private);
  fs.writeFileSync(ipStampPath, JSON.stringify(currentIPs));
  console.log(`[SSL] Cert generated — SANs: localhost, 127.0.0.1, ${currentIPs.join(', ')}`);

  return { cert: Buffer.from(pems.cert), key: Buffer.from(pems.private), localIPs: currentIPs };
}
