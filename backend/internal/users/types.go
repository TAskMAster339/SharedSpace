package users

import "time"

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

type UserResponse struct {
	ID         string    `json:"id"`
	Email      string    `json:"email"`
	Username   string    `json:"username"`
	FirstName  string    `json:"first_name,omitempty"`
	SecondName string    `json:"second_name,omitempty"`
	CreatedAt  time.Time `json:"created_at"`
}

type SearchUsersResponse struct {
	Users []UserResponse `json:"users"`
}
