package files

import (
	"context"
	"log"
	"time"
)

const (
	tmpPrefix        = "conv/"
	tmpMaxAge        = 30 * time.Minute
	cleanupPeriod    = 15 * time.Minute
	cleanupTimeout   = 2 * time.Minute
	previewMaxAge    = time.Hour
	previewBatchSize = 500
)

func (s *Service) CleanupTmp(ctx context.Context) {
	keys, err := s.tmpStorage.ListObjects(ctx, tmpPrefix, time.Now().Add(-tmpMaxAge))
	if err != nil {
		log.Printf("tmp cleanup: list objects: %v", err)
		return
	}
	for _, key := range keys {
		if err := s.tmpStorage.Delete(ctx, key); err != nil {
			log.Printf("tmp cleanup: delete %s: %v", key, err)
		} else {
			log.Printf("tmp cleanup: deleted %s", key)
		}
	}
}

// CleanupPreviews returns the last processed key so the next run can resume.
// Failed deletions are retried on the next full scan.
func (s *Service) CleanupPreviews(ctx context.Context, cursor string, cutoff time.Time) string {
	for ctx.Err() == nil {
		keys, last, err := s.storage.ListOldObjectPage(ctx, previewPrefix, cursor, cutoff, previewBatchSize)
		if err != nil {
			log.Printf("preview cleanup: list: %v", err)
			return cursor
		}
		if last == "" {
			return ""
		}
		if len(keys) > 0 {
			var liveKeys []string
			err := s.db.QueryRow(ctx, `
				SELECT ARRAY(SELECT object_key FROM file_previews WHERE object_key = ANY($1::text[]))
			`, keys).Scan(&liveKeys)
			if err != nil {
				log.Printf("preview cleanup: lookup: %v", err)
				return cursor
			}
			live := make(map[string]struct{}, len(liveKeys))
			for _, key := range liveKeys {
				live[key] = struct{}{}
			}
			for _, key := range keys {
				if ctx.Err() != nil {
					return cursor
				}
				if _, exists := live[key]; !exists {
					if err := s.storage.Delete(ctx, key); err != nil {
						if ctx.Err() != nil {
							return cursor
						}
						log.Printf("preview cleanup: delete %s: %v", key, err)
					}
				}
				cursor = key
			}
		}
		cursor = last
	}
	return cursor
}

func (s *Service) StartCleanupWorker(ctx context.Context) {
	go func() {
		ticker := time.NewTicker(cleanupPeriod)
		defer ticker.Stop()
		var previewCursor string
		for {
			select {
			case <-ticker.C:
				tmpCtx, cancelTmp := context.WithTimeout(ctx, cleanupTimeout)
				s.CleanupTmp(tmpCtx)
				cancelTmp()

				previewCtx, cancelPreview := context.WithTimeout(ctx, cleanupTimeout)
				previewCursor = s.CleanupPreviews(previewCtx, previewCursor, time.Now().Add(-previewMaxAge))
				cancelPreview()
			case <-ctx.Done():
				return
			}
		}
	}()
}
