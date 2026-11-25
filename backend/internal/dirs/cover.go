package dirs

import (
	"bytes"
	"context"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"os"
	"os/exec"
	"time"

	"github.com/google/uuid"

	"sharedspace/internal/access"
	"sharedspace/internal/apperror"
)

const maxCoverBytes = 10 << 20

func (s *Service) SetCover(ctx context.Context, userID, dirID string, body io.Reader) error {
	if err := s.canEditCover(ctx, userID, dirID); err != nil {
		return err
	}
	data, err := io.ReadAll(io.LimitReader(body, maxCoverBytes+1))
	if err != nil || len(data) > maxCoverBytes {
		return apperror.Validation("размер фото должен быть не больше 10 МиБ")
	}
	config, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || config.Width < 1 || config.Height < 1 || config.Width > 8192 ||
		config.Height > 8192 || int64(config.Width)*int64(config.Height) > 32_000_000 {
		return apperror.Validation("загрузите фото JPEG, PNG или GIF размером до 32 мегапикселей")
	}

	preview, err := renderCover(ctx, data)
	if err != nil {
		return err
	}
	prefix := "previews/v1/playlist-" + uuid.NewString()
	originalKey := prefix + "-original"
	previewKey := prefix + ".jpg"
	if err := s.storage.Upload(ctx, originalKey, bytes.NewReader(data), int64(len(data)), "image/"+format); err != nil {
		return apperror.WrapInternal("сохранение фото", err)
	}
	if err := s.storage.Upload(ctx, previewKey, bytes.NewReader(preview), int64(len(preview)), "image/jpeg"); err != nil {
		return apperror.WrapInternal("сохранение превью", err)
	}
	tag, err := s.db.Exec(ctx, `
		INSERT INTO directory_covers (directory_id, original_key, preview_key)
		SELECT id, $2, $3 FROM directories WHERE id = $1 AND deleted_at IS NULL AND purpose = 'audio'
		ON CONFLICT (directory_id) DO UPDATE SET original_key = EXCLUDED.original_key, preview_key = EXCLUDED.preview_key
	`, dirID, originalKey, previewKey)
	if err != nil {
		return apperror.WrapInternal("сохранение обложки плейлиста", err)
	}
	if tag.RowsAffected() == 0 {
		return apperror.NotFound("плейлист не найден")
	}
	return nil
}

func (s *Service) RemoveCover(ctx context.Context, userID, dirID string) error {
	if err := s.canEditCover(ctx, userID, dirID); err != nil {
		return err
	}
	_, err := s.db.Exec(ctx, `DELETE FROM directory_covers WHERE directory_id = $1`, dirID)
	if err != nil {
		return apperror.WrapInternal("удаление обложки плейлиста", err)
	}
	return nil
}

func (s *Service) canEditCover(ctx context.Context, userID, dirID string) error {
	dir, err := s.GetByID(ctx, userID, dirID)
	if err != nil {
		return err
	}
	if dir.Purpose != "audio" {
		return apperror.Validation("обложки доступны для плейлистов")
	}
	ok, err := s.accessChecker.Can(ctx, userID, dirID, access.ActionEditContent)
	if err != nil {
		return err
	}
	if !ok {
		return apperror.Forbidden("доступ запрещён")
	}
	return nil
}

func (s *Service) directoryCoverURL(ctx context.Context, dir directoryRecord) string {
	if dir.Purpose != "audio" {
		return ""
	}
	var key string
	if err := s.db.QueryRow(ctx, `SELECT preview_key FROM directory_covers WHERE directory_id = $1`, dir.ID).Scan(&key); err != nil {
		return ""
	}
	url, _ := s.storage.PresignedGetURL(ctx, key, time.Hour)
	return url
}

func renderCover(ctx context.Context, data []byte) ([]byte, error) {
	input, err := os.CreateTemp("", "sharedspace-playlist-cover-*")
	if err != nil {
		return nil, apperror.WrapInternal("подготовка фото", err)
	}
	defer os.Remove(input.Name())
	_, writeErr := input.Write(data)
	closeErr := input.Close()
	if writeErr != nil {
		return nil, apperror.WrapInternal("запись фото", writeErr)
	}
	if closeErr != nil {
		return nil, apperror.WrapInternal("закрытие фото", closeErr)
	}
	renderCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	cmd := exec.CommandContext(renderCtx, "ffmpeg", "-nostdin", "-v", "error",
		"-protocol_whitelist", "file", "-format_whitelist", "jpeg_pipe,png_pipe,gif",
		"-filter_threads", "1", "-threads", "1", "-max_alloc", "134217728", "-i", input.Name(),
		"-map", "0:v:0", "-frames:v", "1",
		"-vf", "scale=256:256:force_original_aspect_ratio=increase,crop=256:256,setsar=1",
		"-threads", "1", "-c:v", "mjpeg", "-q:v", "5", "-f", "image2pipe", "pipe:1")
	preview, err := cmd.Output()
	if err != nil || len(preview) == 0 || len(preview) > 128<<10 {
		return nil, apperror.Validation("не удалось создать превью из фото")
	}
	return preview, nil
}

func (s *Service) trackCoverURL(ctx context.Context, dir directoryRecord, file fileRecord) string {
	if dir.Purpose != "audio" || file.CoverKey == "" {
		return ""
	}
	url, _ := s.storage.PresignedGetURL(ctx, file.CoverKey, time.Hour)
	return url
}
