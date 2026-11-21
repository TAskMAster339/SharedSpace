package jobqueue

import (
	"context"
	"errors"
	"log"
	"maps"
	"slices"
	"time"

	"github.com/jackc/pgx/v5"
)

type Handler struct {
	Timeout time.Duration
	Run     func(context.Context, Job) error
}

func (q *Queue) Run(ctx context.Context, handlers map[string]Handler, healthy func()) {
	kinds := slices.Collect(maps.Keys(handlers))
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	nextReport := time.Time{}
	for ctx.Err() == nil {
		queryCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
		err := q.maintain(queryCtx)
		if err == nil && time.Now().After(nextReport) {
			err = q.report(queryCtx)
			nextReport = time.Now().Add(30 * time.Second)
		}
		var j Job
		if err == nil {
			j, err = q.claim(queryCtx, kinds)
		}
		cancel()
		if err == nil {
			healthy()
			q.run(ctx, j, handlers[j.Kind], healthy)
			continue
		}
		if errors.Is(err, pgx.ErrNoRows) {
			healthy()
		} else if ctx.Err() == nil {
			log.Printf("job queue: %v", err)
		}
		select {
		case <-ctx.Done():
		case <-ticker.C:
		}
	}
}

func (q *Queue) run(stop context.Context, j Job, handler Handler, healthy func()) {
	ctx, cancel := context.WithTimeout(context.WithoutCancel(stop), handler.Timeout)
	defer cancel()
	shutdown := context.AfterFunc(stop, func() {
		timer := time.AfterFunc(8*time.Second, cancel)
		<-ctx.Done()
		timer.Stop()
	})
	defer shutdown()
	heartbeatDone := make(chan struct{})
	go func() {
		defer close(heartbeatDone)
		ticker := time.NewTicker(10 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				hbCtx, done := context.WithTimeout(ctx, 4*time.Second)
				err := q.renew(hbCtx, j)
				done()
				if err != nil {
					cancel()
					return
				}
				healthy()
			}
		}
	}()
	err := handler.Run(ctx, j)
	timedOut := errors.Is(ctx.Err(), context.DeadlineExceeded)
	cancel()
	<-heartbeatDone
	if err == nil || errors.Is(err, ErrLeaseLost) {
		return
	}
	log.Printf("job %s kind=%s attempt=%d: %v", j.ID, j.Kind, j.Attempts, err)
	var failure *Failure
	errors.As(err, &failure)
	if timedOut && failure == nil {
		failure = &Failure{"Истекло время обработки файла", "media_timeout", 504}
	}
	if failure == nil && j.Attempts >= maxAttempts {
		failure = &Failure{"Обработка временно недоступна", "media_failed", 503}
	}
	finishCtx, done := context.WithTimeout(context.Background(), 3*time.Second)
	defer done()
	if err := q.fail(finishCtx, j, failure); err != nil {
		log.Printf("job %s persist failure: %v", j.ID, err)
	}
}

func (q *Queue) report(ctx context.Context) error {
	if err := q.prune(ctx); err != nil {
		return err
	}
	var queued, running, retries, oldest int
	err := q.pool.QueryRow(ctx, `SELECT count(*) FILTER (WHERE state='queued'),
		count(*) FILTER (WHERE state='running'), count(*) FILTER (WHERE attempts > 0 AND state='queued'),
		coalesce(max(EXTRACT(epoch FROM clock_timestamp()-created_at)) FILTER (WHERE state='queued'),0)::int
		FROM background_jobs WHERE state IN ('queued','running')`).Scan(&queued, &running, &retries, &oldest)
	if err == nil {
		log.Printf("job queue: queued=%d running=%d retrying=%d oldest_queued_seconds=%d", queued, running, retries, oldest)
	}
	return err
}
