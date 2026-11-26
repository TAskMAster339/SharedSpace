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
	return s.cleanupMediaObjects(ctx, previewPrefix, cursor, cutoff)
}

func (s *Service) cleanupMediaObjects(ctx context.Context, prefix, cursor string, cutoff time.Time) string {
	for ctx.Err() == nil {
		keys, last, err := s.storage.ListOldObjectPage(ctx, prefix, cursor, cutoff, previewBatchSize)
		if err != nil {
			log.Printf("preview cleanup: list: %v", err)
			return cursor
		}
		if last == "" {
			return ""
		}
		if len(keys) > 0 {
			var liveKeys []string
			query := `SELECT ARRAY(SELECT object_key FROM file_previews WHERE object_key = ANY($1::text[])
                UNION SELECT original_key FROM directory_covers WHERE original_key = ANY($1::text[])
                UNION SELECT preview_key FROM directory_covers WHERE preview_key = ANY($1::text[]))`
			if prefix == savedMediaPrefix {
				query = `SELECT ARRAY(SELECT object_key FROM files WHERE object_key = ANY($1::text[])
                    UNION SELECT object_key FROM file_versions WHERE object_key = ANY($1::text[]))`
			}
			err := s.db.QueryRow(ctx, query, keys).Scan(&liveKeys)
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
		var previewCursor, convertedCursor string
		for {
			select {
			case <-ticker.C:
				tmpCtx, cancelTmp := context.WithTimeout(ctx, cleanupTimeout)
				s.CleanupTmp(tmpCtx)
				cancelTmp()

				previewCtx, cancelPreview := context.WithTimeout(ctx, cleanupTimeout)
				previewCursor = s.CleanupPreviews(previewCtx, previewCursor, time.Now().Add(-previewMaxAge))
				cancelPreview()
				convCtx, cancelConv := context.WithTimeout(ctx, cleanupTimeout)
				convertedCursor = s.cleanupMediaObjects(convCtx, savedMediaPrefix, convertedCursor, time.Now().Add(-previewMaxAge))
				cancelConv()
			case <-ctx.Done():
				return
			}
		}
	}()
}
