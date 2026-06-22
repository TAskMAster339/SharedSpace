package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const (
	tokenTypeAccess  = "access"
	tokenTypeRefresh = "refresh"
)

type tokenClaims struct {
	TokenType  string `json:"token_type"`
	Email      string `json:"email,omitempty"`
	Username   string `json:"username,omitempty"`
	FirstName  string `json:"first_name,omitempty"`
	SecondName string `json:"second_name,omitempty"`
	jwt.RegisteredClaims
}

func (s *Service) issueTokenPair(user authUser) (TokenPair, error) {
	issuedAt := time.Now().UTC()
	accessExpiresAt := issuedAt.Add(s.accessTTL)
	refreshExpiresAt := issuedAt.Add(s.refreshTTL)

	accessToken, err := s.signToken(tokenClaims{
		TokenType:  tokenTypeAccess,
		Email:      user.Email,
		Username:   user.Username,
		FirstName:  user.FirstName,
		SecondName: user.SecondName,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   user.ID,
			IssuedAt:  jwt.NewNumericDate(issuedAt),
			NotBefore: jwt.NewNumericDate(issuedAt),
			ExpiresAt: jwt.NewNumericDate(accessExpiresAt),
			Issuer:    "sharedspace",
		},
	})
	if err != nil {
		return TokenPair{}, err
	}

	refreshJTI, err := newTokenID()
	if err != nil {
		return TokenPair{}, err
	}

	refreshToken, err := s.signToken(tokenClaims{
		TokenType:  tokenTypeRefresh,
		Email:      user.Email,
		Username:   user.Username,
		FirstName:  user.FirstName,
		SecondName: user.SecondName,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   user.ID,
			ID:        refreshJTI,
			IssuedAt:  jwt.NewNumericDate(issuedAt),
			NotBefore: jwt.NewNumericDate(issuedAt),
			ExpiresAt: jwt.NewNumericDate(refreshExpiresAt),
			Issuer:    "sharedspace",
		},
	})
	if err != nil {
		return TokenPair{}, err
	}

	return TokenPair{
		AccessToken:      accessToken,
		RefreshToken:     refreshToken,
		TokenType:        "Bearer",
		AccessExpiresIn:  int64(s.accessTTL.Seconds()),
		RefreshExpiresIn: int64(s.refreshTTL.Seconds()),
	}, nil
}

func (s *Service) signToken(claims tokenClaims) (string, error) {
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(s.jwtSecret)
}

func (s *Service) ParseAccessToken(raw string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(raw, &tokenClaims{}, func(token *jwt.Token) (any, error) {
		if token.Method.Alg() != jwt.SigningMethodHS256.Alg() {
			return nil, fmt.Errorf("unexpected signing method: %s", token.Method.Alg())
		}
		return s.jwtSecret, nil
	}, jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}))
	if err != nil {
		return nil, err
	}

	tc, ok := token.Claims.(*tokenClaims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid access token")
	}
	if tc.TokenType != tokenTypeAccess {
		return nil, errors.New("wrong token type")
	}
	return &Claims{
		UserID:     tc.Subject,
		Email:      tc.Email,
		Username:   tc.Username,
		FirstName:  tc.FirstName,
		SecondName: tc.SecondName,
	}, nil
}

func (s *Service) parseRefreshToken(raw string) (*tokenClaims, error) {
	token, err := jwt.ParseWithClaims(raw, &tokenClaims{}, func(token *jwt.Token) (any, error) {
		if token.Method.Alg() != jwt.SigningMethodHS256.Alg() {
			return nil, fmt.Errorf("unexpected signing method: %s", token.Method.Alg())
		}
		return s.jwtSecret, nil
	}, jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}))
	if err != nil {
		return nil, err
	}

	claims, ok := token.Claims.(*tokenClaims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid refresh token")
	}
	if claims.TokenType != tokenTypeRefresh {
		return nil, errors.New("wrong token type")
	}
	return claims, nil
}

func (s *Service) parseAccessToken(raw string) (*tokenClaims, error) {
	token, err := jwt.ParseWithClaims(raw, &tokenClaims{}, func(token *jwt.Token) (any, error) {
		if token.Method.Alg() != jwt.SigningMethodHS256.Alg() {
			return nil, fmt.Errorf("unexpected signing method: %s", token.Method.Alg())
		}
		return s.jwtSecret, nil
	}, jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}))
	if err != nil {
		return nil, err
	}

	claims, ok := token.Claims.(*tokenClaims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid access token")
	}
	if claims.TokenType != tokenTypeAccess {
		return nil, errors.New("wrong token type")
	}
	return claims, nil
}

func hashToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

func newTokenID() (string, error) {
	var buf [32]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf[:]), nil
}
