package mailer

import (
	"embed"
	"fmt"
	"strings"
)

//go:embed icons/logo.png
var iconFS embed.FS

var logoData []byte

func init() {
	logoData, _ = iconFS.ReadFile("icons/logo.png")
}

func LogoBytes() []byte {
	return logoData
}

func emailLayout(title, bodyHTML string) string {
	return fmt.Sprintf(`<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>%s</title>
</head>
<body style="margin:0;padding:0;background-color:#f6f6f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table width="100%%" cellpadding="0" cellspacing="0" style="padding:24px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%%;">
        <tr><td style="padding-bottom:24px;text-align:center;">
          <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
            <tr>
              <td style="vertical-align:middle;padding-right:10px;">
                <img src="cid:logo@sharedspace" width="32" height="32" alt="" style="display:block;border:0;">
              </td>
              <td style="vertical-align:middle;">
                <span style="font-size:18px;font-weight:700;color:#1e3a8a;letter-spacing:-0.3px;">Shared</span><span style="font-size:18px;font-weight:700;color:#3b82f6;letter-spacing:-0.3px;">Space</span>
              </td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="background:#ffffff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.06),0 1px 2px rgba(0,0,0,0.04);overflow:hidden;">
          %s
        </td></tr>
        <tr><td style="padding-top:20px;text-align:center;">
          <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;">SharedSpace — просторный как космос</p>
          <p style="margin:0;font-size:11px;color:#b0b7c0;">&copy; %s SharedSpace</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`, title, bodyHTML, "2025")
}

func verificationEmailBody(verifyURL string) (html, text string) {
	text = strings.Join([]string{
		"Добрый день!",
		"",
		"Спасибо за регистрацию в SharedSpace.",
		"Чтобы подтвердить ваш адрес электронной почты, перейдите по ссылке:",
		"",
		verifyURL,
		"",
		"Ссылка действительна в течение 24 часов.",
		"Если вы не регистрировались в SharedSpace, просто проигнорируйте это письмо.",
		"",
		"— Команда SharedSpace",
	}, "\n")

	body := fmt.Sprintf(`
        <div style="padding:32px 32px 28px;">
          <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;text-align:center;">Подтвердите почту</h1>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#4b5563;text-align:center;">
            Спасибо за регистрацию в SharedSpace! Чтобы завершить создание аккаунта, подтвердите ваш адрес электронной почты.
          </p>
          <table cellpadding="0" cellspacing="0" style="margin:0 auto 20px;">
            <tr><td style="background:#3b82f6;border-radius:8px;text-align:center;">
              <a href="%s" style="display:inline-block;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:13px 36px;letter-spacing:0.2px;border-radius:8px;">Подтвердить почту</a>
            </td></tr>
          </table>
          <table cellpadding="0" cellspacing="0" style="margin:0 auto 16px;background:#f9fafb;border-radius:8px;width:100%%;">
            <tr><td style="padding:12px 16px;font-size:13px;line-height:1.5;color:#6b7280;word-break:break-all;">
              Если кнопка не работает, скопируйте ссылку в браузер:<br>
              <a href="%s" style="color:#3b82f6;text-decoration:underline;">%s</a>
            </td></tr>
          </table>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 16px;">
          <p style="margin:0;font-size:13px;line-height:1.5;color:#9ca3af;">
            Ссылка действительна в течение 24 часов. Если вы не регистрировались в SharedSpace, просто проигнорируйте это письмо.
          </p>
        </div>
`, verifyURL, verifyURL, verifyURL)

	html = emailLayout("Подтверждение почты — SharedSpace", body)
	return html, text
}

func passwordResetEmailBody(resetURL string) (html, text string) {
	text = strings.Join([]string{
		"Здравствуйте!",
		"",
		"Мы получили запрос на восстановление пароля для вашего аккаунта SharedSpace.",
		"Чтобы задать новый пароль, перейдите по ссылке:",
		"",
		resetURL,
		"",
		"Ссылка действительна в течение 1 часа.",
		"Если вы не запрашивали восстановление пароля, проигнорируйте это письмо — ваш пароль останется без изменений.",
		"",
		"— Команда SharedSpace",
	}, "\n")

	body := fmt.Sprintf(`
        <div style="padding:32px 32px 28px;">
          <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;text-align:center;">Восстановление пароля</h1>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#4b5563;text-align:center;">
            Мы получили запрос на сброс пароля для вашего аккаунта SharedSpace. Нажмите кнопку ниже, чтобы задать новый пароль.
          </p>
          <table cellpadding="0" cellspacing="0" style="margin:0 auto 20px;">
            <tr><td style="background:#3b82f6;border-radius:8px;text-align:center;">
              <a href="%s" style="display:inline-block;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:13px 36px;letter-spacing:0.2px;border-radius:8px;">Сбросить пароль</a>
            </td></tr>
          </table>
          <table cellpadding="0" cellspacing="0" style="margin:0 auto 16px;background:#f9fafb;border-radius:8px;width:100%%;">
            <tr><td style="padding:12px 16px;font-size:13px;line-height:1.5;color:#6b7280;word-break:break-all;">
              Если кнопка не работает, скопируйте ссылку в браузер:<br>
              <a href="%s" style="color:#3b82f6;text-decoration:underline;">%s</a>
            </td></tr>
          </table>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 16px;">
          <p style="margin:0;font-size:13px;line-height:1.5;color:#9ca3af;">
            Ссылка действительна в течение 1 часа. Если вы не запрашивали восстановление пароля, просто проигнорируйте это письмо — ваш пароль останется без изменений.
          </p>
        </div>
`, resetURL, resetURL, resetURL)

	html = emailLayout("Сброс пароля — SharedSpace", body)
	return html, text
}
