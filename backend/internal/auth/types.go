package auth

import "time"

// RegisterRequest describes the payload used to create a new account.
type RegisterRequest struct {
	Email      string `json:"email"`
	Username   string `json:"username"`
	FirstName  string `json:"first_name"`
	SecondName string `json:"second_name"`
	Password   string `json:"password"`
}

// LoginRequest describes the payload used to authenticate a user.
type LoginRequest struct {
	Identifier string `json:"identifier"`
	Email      string `json:"email"`
	Username   string `json:"username"`
	Password   string `json:"password"`
}

// RefreshRequest describes the refresh token exchange payload.
type RefreshRequest struct {
	RefreshToken string `json:"refresh_token"`
}

// ErrorResponse mirrors the standard API error payload.
type ErrorResponse struct {
	Error string `json:"error"`
	Code  string `json:"code"`
}

// UserResponse contains the public user profile returned by auth endpoints.
type UserResponse struct {
	ID         string    `json:"id"`
	Email      string    `json:"email"`
	Username   string    `json:"username"`
	FirstName  string    `json:"first_name,omitempty"`
	SecondName string    `json:"second_name,omitempty"`
	CreatedAt  time.Time `json:"created_at"`
}

// RegisterResponse contains the created user and their root directory ID.
type RegisterResponse struct {
	User            UserResponse `json:"user"`
	RootDirectoryID string       `json:"root_directory_id"`
}

// TokenPair contains the issued access and refresh tokens.
type TokenPair struct {
	AccessToken      string `json:"access_token"`
	RefreshToken     string `json:"refresh_token"`
	TokenType        string `json:"token_type"`
	AccessExpiresIn  int64  `json:"access_expires_in"`
	RefreshExpiresIn int64  `json:"refresh_expires_in"`
}

// LoginResponse contains the authenticated user and token pair.
type LoginResponse struct {
	User   UserResponse `json:"user"`
	Tokens TokenPair    `json:"tokens"`
}

// RefreshResponse contains a renewed token pair.
type RefreshResponse struct {
	Tokens TokenPair `json:"tokens"`
}

type authUser struct {
	ID           string
	Username     string
	FirstName    string
	SecondName   string
	Email        string
	PasswordHash string
	CreatedAt    time.Time
}

type loginMeta struct {
	UserAgent string
	IPAddress string
}

// MeResponse contains the profile of the currently authorized user.
type MeResponse struct {
	User UserResponse `json:"user"`
}
