package users

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"sharedspace/internal/database"
)

func TestStorageUsageOwnershipAndTrash(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set TEST_DATABASE_URL for PostgreSQL integration tests")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	admin, err := pgx.Connect(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	schema := "usage_test_" + uuid.NewString()[:8]
	quoted := pgx.Identifier{schema}.Sanitize()
	if _, err = admin.Exec(ctx, "CREATE SCHEMA "+quoted); err != nil {
		t.Fatal(err)
	}
	defer func() {
		admin.Exec(context.Background(), "DROP SCHEMA "+quoted+" CASCADE")
		admin.Close(context.Background())
	}()
	config, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		t.Fatal(err)
	}
	config.ConnConfig.RuntimeParams["search_path"] = schema + ",public"
	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	if err := database.Migrate(ctx, pool, "../database/migrations"); err != nil {
		t.Fatal(err)
	}
	_, err = pool.Exec(ctx, `
 INSERT INTO users(id,username,email,password_hash,storage_quota,storage_used) VALUES
 (md5('1')::uuid,'usage-one','usage-one@example.com','test',2000,1000),
 (md5('2')::uuid,'usage-two','usage-two@example.com','test',2000,900);
 INSERT INTO directories(id,name,owner_id,parent_id,type) VALUES
 (md5('10')::uuid,'root',md5('1')::uuid,NULL,'root'),
 (md5('20')::uuid,'other-root',md5('2')::uuid,NULL,'root');
 INSERT INTO directories(id,name,owner_id,parent_id) VALUES
 (md5('11')::uuid,'Zulu',md5('1')::uuid,md5('10')::uuid),
 (md5('12')::uuid,'Alpha',md5('1')::uuid,md5('10')::uuid),
 (md5('13')::uuid,'Empty',md5('1')::uuid,md5('10')::uuid),
 (md5('14')::uuid,'Nested',md5('1')::uuid,md5('11')::uuid);
 INSERT INTO files(directory_id,owner_id,filename,extension,mime_type,size,object_key,deleted_at) VALUES
 (md5('10')::uuid,md5('1')::uuid,'root','txt','text/plain',100,'usage/root',NULL),
 (md5('11')::uuid,md5('1')::uuid,'a','txt','text/plain',200,'usage/a',NULL),
 (md5('12')::uuid,md5('1')::uuid,'b','txt','text/plain',50,'usage/b',NULL),
 (md5('14')::uuid,md5('1')::uuid,'nested','txt','text/plain',100,'usage/nested',NULL),
 (md5('20')::uuid,md5('1')::uuid,'shared','txt','text/plain',150,'usage/shared',NULL),
 (md5('11')::uuid,md5('1')::uuid,'trash','txt','text/plain',400,'usage/trash',now()),
 (md5('11')::uuid,md5('2')::uuid,'foreign','txt','text/plain',900,'usage/foreign',NULL);`)
	if err != nil {
		t.Fatal(err)
	}
	var userID, otherID string
	if err := pool.QueryRow(ctx, `SELECT md5('1')::uuid::text,md5('2')::uuid::text`).Scan(&userID, &otherID); err != nil {
		t.Fatal(err)
	}
	svc := &Service{repo: NewRepository(), db: pool}
	result, err := svc.GetStorageUsage(ctx, userID, "size")
	if err != nil {
		t.Fatal(err)
	}
	if result.UsedBytes != 1000 || result.QuotaBytes != 2000 || result.TrashBytes != 400 || result.RootFilesBytes != 100 || result.OtherFilesBytes != 150 {
		t.Fatalf("wrong usage: %+v", result)
	}
	if len(result.Folders) != 3 || result.Folders[0].Name != "Zulu" || result.Folders[0].SizeBytes != 300 || result.Folders[1].SizeBytes != 50 {
		t.Fatalf("wrong folder allocation: %+v", result.Folders)
	}
	sum := result.TrashBytes + result.RootFilesBytes + result.OtherFilesBytes
	for _, folder := range result.Folders {
		sum += folder.SizeBytes
	}
	if sum != result.UsedBytes {
		t.Fatalf("breakdown %d differs from used %d", sum, result.UsedBytes)
	}
	byName, err := svc.GetStorageUsage(ctx, userID, "name")
	if err != nil {
		t.Fatal(err)
	}
	if byName.Folders[0].Name != "Alpha" {
		t.Fatalf("wrong name order: %+v", byName.Folders)
	}
	other, err := svc.GetStorageUsage(ctx, otherID, "size")
	if err != nil {
		t.Fatal(err)
	}
	if len(other.Folders) != 0 || other.OtherFilesBytes != 900 || other.RootFilesBytes != 0 || other.TrashBytes != 0 {
		t.Fatalf("other user's files leaked: %+v", other)
	}
	_, err = pool.Exec(ctx, `DELETE FROM files WHERE object_key='usage/trash'; UPDATE users SET storage_used=storage_used-400 WHERE id=md5('1')::uuid;`)
	if err != nil {
		t.Fatal(err)
	}
	result, err = svc.GetStorageUsage(ctx, userID, "size")
	if err != nil {
		t.Fatal(err)
	}
	if result.UsedBytes != 600 || result.TrashBytes != 0 {
		t.Fatalf("trash did not free space: %+v", result)
	}
	_, err = pool.Exec(ctx, `INSERT INTO directories(name,owner_id,parent_id) SELECT 'extra-'||n,md5('1')::uuid,md5('10')::uuid FROM generate_series(1,105)n`)
	if err != nil {
		t.Fatal(err)
	}
	result, err = svc.GetStorageUsage(ctx, userID, "size")
	if err != nil {
		t.Fatal(err)
	}
	if result.FolderCount != 108 || len(result.Folders) != 100 {
		t.Fatalf("unbounded response: %d folders, count %d", len(result.Folders), result.FolderCount)
	}
	_, err = pool.Exec(ctx, `
 UPDATE files SET size=6*1048576 WHERE object_key='usage/a';
 UPDATE files SET size=4*1048576 WHERE object_key='usage/nested';
 UPDATE files SET size=90*1048576 WHERE object_key='usage/foreign';
 UPDATE users SET storage_used=10*1048576+300 WHERE id=md5('1')::uuid;
 UPDATE users SET storage_used=90*1048576 WHERE id=md5('2')::uuid;
 INSERT INTO shared_directories(id,directory_id,owner_id) VALUES
 (md5('shared-zulu')::uuid,md5('11')::uuid,md5('1')::uuid),
 (md5('shared-nested')::uuid,md5('14')::uuid,md5('1')::uuid),
 (md5('shared-external')::uuid,md5('20')::uuid,md5('2')::uuid);
 `)
	if err != nil {
		t.Fatal(err)
	}
	result, err = svc.GetStorageUsage(ctx, userID, "size")
	if err != nil {
		t.Fatal(err)
	}
	var sharedDirectoryBytes int64
	if err := pool.QueryRow(ctx, `SELECT size_bytes FROM directories WHERE id=md5('11')::uuid`).Scan(&sharedDirectoryBytes); err != nil {
		t.Fatal(err)
	}
	if sharedDirectoryBytes != 100*1048576 || result.SharedFilesBytes != 10*1048576 ||
		result.PersonalFilesBytes != 150 || result.OtherFilesBytes != 150 ||
		result.UsedBytes-result.SharedFilesBytes-result.PersonalFilesBytes-result.TrashBytes != 150 {
		t.Fatalf("wrong allocation in shared directory of %d bytes: %+v", sharedDirectoryBytes, result)
	}
	_, err = pool.Exec(ctx, `
 INSERT INTO shared_directory_members(shared_directory_id,user_id,role) VALUES
 (md5('shared-external')::uuid,md5('1')::uuid,'editor'),
 (md5('shared-zulu')::uuid,md5('2')::uuid,'editor');
 `)
	if err != nil {
		t.Fatal(err)
	}
	result, err = svc.GetStorageUsage(ctx, userID, "size")
	if err != nil {
		t.Fatal(err)
	}
	if result.SharedFilesBytes != 10*1048576+150 || result.PersonalFilesBytes != 150 || result.OtherFilesBytes != 150 {
		t.Fatalf("wrong shared ownership or changed legacy response: %+v", result)
	}
	other, err = svc.GetStorageUsage(ctx, otherID, "size")
	if err != nil {
		t.Fatal(err)
	}
	if other.SharedFilesBytes != 90*1048576 || other.PersonalFilesBytes != 0 {
		t.Fatalf("shared folder counted another member's files: %+v", other)
	}

}

func TestStorageUsageRejectsInvalidSort(t *testing.T) {
	if _, err := (&Service{}).GetStorageUsage(context.Background(), "user", "bad"); err == nil {
		t.Fatal("invalid sort accepted")
	}
}
