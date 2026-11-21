package files

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"os"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"sharedspace/internal/access"
	"sharedspace/internal/apperror"
	"sharedspace/internal/database"
	"sharedspace/internal/jobqueue"
)

const savedMediaPrefix = "media-conversions/v1/"

func invalidMedia(message string) error {
	return apperror.Validation(message)
}

func (s *Service) MediaHandlers(pool *pgxpool.Pool, dir string) map[string]jobqueue.Handler {
	handlers := make(map[string]jobqueue.Handler, 2)
	for kind, seconds := range map[string]int{mediaPreview: 45, mediaConvert: 120} {
		handlers[kind] = jobqueue.Handler{
			Timeout: time.Duration(seconds) * time.Second,
			Run: func(ctx context.Context, j jobqueue.Job) error {
				err := s.processMedia(ctx, pool, dir, j)
				if e, ok := apperror.From(err); ok && e.Status() < 500 {
					return &jobqueue.Failure{Message: e.Error(), Code: e.Code(), Status: e.Status()}
				}
				return err
			},
		}
	}
	return handlers
}

func (s *Service) processMedia(ctx context.Context, pool *pgxpool.Pool, dir string, j jobqueue.Job) error {
	var payload mediaPayload
	if err := json.Unmarshal(j.Payload, &payload); err != nil {
		return err
	}
	file, err := s.getMediaFile(ctx, s.db, j.Owner, j.Kind, payload, s.accessChecker)
	if err != nil {
		return err
	}
	if file.Size > maxFileSize {
		return uploadTooLarge("Файл превышает 512 МиБ")
	}

	result := mediaResult{}
	var size int64
	var sourceFormat string
	if j.Kind == mediaPreview {
		err = s.db.QueryRow(ctx, `SELECT object_key FROM file_previews WHERE file_id=$1 AND (source_object_key IS NULL OR source_object_key=$2)`, file.ID, file.ObjectKey).Scan(&result.ObjectKey)
		if err == nil {
			return s.publishMedia(ctx, pool, j, payload, result, 0, "")
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
	}
	reader, err := s.storage.Get(ctx, file.ObjectKey)
	if err != nil {
		return err
	}
	input, err := stageMedia(dir, reader)
	reader.Close()
	if err != nil {
		return err
	}
	defer os.Remove(input)

	if j.Kind == mediaPreview {
		data, err := renderPreviewFile(ctx, input)
		if err != nil {
			return err
		}
		result.ObjectKey = previewPrefix + j.Token + ".jpg"
		size = int64(len(data))
		if err := s.storage.Upload(ctx, result.ObjectKey, bytes.NewReader(data), size, "image/jpeg"); err != nil {
			return err
		}
	} else {
		output, format, n, err := renderConversion(ctx, dir, input, payload.Target, file.Extension)
		if err != nil {
			return err
		}
		defer os.Remove(output)
		data, err := os.Open(output)
		if err != nil {
			return err
		}
		defer data.Close()
		size, sourceFormat = n, format
		bucket, prefix := s.tmpStorage, tmpPrefix
		if payload.Save {
			bucket, prefix = s.storage, savedMediaPrefix
		}
		result.ObjectKey = prefix + j.Token + "." + payload.Target
		uploadedAt := time.Now()
		if err := bucket.Upload(ctx, result.ObjectKey, data, n, mimeMap[payload.Target]); err != nil {
			return err
		}
		if !payload.Save {
			result.DownloadUntil = uploadedAt.Add(tmpMaxAge)
		}
	}
	return s.publishMedia(ctx, pool, j, payload, result, size, sourceFormat)
}

func (s *Service) publishMedia(ctx context.Context, pool *pgxpool.Pool, j jobqueue.Job, payload mediaPayload, result mediaResult, size int64, sourceFormat string) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(context.Background())
	if j.Kind == mediaConvert && payload.Save {
		if err := database.LockDirectoryContents(ctx, tx); err != nil {
			return err
		}
	}
	var fileID string
	err = tx.QueryRow(ctx, `SELECT id FROM files WHERE id=$1 FOR UPDATE`, payload.FileID).Scan(&fileID)
	if errors.Is(err, pgx.ErrNoRows) {
		return apperror.NotFound("файл не найден")
	}
	if err != nil {
		return err
	}
	checker := access.NewChecker(tx, access.NewRepository())
	file, err := s.getMediaFile(ctx, tx, j.Owner, j.Kind, payload, checker)
	if err != nil {
		return err
	}

	if j.Kind == mediaPreview {
		if size > 0 {
			_, err := tx.Exec(ctx, `INSERT INTO file_previews (file_id, object_key, size,source_object_key) VALUES ($1,$2,$3,$4)
                ON CONFLICT (file_id) DO UPDATE SET object_key=excluded.object_key,size=excluded.size,
                    source_object_key=excluded.source_object_key,created_at=clock_timestamp()
                WHERE file_previews.source_object_key IS NOT NULL AND file_previews.source_object_key<>excluded.source_object_key`,
				file.ID, result.ObjectKey, size, file.ObjectKey)
			if err != nil {
				return err
			}
		}
		err = tx.QueryRow(ctx, `SELECT object_key FROM file_previews WHERE file_id=$1`, file.ID).Scan(&result.ObjectKey)
		if err != nil {
			return err
		}
	} else if payload.Save {
		used, quota, err := s.repo.GetUserStorage(ctx, tx, j.Owner)
		if err != nil {
			return err
		}
		if size > quota-used {
			return apperror.Validation("превышен лимит хранилища")
		}
		newFile, err := s.repo.Save(ctx, tx, fileRecord{DirectoryID: file.DirectoryID, OwnerID: j.Owner,
			Filename: replaceExt(file.Filename, payload.Target), Extension: payload.Target, MimeType: mimeMap[payload.Target],
			Size: size, ObjectKey: result.ObjectKey})
		if err != nil {
			return err
		}
		if err := s.repo.AddUserStorageUsed(ctx, tx, j.Owner, size); err != nil {
			return err
		}
		if err := s.repo.IncrementFilesCount(ctx, tx, file.DirectoryID, 1); err != nil {
			return err
		}
		conv, err := s.repo.SaveConversion(ctx, tx, file.ID, newFile.ID, sourceFormat, payload.Target, j.Owner)
		if err != nil {
			return err
		}
		response := toConversionResponse(conv)
		result.Conversion = &response
	}
	if err := j.Complete(ctx, tx, result); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
