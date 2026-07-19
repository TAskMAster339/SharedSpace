package middleware

import (
	"net/http"

	"sharedspace/internal/apperror"
	"sharedspace/internal/auth"
)

// RequireActivated gates a route on the authenticated user having a verified
// email. Must be chained AFTER JWTAuth — it reads the claims placed into the
// request context by JWTAuth. Requests from non-activated users receive 403
// with code `account_not_activated` so the frontend can show its modal.
func RequireActivated(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		claims, ok := auth.ClaimsFromCtx(r.Context())
		if !ok || claims == nil {
			apperror.Write(w, apperror.Unauthorized("требуется access токен"))
			return
		}
		if !claims.Activated {
			apperror.Write(w, apperror.New("требуется подтверждение почты", "account_not_activated", http.StatusForbidden))
			return
		}
		next.ServeHTTP(w, r)
	})
}
