package files

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"sharedspace/internal/access"
	"sharedspace/internal/apperror"
	"sharedspace/internal/jobqueue"
)

const (
	mediaPreview    = "media.preview"
	mediaConvert    = "media.convert"
	previewWait     = 45 * time.Second
	conversionWait  = 240 * time.Second
	mediaRetryAfter = 2
)

type mediaLimits struct {
	preview, conversions, perUser int
}

type mediaPayload struct {
	FileID, ObjectKey, Target string
	Save                      bool
}

type mediaResult struct {
	ObjectKey     string
	DownloadUntil time.Time
	Conversion    *ConversionResponse
}

type MediaJobResponse struct {
	JobID      string                      `json:"job_id,omitempty"`
	State      string                      `json:"state"`
	RetryAfter int                         `json:"retry_after,omitempty"`
	Preview    *FileContentResponse        `json:"preview,omitempty"`
	Download   *ConversionDownloadResponse `json:"download,omitempty"`
	Conversion *ConversionResponse         `json:"conversion,omitempty"`
	Failure    *jobqueue.Failure           `json:"failure,omitempty"`
}

func (s *Service) ConfigureMediaQueue(queue *jobqueue.Queue) error {
	preview, err := jobqueue.PositiveEnv("MEDIA_PREVIEW_QUEUE_LIMIT", 150)
	if err != nil {
		return err
	}
	conversions, err := jobqueue.PositiveEnv("MEDIA_CONVERSION_QUEUE_LIMIT", 50)
	if err != nil {
		return err
	}
	perUser, err := jobqueue.PositiveEnv("MEDIA_CONVERSION_USER_LIMIT", 4)
	if err != nil {
		return err
	}
	s.mediaQueue = queue
	s.mediaLimits = mediaLimits{preview, conversions, perUser}
	return nil
}

func (s *Service) getMediaFile(ctx context.Context, db dbTX, userID, kind string, payload mediaPayload, checker access.AccessChecker) (fileRecord, error) {
	file, err := s.repo.FindByIDAnyState(ctx, db, payload.FileID)
	if errors.Is(err, pgx.ErrNoRows) {
		return file, apperror.NotFound("файл не найден")
	}
	if err != nil {
		return file, err
	}
	if payload.ObjectKey != "" && payload.ObjectKey != file.ObjectKey {
		return file, apperror.Conflict("исходный файл изменился")
	}
	if kind == mediaPreview {
		if !strings.HasPrefix(file.MimeType, "image/") && !strings.HasPrefix(file.MimeType, "video/") {
			return file, apperror.NotFound("превью недоступно")
		}
		return file, checkPreviewAccess(ctx, checker, userID, file)
	}
	if file.DeletedAt != nil {
		return file, apperror.NotFound("файл не найден")
	}
	if err := requireMediaAccess(ctx, checker, userID, file.DirectoryID, access.ActionDownload); err != nil {
		return file, err
	}
	if payload.Save {
		return file, requireMediaAccess(ctx, checker, userID, file.DirectoryID, access.ActionUpload)
	}
	return file, nil
}

func requireMediaAccess(ctx context.Context, checker access.AccessChecker, userID, dir string, action access.Action) error {
	ok, err := checker.Can(ctx, userID, dir, action)
	if err != nil {
		return err
	}
	if !ok {
		return apperror.Forbidden("доступ запрещён")
	}
	return nil
}

func (s *Service) RequestPreview(ctx context.Context, userID, fileID string, async bool) (MediaJobResponse, error) {
	file, err := s.getMediaFile(ctx, s.db, userID, mediaPreview, mediaPayload{FileID: fileID}, s.accessChecker)
	if err != nil {
		return MediaJobResponse{}, err
	}
	var key string
	err = s.db.QueryRow(ctx, `SELECT p.object_key FROM file_previews p JOIN files f ON f.id=p.file_id
	  WHERE f.id=$1 AND f.object_key=$2 AND f.directory_id=$3 AND f.deleted_at IS NOT DISTINCT FROM $4
       AND (p.source_object_key IS NULL OR p.source_object_key=f.object_key)`,
		fileID, file.ObjectKey, file.DirectoryID, file.DeletedAt).Scan(&key)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return MediaJobResponse{}, err
	}
	if key != "" {
		url, err := s.storage.PresignedGetURL(ctx, key, time.Hour)
		return MediaJobResponse{State: "succeeded", Preview: &FileContentResponse{URL: url}}, err
	}
	payload := mediaPayload{FileID: fileID, ObjectKey: file.ObjectKey}
	return s.submitMedia(ctx, userID, mediaPreview, payload, "", fileID+":"+file.ObjectKey,
		jobqueue.Limits{Kind: s.mediaLimits.preview}, async, previewWait)
}

func (s *Service) RequestConversion(ctx context.Context, userID, fileID string, req ConvertRequest, async bool, key string) (MediaJobResponse, error) {
	target := strings.ToLower(strings.TrimSpace(req.TargetFormat))
	if target == "jpeg" {
		target = "jpg"
	}
	if _, ok := mimeMap[target]; !ok {
		return MediaJobResponse{}, apperror.Validation("неподдерживаемая пара форматов")
	}
	payload := mediaPayload{FileID: fileID, Target: target, Save: req.Save}
	file, err := s.getMediaFile(ctx, s.db, userID, mediaConvert, payload, s.accessChecker)
	if err != nil {
		return MediaJobResponse{}, err
	}
	if file.Size > maxFileSize {
		return MediaJobResponse{}, uploadTooLarge("Файл превышает 512 МиБ")
	}
	payload.ObjectKey = file.ObjectKey
	if key != "" {
		if _, err := uuid.Parse(key); err != nil {
			return MediaJobResponse{}, apperror.Validation("Некорректный Idempotency-Key")
		}
	}
	return s.submitMedia(ctx, userID, mediaConvert, payload, key, "",
		jobqueue.Limits{Kind: s.mediaLimits.conversions, Owner: s.mediaLimits.perUser}, async, conversionWait)
}

func (s *Service) submitMedia(ctx context.Context, userID, kind string, payload mediaPayload, key, active string, limits jobqueue.Limits, async bool, timeout time.Duration) (MediaJobResponse, error) {
	if s.mediaQueue == nil {
		return MediaJobResponse{}, apperror.Internal("Очередь недоступна")
	}
	submitCtx, done := context.WithTimeout(ctx, 5*time.Second)
	j, err := s.mediaQueue.Enqueue(submitCtx, userID, kind, payload, key, active, limits)
	done()
	if errors.Is(err, jobqueue.ErrFull) {
		return MediaJobResponse{}, apperror.New("Очередь обработки заполнена", "media_capacity", http.StatusTooManyRequests)
	}
	if err != nil {
		return MediaJobResponse{}, err
	}
	var existing mediaPayload
	if err := json.Unmarshal(j.Payload, &existing); err != nil {
		return MediaJobResponse{}, err
	}
	if j.Kind != kind || existing != payload {
		return MediaJobResponse{}, apperror.Conflict("Ключ уже использован для другого запроса")
	}
	if async {
		return MediaJobResponse{JobID: j.ID, State: j.State, RetryAfter: mediaRetryAfter}, nil
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for {
		if j.State == "succeeded" || j.State == "failed" {
			resp, err := s.mediaResponse(ctx, j, payload)
			if err == nil && resp.Failure != nil {
				err = apperror.New(resp.Failure.Message, resp.Failure.Code, resp.Failure.Status)
			}
			return resp, err
		}
		select {
		case <-ctx.Done():
			return MediaJobResponse{}, apperror.New("Обработка продолжается в очереди", "media_pending", http.StatusGatewayTimeout)
		case <-ticker.C:
			j, err = s.mediaQueue.Get(ctx, userID, j.ID)
			if err != nil {
				return MediaJobResponse{}, err
			}
		}
	}
}

func (s *Service) MediaJob(ctx context.Context, userID, id string) (MediaJobResponse, error) {
	if _, err := uuid.Parse(id); err != nil {
		return MediaJobResponse{}, apperror.NotFound("задача не найдена")
	}
	if s.mediaQueue == nil {
		return MediaJobResponse{}, apperror.Internal("Очередь недоступна")
	}
	j, err := s.mediaQueue.Get(ctx, userID, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return MediaJobResponse{}, apperror.NotFound("задача не найдена")
	}
	if err != nil {
		return MediaJobResponse{}, err
	}
	var payload mediaPayload
	if err := json.Unmarshal(j.Payload, &payload); err != nil {
		return MediaJobResponse{}, err
	}
	return s.mediaResponse(ctx, j, payload)
}

func (s *Service) mediaResponse(ctx context.Context, j jobqueue.Job, payload mediaPayload) (MediaJobResponse, error) {
	file, err := s.getMediaFile(ctx, s.db, j.Owner, j.Kind, payload, s.accessChecker)
	if err != nil {
		return MediaJobResponse{}, err
	}
	resp := MediaJobResponse{JobID: j.ID, State: j.State}
	switch j.State {
	case "failed":
		resp.Failure = j.Failure
		return resp, nil
	case "succeeded":
		var result mediaResult
		if err := json.Unmarshal(j.Result, &result); err != nil {
			return resp, err
		}
		if j.Kind == mediaPreview {
			url, err := s.storage.PresignedGetURL(ctx, result.ObjectKey, time.Hour)
			resp.Preview = &FileContentResponse{URL: url}
			return resp, err
		}
		if result.Conversion != nil {
			resp.Conversion = result.Conversion
			return resp, nil
		}
		ttl := min(time.Until(result.DownloadUntil).Truncate(time.Second), 15*time.Minute)
		if ttl < time.Second {
			return resp, apperror.New("Время скачивания истекло", "media_expired", http.StatusGone)
		}
		filename := replaceExt(file.Filename, payload.Target)
		url, err := s.tmpStorage.PresignedDownloadURL(ctx, result.ObjectKey, ttl, filename)
		resp.Download = &ConversionDownloadResponse{DownloadURL: url, Filename: filename}
		return resp, err
	default:
		resp.RetryAfter = mediaRetryAfter
		return resp, nil
	}
}
