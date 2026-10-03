export interface BaseEmailParams {
  title: string
  preheader?: string
  contentHtml: string
  /** Replaces the default "sent because of your order" footer line (e.g. newsletter mails). */
  footerHtml?: string
}

export function renderEmailBase(params: BaseEmailParams): {
  html: string
} {
  const html = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${params.title}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #0b0d10;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #e5e7eb;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      background-color: #0b0d10;
      padding: 40px 16px;
      box-sizing: border-box;
    }
    .container {
      max-width: 580px;
      margin: 0 auto;
      background-color: #12151b;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 8px;
      overflow: hidden;
    }
    .header {
      padding: 32px 36px 20px 36px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .logo {
      font-size: 20px;
      font-weight: 700;
      letter-spacing: -0.04em;
      color: #ffffff;
      text-decoration: none;
    }
    .logo-accent {
      color: #0080c4;
    }
    .tagline {
      font-size: 11px;
      color: rgba(255, 255, 255, 0.4);
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .content {
      padding: 36px;
      font-size: 14px;
      line-height: 1.6;
      color: #d1d5db;
    }
    .footer {
      padding: 24px 36px;
      background-color: #0e1014;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      font-size: 11px;
      color: rgba(255, 255, 255, 0.4);
      line-height: 1.5;
    }
    .footer a {
      color: #38bdf8;
      text-decoration: none;
    }
    .btn {
      display: inline-block;
      padding: 12px 24px;
      background-color: #ffffff;
      color: #000000 !important;
      font-weight: 600;
      font-size: 13px;
      border-radius: 6px;
      text-decoration: none;
      margin: 16px 0;
    }
    .item-table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
      font-size: 13px;
    }
    .item-table th {
      text-align: left;
      color: rgba(255, 255, 255, 0.5);
      font-weight: 500;
      padding-bottom: 8px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      font-size: 11px;
    }
    .item-table td {
      padding: 12px 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      color: #e5e7eb;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <span class="logo">zuu<span class="logo-accent">lab</span></span>
        <span class="tagline">özgün 3d üretim</span>
      </div>
      <div class="content">
        ${params.contentHtml}
      </div>
      <div class="footer">
        ${params.footerHtml ?? `<div>Bu bilgilendirme e-postası ZUULAB sipariş hareketiniz nedeniyle otomatik olarak gönderilmiştir.</div>
        <div style="margin-top: 6px;">Sorularınız veya destek talepleriniz için <a href="https://zuulab.com/hesap">hesabım</a> üzerinden bize ulaşabilirsiniz.</div>`}
        <div style="margin-top: 10px; font-size: 10px; color: rgba(255, 255, 255, 0.25);">© 2026 ZUULAB. Tüm hakları saklıdır.</div>
      </div>
    </div>
  </div>
</body>
</html>`

  return { html }
}
