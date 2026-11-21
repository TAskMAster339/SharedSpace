package jobqueue

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"strconv"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	maxAttempts  = 3
	leaseSeconds = 30
)

var (
	ErrFull      = errors.New("job queue is full")
	ErrLeaseLost = errors.New("job lease lost")
)

type Failure struct {
	Message string `json:"message"`
	Code    string `json:"code"`
	Status  int    `json:"status"`
}

func (e *Failure) Error() string { return e.Message }

type Job struct {
	ID, Owner, Kind, State string
	Payload, Result        json.RawMessage
	Failure                *Failure
	Token                  string
	Attempts               int
}

type Limits struct {
	Kind  int
	Owner int
}

type Queue struct {
	pool  *pgxpool.Pool
	total int
}

func New(pool *pgxpool.Pool) (*Queue, error) {
	total, err := PositiveEnv("JOB_QUEUE_LIMIT", 200)
	if err != nil {
		return nil, err
	}
	return &Queue{pool: pool, total: total}, nil
}

func PositiveEnv(name string, fallback int) (int, error) {
	value := os.Getenv(name)
	if value == "" {
		return fallback, nil
	}
	n, err := strconv.Atoi(value)
	if err != nil || n < 1 || n > 10000 {
		return 0, fmt.Errorf("%s must be between 1 and 10000", name)
	}
	return n, nil
}

const jobColumns = `id, owner_id, kind, state, payload, result, error, coalesce(lease_token::text, ''), attempts`

func scanJob(row pgx.Row) (Job, error) {
	var j Job
	err := row.Scan(&j.ID, &j.Owner, &j.Kind, &j.State, &j.Payload, &j.Result, &j.Failure, &j.Token, &j.Attempts)
	return j, err
}

func (q *Queue) Enqueue(ctx context.Context, owner, kind string, payload any, requestKey, activeKey string, limits Limits) (Job, error) {
	tx, err := q.pool.Begin(ctx)
	if err != nil {
		return Job{}, err
	}
	defer tx.Rollback(context.Background())
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(738154110)`); err != nil {
		return Job{}, err
	}
	if requestKey != "" || activeKey != "" {
		job, err := scanJob(tx.QueryRow(ctx, `SELECT `+jobColumns+` FROM background_jobs
			WHERE owner_id=$1 AND (request_key=$2 OR (kind=$3 AND active_key=$4 AND state IN ('queued','running')))
			ORDER BY (request_key IS NOT DISTINCT FROM NULLIF($2,'')) DESC LIMIT 1`, owner, requestKey, kind, activeKey))
		if !errors.Is(err, pgx.ErrNoRows) {
			return job, err
		}
	}
	var total, ofKind, ofOwner int
	err = tx.QueryRow(ctx, `SELECT count(*), count(*) FILTER (WHERE kind=$1),
		count(*) FILTER (WHERE kind=$1 AND owner_id=$2)
		FROM background_jobs WHERE state IN ('queued','running')`, kind, owner).Scan(&total, &ofKind, &ofOwner)
	if err != nil {
		return Job{}, err
	}
	if total >= q.total ||
		limits.Kind > 0 && ofKind >= limits.Kind || limits.Owner > 0 && ofOwner >= limits.Owner {
		return Job{}, ErrFull
	}
	job, err := scanJob(tx.QueryRow(ctx, `INSERT INTO background_jobs (id, owner_id, kind, payload, request_key, active_key)
		VALUES ($1,$2,$3,$4,NULLIF($5,''),NULLIF($6,'')) RETURNING `+jobColumns,
		uuid.NewString(), owner, kind, payload, requestKey, activeKey))
	if err != nil {
		return Job{}, err
	}
	return job, tx.Commit(ctx)
}

func (q *Queue) Get(ctx context.Context, owner, id string) (Job, error) {
	return scanJob(q.pool.QueryRow(ctx, `SELECT `+jobColumns+` FROM background_jobs WHERE owner_id=$1 AND id=$2`, owner, id))
}

func (q *Queue) claim(ctx context.Context, kinds []string) (Job, error) {
	return scanJob(q.pool.QueryRow(ctx, `UPDATE background_jobs SET state='running',
		attempts=attempts+1, lease_token=$1, lease_until=clock_timestamp()+make_interval(secs => $2)
		WHERE id=(SELECT id FROM background_jobs WHERE state='queued' AND available_at <= clock_timestamp()
			AND kind=ANY($3) ORDER BY available_at, created_at, id FOR UPDATE SKIP LOCKED LIMIT 1)
		RETURNING `+jobColumns, uuid.NewString(), leaseSeconds, kinds))
}

func (q *Queue) renew(ctx context.Context, j Job) error {
	tag, err := q.pool.Exec(ctx, `UPDATE background_jobs SET lease_until=clock_timestamp()+make_interval(secs => $3)
		WHERE id=$1 AND state='running' AND lease_token=$2 AND lease_until > clock_timestamp()`, j.ID, j.Token, leaseSeconds)
	if err == nil && tag.RowsAffected() != 1 {
		return ErrLeaseLost
	}
	return err
}

func (j Job) Complete(ctx context.Context, tx pgx.Tx, result any) error {
	tag, err := tx.Exec(ctx, `UPDATE background_jobs SET state='succeeded', result=$3,
		finished_at=clock_timestamp(), lease_token=NULL, lease_until=NULL
		WHERE id=$1 AND state='running' AND lease_token=$2 AND lease_until > clock_timestamp()`, j.ID, j.Token, result)
	if err == nil && tag.RowsAffected() != 1 {
		return ErrLeaseLost
	}
	return err
}

func (q *Queue) fail(ctx context.Context, j Job, failure *Failure) error {
	_, err := q.pool.Exec(ctx, `UPDATE background_jobs SET
		state=CASE WHEN $3::jsonb IS NULL THEN 'queued' ELSE 'failed' END,
		available_at=clock_timestamp()+make_interval(secs => 5*power(2,attempts-1)),
		finished_at=CASE WHEN $3::jsonb IS NULL THEN NULL ELSE clock_timestamp() END,
		error=$3, lease_token=NULL, lease_until=NULL
		WHERE id=$1 AND state='running' AND lease_token=$2 AND lease_until > clock_timestamp()`, j.ID, j.Token, failure)
	return err
}

func (q *Queue) maintain(ctx context.Context) error {
	tag, err := q.pool.Exec(ctx, `WITH expired AS (
		SELECT id FROM background_jobs WHERE state='running' AND lease_until <= clock_timestamp()
		ORDER BY lease_until FOR UPDATE SKIP LOCKED LIMIT 200
	)
	UPDATE background_jobs SET state=CASE WHEN attempts >= $1 THEN 'failed' ELSE 'queued' END,
		error=CASE WHEN attempts >= $1 THEN '{"message":"Обработка прервана","code":"media_interrupted","status":503}'::jsonb END,
		finished_at=CASE WHEN attempts >= $1 THEN clock_timestamp() END,
		available_at=clock_timestamp()+make_interval(secs => 5*power(2,attempts-1)), lease_token=NULL, lease_until=NULL
		WHERE id IN (SELECT id FROM expired)`, maxAttempts)
	if err == nil && tag.RowsAffected() > 0 {
		log.Printf("job queue: expired_leases=%d", tag.RowsAffected())
	}
	return err
}

func (q *Queue) prune(ctx context.Context) error {
	_, err := q.pool.Exec(ctx, `DELETE FROM background_jobs WHERE id IN (SELECT id FROM background_jobs
		WHERE finished_at < clock_timestamp()-interval '24 hours' ORDER BY finished_at FOR UPDATE SKIP LOCKED LIMIT 500)`)
	return err
}
