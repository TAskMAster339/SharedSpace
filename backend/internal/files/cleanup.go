package files

import (
	"context"
	"log"
	"time"
)

const (
	tmpPrefix     = "conv/"
	tmpMaxAge     = 30 * time.Minute
	cleanupPeriod = 15 * time.Minute
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

func (s *Service) StartCleanupWorker(ctx context.Context) {
	go func() {
		ticker := time.NewTicker(cleanupPeriod)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				s.CleanupTmp(ctx)
			case <-ctx.Done():
				return
			}
		}
	}()
}
