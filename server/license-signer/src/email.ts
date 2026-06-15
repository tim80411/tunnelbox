/**
 * License-delivery email via Resend (https://resend.com).
 *
 * Isolated here so the email provider is a one-file swap: only `sendLicenseEmail`
 * talks to a provider; the webhook/delivery logic depends on this signature, not
 * on Resend. Requires a Resend API key and a verified sender domain.
 */

export interface EmailEnv {
  /** Resend API key (set via `wrangler secret put RESEND_API_KEY`). */
  RESEND_API_KEY: string
  /** From address on a Resend-verified domain, e.g. "TunnelBox <license@tunnelboxapp.com>". */
  LICENSE_FROM_EMAIL: string
}

export interface LicenseEmailParams {
  to: string
  downloadUrl: string
  orderNumber?: number
}

export async function sendLicenseEmail(env: EmailEnv, p: LicenseEmailParams): Promise<void> {
  const orderLine = p.orderNumber ? `Order #${p.orderNumber} · ` : ''

  const text = [
    'Hi there,',
    '',
    "Thanks for getting TunnelBox Pro — you're all set.",
    '',
    'Download your license file:',
    p.downloadUrl,
    '',
    'To activate: open TunnelBox → Settings → Activate Pro, then pick the',
    'downloaded license.json (drag-and-drop onto the window works too).',
    '',
    'Keep this email — the download link stays valid so you can re-download on a',
    'new machine anytime.',
    '',
    `${orderLine}TunnelBox Pro · Lifetime access`
  ].join('\n')

  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a">
  <p>Hi there,</p>
  <p>Thanks for getting <strong>TunnelBox Pro</strong> — you're all set.</p>
  <p><a href="${p.downloadUrl}" style="display:inline-block;background:#4f8ef7;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">Download your license</a></p>
  <p>To activate: open TunnelBox → Settings → <strong>Activate Pro</strong>, then pick the downloaded <code>license.json</code> (drag-and-drop onto the window works too).</p>
  <p style="color:#666">Keep this email — the download link stays valid, so you can re-download on a new machine anytime.</p>
  <p style="color:#666;font-size:13px">${orderLine}TunnelBox Pro · Lifetime access</p>
</div>`

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      from: env.LICENSE_FROM_EMAIL,
      to: p.to,
      subject: 'Your TunnelBox Pro license is ready',
      text,
      html
    })
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Resend email failed: ${res.status} ${detail}`)
  }
}
