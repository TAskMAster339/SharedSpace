package pagination

import (
	"encoding/base64"
	"fmt"
	"strings"
	"time"
)

type Cursor struct {
	Time time.Time
	ID   string
}

func Encode(t time.Time, id string) string {
	raw := fmt.Sprintf("%s|%s", t.UTC().Format(time.RFC3339Nano), id)
	return base64.RawURLEncoding.EncodeToString([]byte(raw))
}

func Decode(s string) (Cursor, error) {
	b, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return Cursor{}, fmt.Errorf("invalid cursor encoding: %w", err)
	}
	parts := strings.SplitN(string(b), "|", 2)
	if len(parts) != 2 {
		return Cursor{}, fmt.Errorf("invalid cursor format")
	}
	t, err := time.Parse(time.RFC3339Nano, parts[0])
	if err != nil {
		return Cursor{}, fmt.Errorf("invalid cursor time: %w", err)
	}
	return Cursor{Time: t, ID: parts[1]}, nil
}
