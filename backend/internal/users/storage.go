package users

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
	"sharedspace/internal/apperror"
)

type StorageFolder struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	SizeBytes int64  `json:"size_bytes"`
}

type StorageUsageResponse struct {
	UsedBytes       int64           `json:"used_bytes"`
	QuotaBytes      int64           `json:"quota_bytes"`
	TrashBytes      int64           `json:"trash_bytes"`
	RootFilesBytes  int64           `json:"root_files_bytes"`
	OtherFilesBytes int64           `json:"other_files_bytes"`
	RootID          *string         `json:"root_id"`
	FolderCount     int             `json:"folder_count"`
	Folders         []StorageFolder `json:"folders"`
}

// This on-demand quota breakdown counts only files owned by the caller. Folder
// listings use cached logical subtree sizes, which can also include other users'
// uploads. One aggregate query avoids per-folder requests and double counting.
func (r *Repository) FindStorageUsage(ctx context.Context, db dbTX, userID, sort string) (StorageUsageResponse, error) {
	var result StorageUsageResponse
	var foldersJSON []byte
	err := db.QueryRow(ctx, `
 WITH RECURSIVE personal_root AS (
   SELECT id FROM directories WHERE owner_id=$1 AND type='root' AND deleted_at IS NULL ORDER BY id LIMIT 1
 ), folder_tree AS (
   SELECT d.id,d.id AS folder_id FROM directories d JOIN personal_root r ON d.parent_id=r.id WHERE d.deleted_at IS NULL
   UNION
   SELECT d.id,t.folder_id FROM directories d JOIN folder_tree t ON d.parent_id=t.id WHERE d.deleted_at IS NULL
 ), own_files AS MATERIALIZED (
   SELECT directory_id,size,deleted_at FROM files WHERE owner_id=$1
 ), allocated AS (
   SELECT t.folder_id,SUM(f.size)::bigint AS bytes
   FROM own_files f JOIN folder_tree t ON t.id=f.directory_id
   WHERE f.deleted_at IS NULL GROUP BY t.folder_id
 ), folders AS (
   SELECT d.id,d.name,COALESCE(a.bytes,0) AS size_bytes
   FROM directories d JOIN personal_root r ON d.parent_id=r.id
   LEFT JOIN allocated a ON a.folder_id=d.id WHERE d.deleted_at IS NULL
 ), visible_folders AS (
   SELECT * FROM folders
   ORDER BY CASE WHEN $2='size' THEN size_bytes END DESC,
            CASE WHEN $2='name' THEN name END ASC,name,id LIMIT 100
 )
 SELECT u.storage_used,u.storage_quota,r.id,
   COALESCE((SELECT SUM(size) FROM own_files WHERE deleted_at IS NOT NULL),0),
   COALESCE((SELECT SUM(size) FROM own_files WHERE deleted_at IS NULL AND directory_id=r.id),0),
   COALESCE((SELECT SUM(f.size) FROM own_files f WHERE f.deleted_at IS NULL
     AND f.directory_id IS DISTINCT FROM r.id AND NOT EXISTS(SELECT 1 FROM folder_tree t WHERE t.id=f.directory_id)),0),
   (SELECT COUNT(*) FROM folders),
   COALESCE((SELECT jsonb_agg(v ORDER BY CASE WHEN $2='size' THEN size_bytes END DESC,
     CASE WHEN $2='name' THEN name END ASC,name,id) FROM visible_folders v),'[]'::jsonb)
 FROM users u LEFT JOIN personal_root r ON true WHERE u.id=$1
 `, userID, sort).Scan(&result.UsedBytes, &result.QuotaBytes, &result.RootID, &result.TrashBytes,
		&result.RootFilesBytes, &result.OtherFilesBytes, &result.FolderCount, &foldersJSON)
	if err != nil {
		return StorageUsageResponse{}, err
	}
	if err := json.Unmarshal(foldersJSON, &result.Folders); err != nil {
		return StorageUsageResponse{}, err
	}
	return result, nil
}

func (s *Service) GetStorageUsage(ctx context.Context, userID, sort string) (StorageUsageResponse, error) {
	if sort != "size" && sort != "name" {
		return StorageUsageResponse{}, apperror.Validation("неверный порядок сортировки")
	}
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	result, err := s.repo.FindStorageUsage(ctx, s.db, userID, sort)
	if errors.Is(err, pgx.ErrNoRows) {
		return StorageUsageResponse{}, apperror.NotFound("пользователь не найден")
	}
	if err != nil {
		return StorageUsageResponse{}, apperror.WrapInternal("получение использования хранилища", err)
	}
	return result, nil
}

// GetStorageUsage returns the caller's quota breakdown, including trash.
// @Summary Get storage usage including trash
// @Tags users
// @Security BearerAuth
// @Produce json
// @Param sort query string false "Sort folders: size or name" default(size)
// @Success 200 {object} StorageUsageResponse
// @Failure 401 {object} apperror.Response
// @Router /api/v1/users/me/storage [get]
func (h *Handler) GetStorageUsage(w http.ResponseWriter, r *http.Request) error {
	userID, err := h.userIDFromRequest(r)
	if err != nil {
		return err
	}
	sort := r.URL.Query().Get("sort")
	if sort == "" {
		sort = "size"
	}
	result, err := h.service.GetStorageUsage(r.Context(), userID, sort)
	if err != nil {
		return err
	}
	w.Header().Set("Cache-Control", "no-store")
	return writeJSON(w, http.StatusOK, result)
}
