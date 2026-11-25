package access

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type accountRoleRow struct {
	role string
	err  error
}

func (r *accountRoleRow) QueryRow(context.Context, string, ...any) pgx.Row {
	return r
}

func (r *accountRoleRow) Scan(dest ...any) error {
	*dest[0].(*string) = r.role
	return r.err
}

func TestAccountRoleChecker(t *testing.T) {
	dbErr := errors.New("database unavailable")
	tests := []struct {
		name    string
		row     accountRoleRow
		allowed []AccountRole
		want    bool
		wantErr error
	}{
		{name: "common", row: accountRoleRow{role: "common"}, allowed: []AccountRole{AccountRoleCommon}, want: true},
		{name: "premium", row: accountRoleRow{role: "premium"}, allowed: []AccountRole{AccountRolePremium}, want: true},
		{name: "admin explicitly allowed", row: accountRoleRow{role: "admin"}, allowed: []AccountRole{AccountRolePremium, AccountRoleAdmin}, want: true},
		{name: "admin excluded", row: accountRoleRow{role: "admin"}, allowed: []AccountRole{AccountRolePremium}},
		{name: "common excluded", row: accountRoleRow{role: "common"}, allowed: []AccountRole{AccountRolePremium, AccountRoleAdmin}},
		{name: "unknown role", row: accountRoleRow{role: "unrecognized"}, allowed: []AccountRole{"unrecognized"}},
		{name: "empty policy", row: accountRoleRow{err: dbErr}},
		{name: "missing account", row: accountRoleRow{err: pgx.ErrNoRows}, allowed: []AccountRole{AccountRoleCommon}},
		{name: "database failure", row: accountRoleRow{err: dbErr}, allowed: []AccountRole{AccountRoleAdmin}, wantErr: dbErr},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := NewAccountRoleChecker(&tt.row).HasRole(context.Background(), "user-id", tt.allowed...)
			if got != tt.want || !errors.Is(err, tt.wantErr) {
				t.Fatalf("HasRole() = %t, %v; want %t, %v", got, err, tt.want, tt.wantErr)
			}
		})
	}
}

func TestAccountRoleCheckerPostgres(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set TEST_DATABASE_URL to run PostgreSQL integration tests")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	conn, err := pgx.Connect(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close(context.Background())

	tx, err := conn.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(context.Background())

	exec := func(query string) {
		t.Helper()
		if _, err := tx.Exec(ctx, query); err != nil {
			t.Fatal(err)
		}
	}
	migration := func(direction string) {
		t.Helper()
		sql, err := os.ReadFile("../database/migrations/016_account_roles." + direction + ".sql")
		if err != nil {
			t.Fatal(err)
		}
		exec(string(sql))
	}

	const oldID = "00000000-0000-4000-8000-000000000001"
	const newID = "00000000-0000-4000-8000-000000000002"
	exec("CREATE TEMP TABLE users (id uuid PRIMARY KEY, username text)")
	exec("SET LOCAL search_path TO pg_temp")
	exec("INSERT INTO users VALUES ('" + oldID + "', 'old')")
	migration("up")
	exec("INSERT INTO users (id, username) VALUES ('" + newID + "', 'new')")

	checker := NewAccountRoleChecker(tx)
	check := func(userID string, want bool, allowed ...AccountRole) {
		t.Helper()
		got, err := checker.HasRole(ctx, userID, allowed...)
		if err != nil || got != want {
			t.Fatalf("HasRole(%s, %v) = %t, %v; want %t", userID, allowed, got, err, want)
		}
	}
	check(oldID, true, AccountRoleCommon)
	check(newID, true, AccountRoleCommon)
	exec("UPDATE users SET role = 'premium' WHERE id = '" + oldID + "'")
	check(oldID, true, AccountRolePremium)
	exec("UPDATE users SET role = 'admin' WHERE id = '" + oldID + "'")
	check(oldID, false, AccountRolePremium)
	check(oldID, true, AccountRoleAdmin)
	check("00000000-0000-4000-8000-000000000003", false, AccountRoleAdmin)

	for _, value := range []struct{ sql, code string }{
		{sql: "'unknown'", code: "22P02"},
		{sql: "NULL", code: "23502"},
	} {
		exec("SAVEPOINT invalid_role")
		_, err := tx.Exec(ctx, "UPDATE users SET role = "+value.sql+" WHERE id = $1", oldID)
		var pgErr *pgconn.PgError
		if !errors.As(err, &pgErr) || pgErr.Code != value.code {
			t.Fatalf("role %s: wanted PostgreSQL error %s, got %v", value.sql, value.code, err)
		}
		exec("ROLLBACK TO SAVEPOINT invalid_role")
	}

	migration("down")
	var username string
	if err := tx.QueryRow(ctx, "SELECT username FROM users WHERE id = $1", oldID).Scan(&username); err != nil || username != "old" {
		t.Fatalf("old user after rollback = %q, %v", username, err)
	}
}
