package files

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"sharedspace/internal/access"
	"sharedspace/internal/apperror"
)

const previewPrefix = "previews/v1/"

// Bound concurrent decoders and temporary source files, including across requests.
var previewSlots = make(chan struct{}, 2)

func (s *Service) GetPreviewURL(ctx context.Context, userID, fileID string) (FileContentResponse, error) {
	file, err := s.repo.FindByIDAnyState(ctx, s.db, fileID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return FileContentResponse{}, apperror.NotFound("файл не найден")
		}
		return FileContentResponse{}, apperror.WrapInternal("поиск файла", err)
	}
	if err := s.checkPreviewAccess(ctx, userID, file); err != nil {
		return FileContentResponse{}, err
	}
	if !strings.HasPrefix(file.MimeType, "image/") && !strings.HasPrefix(file.MimeType, "video/") {
		return FileContentResponse{}, apperror.NotFound("превью недоступно")
	}

	ctx, cancel := context.WithTimeout(ctx, 45*time.Second)
	defer cancel()
	select {
	case previewSlots <- struct{}{}:
		defer func() { <-previewSlots }()
	case <-ctx.Done():
		return FileContentResponse{}, ctx.Err()
	}
	tx, err := s.beginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return FileContentResponse{}, apperror.WrapInternal("начало транзакции превью", err)
	}
	defer tx.Rollback(context.Background())
	// Serialize generation for this file and prevent deletion while saving its preview.
	lockedFile := file
	err = tx.QueryRow(ctx, `SELECT directory_id, owner_id, deleted_at FROM files WHERE id=$1 FOR UPDATE`, fileID).Scan(&lockedFile.DirectoryID, &lockedFile.OwnerID, &lockedFile.DeletedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return FileContentResponse{}, apperror.NotFound("файл не найден")
	}
	if err != nil {
		return FileContentResponse{}, apperror.WrapInternal("блокировка файла", err)
	}
	if err := s.checkPreviewAccess(ctx, userID, lockedFile); err != nil {
		return FileContentResponse{}, err
	}
	var key string
	err = tx.QueryRow(ctx, `SELECT object_key FROM file_previews WHERE file_id=$1`, fileID).Scan(&key)
	if errors.Is(err, pgx.ErrNoRows) {
		source, err := s.storage.Get(ctx, file.ObjectKey)
		if err != nil {
			return FileContentResponse{}, apperror.WrapInternal("чтение файла для превью", err)
		}
		data, renderErr := renderPreview(ctx, source)
		source.Close()
		if renderErr != nil {
			return FileContentResponse{}, apperror.WrapInternal("генерация превью", renderErr)
		}
		key = previewPrefix + uuid.NewString() + ".jpg"
		if err := s.storage.Upload(ctx, key, bytes.NewReader(data), int64(len(data)), "image/jpeg"); err != nil {
			return FileContentResponse{}, apperror.WrapInternal("загрузка превью", err)
		}
		_, err = tx.Exec(ctx, `INSERT INTO file_previews (file_id, object_key, size) VALUES ($1,$2,$3)`, fileID, key, len(data))
		if err != nil {
			s.cleanupObjects([]string{key})
			return FileContentResponse{}, apperror.WrapInternal("сохранение превью", err)
		}
	} else if err != nil {
		return FileContentResponse{}, apperror.WrapInternal("поиск превью", err)
	}
	// On ambiguous commit failure the orphan worker handles storage cleanup safely.
	if err := tx.Commit(ctx); err != nil {
		return FileContentResponse{}, apperror.WrapInternal("сохранение превью", err)
	}
	url, err := s.storage.PresignedGetURL(ctx, key, time.Hour)
	if err != nil {
		return FileContentResponse{}, apperror.WrapInternal("ссылка на превью", err)
	}
	return FileContentResponse{URL: url}, nil
}

// Trash lists files by owner. Deleted media stays private to that owner,
// including when the parent directory has also been moved to trash.
func (s *Service) checkPreviewAccess(ctx context.Context, userID string, file fileRecord) error {
	if file.DeletedAt != nil {
		if file.OwnerID != userID {
			return apperror.Forbidden("доступ запрещён")
		}
		return nil
	}
	ok, err := s.accessChecker.Can(ctx, userID, file.DirectoryID, access.ActionView)
	if err != nil {
		return err
	}
	if !ok {
		return apperror.Forbidden("доступ запрещён")
	}
	return nil
}

func renderPreview(ctx context.Context, source io.Reader) ([]byte, error) {
	input, err := os.CreateTemp("", "preview-source-*")
	if err != nil {
		return nil, err
	}
	defer os.Remove(input.Name())
	defer input.Close()
	// Stream to disk instead of retaining a full media file in memory.
	n, err := io.Copy(input, io.LimitReader(source, maxFileSize+1))
	if err != nil {
		return nil, err
	}
	if n > maxFileSize {
		return nil, fmt.Errorf("preview source exceeds size limit")
	}
	if err := input.Close(); err != nil {
		return nil, err
	}
	// FFmpeg auto-rotates images/video and takes only the first frame. Never upscale.
	cmd := exec.CommandContext(ctx, "ffmpeg", "-nostdin", "-v", "error", "-threads", "1", "-max_alloc", "67108864",
		"-protocol_whitelist", "file,pipe", "-i", input.Name(), "-map", "0:v:0", "-frames:v", "1",
		"-vf", "scale=w='min(256,iw)':h='min(256,ih)':force_original_aspect_ratio=decrease",
		"-threads", "1", "-c:v", "mjpeg", "-q:v", "6", "-f", "image2pipe", "pipe:1")
	data, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("ffmpeg preview: %w", err)
	}
	if len(data) == 0 || len(data) > 128*1024 {
		return nil, fmt.Errorf("invalid preview size: %d", len(data))
	}
	return data, nil
}

// Cascading DB deletes cover files, recursive directory deletion and accounts.
// A grace period avoids racing in-flight generations. Failed deletes are retried.
func (s *Service) CleanupPreviews(ctx context.Context) {
	keys, err := s.storage.ListObjects(ctx, previewPrefix, time.Now().Add(-time.Hour))
	if err != nil {
		log.Printf("preview cleanup: list: %v", err)
		return
	}
	for _, key := range keys {
		var exists bool
		err := s.db.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM file_previews WHERE object_key=$1)`, key).Scan(&exists)
		if err != nil {
			log.Printf("preview cleanup: lookup: %v", err)
			return
		}
		if !exists {
			if err := s.storage.Delete(ctx, key); err != nil {
				log.Printf("preview cleanup: delete %s: %v", key, err)
			}
		}
	}
}
