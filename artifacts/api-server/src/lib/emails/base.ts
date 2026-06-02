export function baseTemplate(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>EverydayAI</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

          <!-- Header -->
          <tr>
            <td align="center" style="padding-bottom:28px;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color:#0a0f1e;border-radius:12px;padding:12px 20px;">
                    <span style="font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">EverydayAI</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background-color:#ffffff;border-radius:16px;padding:40px 40px 36px;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding:28px 0 0;">
              <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
                EverydayAI · Built for Nigerian businesses<br/>
                <a href="https://everydayaihq.carrd.co" style="color:#6b7280;text-decoration:none;">everydayaihq.carrd.co</a>
                &nbsp;·&nbsp;
                <a href="mailto:hello@everydayai.com" style="color:#6b7280;text-decoration:none;">hello@everydayai.com</a>
              </p>
              <p style="margin:10px 0 0;font-size:11px;color:#d1d5db;">
                You're receiving this because you have an EverydayAI account.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function btnPrimary(text: string, href: string): string {
  return `<table cellpadding="0" cellspacing="0" style="margin-top:28px;">
    <tr>
      <td style="background-color:#3b5bfc;border-radius:10px;">
        <a href="${href}" style="display:inline-block;padding:13px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;letter-spacing:-0.1px;">${text}</a>
      </td>
    </tr>
  </table>`;
}

export function divider(): string {
  return `<div style="height:1px;background-color:#f3f4f6;margin:24px 0;"></div>`;
}
