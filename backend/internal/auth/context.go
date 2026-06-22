package auth

import "context"

type Claims struct {
	UserID     string
	Email      string
	Username   string
	FirstName  string
	SecondName string
}

type contextKey string

const claimsKey contextKey = "auth_claims"

func SetClaims(ctx context.Context, c *Claims) context.Context {
	return context.WithValue(ctx, claimsKey, c)
}

func ClaimsFromCtx(ctx context.Context) (*Claims, bool) {
	c, ok := ctx.Value(claimsKey).(*Claims)
	return c, ok && c != nil
}
