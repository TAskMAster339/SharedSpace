package auth

import "time"

type RegisterRequest struct {
	Email      string `json:"email"`
	Username   string `json:"username"`
	FirstName  string `json:"first_name"`
	SecondName string `json:"second_name"`
	Password   string `json:"password"`
}

type LoginRequest struct {
	Identifier string `json:"identifier"`
	Email      string `json:"email"`
	Username   string `json:"username"`
	Password   string `json:"password"`
}

type RefreshRequest struct {
	RefreshToken string `json:"refresh_token"`
}

type UpdateProfileRequest struct {
	Email      *string `json:"email"`
	Username   *string `json:"username"`
	FirstName  *string `json:"first_name"`
	SecondName *string `json:"second_name"`
}

type ChangePasswordRequest struct {
	OldPassword         string `json:"old_password"`
	NewPassword         string `json:"new_password"`
	CurrentRefreshToken string `json:"current_refresh_token"`
}

type SearchUsersResponse struct {
	Users []UserResponse `json:"users"`
}

type UserResponse struct {
	ID         string    `json:"id"`
	Email      string    `json:"email"`
	Username   string    `json:"username"`
	FirstName  string    `json:"first_name,omitempty"`
	SecondName string    `json:"second_name,omitempty"`
	CreatedAt  time.Time `json:"created_at"`
}

type RegisterResponse struct {
	User            UserResponse `json:"user"`
	RootDirectoryID string       `json:"root_directory_id"`
}

type TokenPair struct {
	AccessToken      string `json:"access_token"`
	RefreshToken     string `json:"refresh_token"`
	TokenType        string `json:"token_type"`
	AccessExpiresIn  int64  `json:"access_expires_in"`
	RefreshExpiresIn int64  `json:"refresh_expires_in"`
}

type LoginResponse struct {
	User   UserResponse `json:"user"`
	Tokens TokenPair    `json:"tokens"`
}

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
