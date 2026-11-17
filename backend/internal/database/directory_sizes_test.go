package database

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Uses an isolated schema in an explicitly supplied test database. No application
// database or schema is touched when TEST_DATABASE_URL is not set.
func TestDirectorySizesLifecycle(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set TEST_DATABASE_URL to run PostgreSQL integration tests")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	admin, err := pgx.Connect(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer admin.Close(context.Background())
	schema := "size_test_" + uuid.NewString()[:8]
	quoted := pgx.Identifier{schema}.Sanitize()
	if _, err = admin.Exec(ctx, "CREATE SCHEMA "+quoted); err != nil {
		t.Fatal(err)
	}
	defer func() {
		if _, err := admin.Exec(context.Background(), "DROP SCHEMA "+quoted+" CASCADE"); err != nil {
			t.Error(err)
		}
	}()
	config, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		t.Fatal(err)
	}
	config.ConnConfig.RuntimeParams["search_path"] = schema + ",public"
	config.MaxConns = 6
	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	migrations := "migrations"
	if err := Migrate(ctx, pool, migrations); err != nil {
		t.Fatal(err)
	}
	script, err := os.ReadFile(filepath.Join("testdata", "directory_sizes.sql"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, string(script)); err != nil {
		t.Fatalf("lifecycle regression: %v", err)
	}

	// Verify down/up migrations and backfill against existing, populated folders.
	if _, err := pool.Exec(ctx, `
 INSERT INTO directories(id,name,owner_id,parent_id) VALUES
 (md5('21')::uuid,'concurrent-a',md5('2')::uuid,md5('20')::uuid),
 (md5('22')::uuid,'concurrent-b',md5('2')::uuid,md5('20')::uuid);
 INSERT INTO files(directory_id,owner_id,filename,extension,mime_type,size,object_key)
 VALUES(md5('21')::uuid,md5('2')::uuid,'existing','txt','text/plain',99,'existing');`); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"011_directory_sizes.down.sql", "011_directory_sizes.up.sql"} {
		data, err := os.ReadFile(filepath.Join(migrations, name))
		if err != nil {
			t.Fatal(err)
		}
		if _, err := pool.Exec(ctx, string(data)); err != nil {
			t.Fatal(err)
		}
	}
	assertCachedDirectorySizes(t, ctx, pool)

	// Concurrent uploads with multi-statement transactions and subtree moves.
	// The timeout turns lock-order regressions into a bounded failure.
	var wg sync.WaitGroup
	failures := make(chan error, 5)
	for worker := 0; worker < 4; worker++ {
		wg.Add(1)
		go func(worker int) {
			defer wg.Done()
			for batch := 0; batch < 5; batch++ {
				tx, err := pool.Begin(ctx)
				if err != nil {
					failures <- err
					return
				}
				for i := 0; i < 2; i++ {
					key := fmt.Sprintf("concurrent-%d-%d-%d", worker, batch, i)
					_, err = tx.Exec(ctx, `INSERT INTO files(directory_id,owner_id,filename,extension,mime_type,size,object_key)
       VALUES(md5($1)::uuid,md5('2')::uuid,$2::text,'txt','text/plain',7,$2::text)`, fmt.Sprint(21+i), key)
					if err != nil {
						break
					}
				}
				if err != nil {
					tx.Rollback(context.Background())
					failures <- err
					return
				}
				if err := tx.Commit(ctx); err != nil {
					failures <- err
					return
				}
			}
		}(worker)
	}
	wg.Add(1)
	go func() {
		defer wg.Done()
		for i := 0; i < 10; i++ {
			parent := "20"
			if i%2 == 0 {
				parent = "22"
			}
			if _, err := pool.Exec(ctx, `UPDATE directories SET parent_id=md5($1)::uuid WHERE id=md5('21')::uuid`, parent); err != nil {
				failures <- err
				return
			}
		}
	}()
	wg.Wait()
	close(failures)
	for err := range failures {
		t.Error(err)
	}
	assertCachedDirectorySizes(t, ctx, pool)
}

func assertCachedDirectorySizes(t *testing.T, ctx context.Context, pool *pgxpool.Pool) {
	t.Helper()
	var mismatches int
	err := pool.QueryRow(ctx, `WITH RECURSIVE subtree(root_id,node_id) AS (
 SELECT id,id FROM directories UNION SELECT s.root_id,d.id FROM subtree s JOIN directories d ON d.parent_id=s.node_id
 ), expected AS (SELECT s.root_id,COALESCE(SUM(f.size),0) AS bytes FROM subtree s
 LEFT JOIN files f ON f.directory_id=s.node_id AND f.deleted_at IS NULL GROUP BY s.root_id)
 SELECT COUNT(*) FROM directories d JOIN expected e ON e.root_id=d.id WHERE d.size_bytes<>e.bytes`).Scan(&mismatches)
	if err != nil {
		t.Fatal(err)
	}
	if mismatches != 0 {
		t.Fatalf("%d cached sizes differ from recursive totals", mismatches)
	}
}
