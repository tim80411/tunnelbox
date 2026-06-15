/**
 * License-delivery email via the Cloudflare Email Service Workers binding.
 *
 * No API key: the `send_email` binding (env.EMAIL) sends from a domain onboarded
 * with `wrangler email sending enable <domain>`. Isolated here so the email
 * provider is a one-file swap; delivery.ts depends only on this signature.
 */

/**
 * Minimal structural type for the `send_email` binding (env.EMAIL). Declared
 * locally because the pinned @cloudflare/workers-types predates the object-form
 * send(); run `wrangler types` to adopt the generated `SendEmail` type instead.
 */
export interface EmailSender {
  send(message: {
    to: string | string[]
    from: { email: string; name?: string }
    subject: string
    html?: string
    text?: string
    replyTo?: string
  }): Promise<unknown>
}

export interface EmailEnv {
  /** Cloudflare Email Service binding (wrangler.toml `[[send_email]] name = "EMAIL"`). */
  EMAIL: EmailSender
  /** From address: "Name <email>" or a bare "email"; the domain must be onboarded. */
  LICENSE_FROM_EMAIL: string
}

export interface LicenseEmailParams {
  to: string
  downloadUrl: string
  orderNumber?: number
}

/** Parse "Name <email>" (or a bare "email") into the binding's from object. */
function parseFrom(value: string): { email: string; name?: string } {
  const m = value.match(/^\s*(.*?)\s*<([^>]+)>\s*$/)
  if (m) return { email: m[2].trim(), name: m[1].trim() || undefined }
  return { email: value.trim() }
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

  // The binding throws on failure (error.code / error.message); the caller
  // (storeAndDeliver) catches and rolls back so LemonSqueezy can retry.
  await env.EMAIL.send({
    to: p.to,
    from: parseFrom(env.LICENSE_FROM_EMAIL),
    subject: 'Your TunnelBox Pro license is ready',
    text,
    html
  })
}
