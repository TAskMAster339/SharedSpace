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
	ID              string    `json:"id"`
	Email           string    `json:"email"`
	Username        string    `json:"username"`
	FirstName       string    `json:"first_name,omitempty"`
	SecondName      string    `json:"second_name,omitempty"`
	StorageQuota    int64     `json:"storage_quota"`
	StorageUsed     int64     `json:"storage_used"`
	SharedDirsCount int       `json:"shared_dirs_count"`
	SharedDirsQuota int       `json:"shared_dirs_quota"`
	ShareLinksCount int       `json:"share_links_count"`
	ShareLinksQuota int       `json:"share_links_quota"`
	CreatedAt       time.Time `json:"created_at"`
}

type SearchUsersResponse struct {
	Users []UserResponse `json:"users"`
}

type DeleteAccountRequest struct {
	CurrentRefreshToken string `json:"current_refresh_token"`
}
