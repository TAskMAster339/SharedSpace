package mailer

import (
	"context"
	"crypto/tls"
	"encoding/base64"
	"fmt"
	"net"
	"net/smtp"
	"strconv"
	"strings"
	"time"
)

// Mailer abstracts email delivery.
type Mailer interface {
	Send(ctx context.Context, to, subject, htmlBody, textBody string) error
	SendVerificationEmail(ctx context.Context, to, verifyURL string) error
	SendPasswordResetEmail(ctx context.Context, to, resetURL string) error
}

// SMTPMailer sends emails via SMTP using the standard net/smtp package.
type SMTPMailer struct {
	host      string
	port      int
	user      string
	password  string
	from      string
	fromName  string
	useTLS    bool
	logoBytes []byte
}

// NewSMTPMailer constructs an SMTPMailer. If host is empty, returns a no-op
// mailer that simply returns nil — useful for local dev without SMTP access.
func NewSMTPMailer(host string, port int, user, password, from, fromName string, useTLS bool, logoBytes []byte) Mailer {
	if host == "" {
		return &noopMailer{}
	}
	return &SMTPMailer{
		host:      host,
		port:      port,
		user:      user,
		password:  password,
		from:      from,
		fromName:  fromName,
		useTLS:    useTLS,
		logoBytes: logoBytes,
	}
}

const (
	smtpDialTimeout  = 15 * time.Second
	smtpHelloTimeout = 15 * time.Second
)

func (m *SMTPMailer) Send(_ context.Context, to, subject, htmlBody, textBody string) error {
	addr := net.JoinHostPort(m.host, strconv.Itoa(m.port))

	var conn net.Conn
	var err error

	if m.useTLS && m.port == 465 {
		dialer := &net.Dialer{Timeout: smtpDialTimeout}
		conn, err = tls.DialWithDialer(dialer, "tcp", addr, &tls.Config{
			ServerName: m.host,
			MinVersion: tls.VersionTLS12,
		})
		if err != nil {
			return fmt.Errorf("smtp tls dial %s: %w", addr, err)
		}
	} else {
		dialer := &net.Dialer{Timeout: smtpDialTimeout}
		conn, err = dialer.Dial("tcp", addr)
		if err != nil {
			return fmt.Errorf("smtp dial %s: %w", addr, err)
		}
	}
	defer conn.Close()

	c, err := smtp.NewClient(conn, m.host)
	if err != nil {
		return fmt.Errorf("smtp new client: %w", err)
	}
	defer c.Quit()

	conn.SetDeadline(time.Now().Add(smtpHelloTimeout))

	if m.useTLS && m.port != 465 {
		if ok, _ := c.Extension("STARTTLS"); !ok {
			return fmt.Errorf("smtp server %s does not support STARTTLS", addr)
		}
		if err := c.StartTLS(&tls.Config{
			ServerName: m.host,
			MinVersion: tls.VersionTLS12,
		}); err != nil {
			return fmt.Errorf("smtp starttls: %w", err)
		}
	}

	if err := c.Auth(smtp.PlainAuth("", m.user, m.password, m.host)); err != nil {
		return fmt.Errorf("smtp auth: %w", err)
	}

	if err := c.Mail(m.from); err != nil {
		return fmt.Errorf("smtp MAIL FROM: %w", err)
	}
	if err := c.Rcpt(to); err != nil {
		return fmt.Errorf("smtp RCPT TO: %w", err)
	}

	w, err := c.Data()
	if err != nil {
		return fmt.Errorf("smtp DATA: %w", err)
	}
	defer w.Close()

	msg := buildMessage(m.from, m.fromName, to, subject, htmlBody, textBody, m.logoBytes)
	if _, err := w.Write([]byte(msg)); err != nil {
		return fmt.Errorf("smtp write body: %w", err)
	}

	return nil
}

var logoCID = "logo@sharedspace"

func buildMessage(from, fromName, to, subject, htmlBody, textBody string, logoBytes []byte) string {
	var b strings.Builder
	b.WriteString("From: ")
	if fromName != "" {
		fmt.Fprintf(&b, "%s <%s>", fromName, from)
	} else {
		b.WriteString(from)
	}
	b.WriteString("\r\n")
	fmt.Fprintf(&b, "To: %s\r\n", to)
	fmt.Fprintf(&b, "Subject: %s\r\n", encodeHeader(subject))
	b.WriteString("MIME-Version: 1.0\r\n")

	hasLogo := len(logoBytes) > 0 && strings.Contains(htmlBody, "cid:")

	if !hasLogo {
		if htmlBody == "" {
			b.WriteString("Content-Type: text/plain; charset=utf-8\r\n")
			b.WriteString("Content-Transfer-Encoding: 8bit\r\n\r\n")
			b.WriteString(textBody)
			return b.String()
		}
		if textBody == "" {
			b.WriteString("Content-Type: text/html; charset=utf-8\r\n")
			b.WriteString("Content-Transfer-Encoding: 8bit\r\n\r\n")
			b.WriteString(htmlBody)
			return b.String()
		}
		boundary := "alt-sharedspace-7f3a9c1d"
		fmt.Fprintf(&b, "Content-Type: multipart/alternative; boundary=%q\r\n\r\n", boundary)
		writePlainText(&b, boundary, textBody)
		writeHTML(&b, boundary, htmlBody)
		fmt.Fprintf(&b, "--%s--\r\n", boundary)
		return b.String()
	}

	// Multipart/related with embedded logo
	relBoundary := "rel-sharedspace-a1b2c3d4"
	altBoundary := "alt-sharedspace-7f3a9c1d"
	fmt.Fprintf(&b, "Content-Type: multipart/related; boundary=%q\r\n\r\n", relBoundary)
	fmt.Fprintf(&b, "--%s\r\n", relBoundary)
	fmt.Fprintf(&b, "Content-Type: multipart/alternative; boundary=%q\r\n\r\n", altBoundary)
	writePlainText(&b, altBoundary, textBody)
	writeHTML(&b, altBoundary, htmlBody)
	fmt.Fprintf(&b, "--%s--\r\n", altBoundary)
	fmt.Fprintf(&b, "\r\n--%s\r\n", relBoundary)
	b.WriteString("Content-Type: image/png\r\n")
	fmt.Fprintf(&b, "Content-ID: <%s>\r\n", logoCID)
	b.WriteString("Content-Disposition: inline\r\n")
	b.WriteString("Content-Transfer-Encoding: base64\r\n\r\n")
	logoB64 := base64.StdEncoding.EncodeToString(logoBytes)
	// Fold base64 to 76-char lines per RFC 2045
	for i := 0; i < len(logoB64); i += 76 {
		end := i + 76
		if end > len(logoB64) {
			end = len(logoB64)
		}
		b.WriteString(logoB64[i:end])
		b.WriteString("\r\n")
	}
	fmt.Fprintf(&b, "--%s--\r\n", relBoundary)
	return b.String()
}

func writePlainText(b *strings.Builder, boundary, text string) {
	fmt.Fprintf(b, "--%s\r\n", boundary)
	b.WriteString("Content-Type: text/plain; charset=utf-8\r\n")
	b.WriteString("Content-Transfer-Encoding: 8bit\r\n\r\n")
	b.WriteString(text)
	b.WriteString("\r\n")
}

func writeHTML(b *strings.Builder, boundary, html string) {
	fmt.Fprintf(b, "--%s\r\n", boundary)
	b.WriteString("Content-Type: text/html; charset=utf-8\r\n")
	b.WriteString("Content-Transfer-Encoding: 8bit\r\n\r\n")
	b.WriteString(html)
	b.WriteString("\r\n")
}

func encodeHeader(s string) string {
	return s
}

func (m *SMTPMailer) SendVerificationEmail(ctx context.Context, to, verifyURL string) error {
	html, text := verificationEmailBody(verifyURL)
	return m.Send(ctx, to, "Подтверждение регистрации — SharedSpace", html, text)
}

func (m *SMTPMailer) SendPasswordResetEmail(ctx context.Context, to, resetURL string) error {
	html, text := passwordResetEmailBody(resetURL)
	return m.Send(ctx, to, "Восстановление пароля — SharedSpace", html, text)
}

// noopMailer is a no-op Mailer used when SMTP_HOST is not configured.
type noopMailer struct{}

func (noopMailer) Send(_ context.Context, _, _, _, _ string) error            { return nil }
func (noopMailer) SendVerificationEmail(_ context.Context, _, _ string) error  { return nil }
func (noopMailer) SendPasswordResetEmail(_ context.Context, _, _ string) error { return nil }
