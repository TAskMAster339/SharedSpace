package database

import (
	"context"

	"github.com/jackc/pgx/v5/pgconn"
)

// LockDirectoryTopology must precede other writes in transactions that remove
// directories. It prevents shared-to-exclusive lock upgrades during cascades.
func LockDirectoryTopology(ctx context.Context, tx interface {
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
}) error {
	_, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(73421, 11)`)
	return err
}

// LockDirectoryContents precedes quota/user-row locks for file write transactions,
// matching the lock order used by tree moves and cascading deletion.
func LockDirectoryContents(ctx context.Context, tx interface {
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
}) error {
	_, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock_shared(73421, 11)`)
	return err
}
