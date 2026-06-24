package storage

import (
	"context"
	"fmt"
	"io"
	"net/url"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

type Storage struct {
	client         *minio.Client
	bucket         string
	publicEndpoint string
}

func New(ctx context.Context, endpoint, accessKey, secretKey, bucket, publicEndpoint string, useSSL bool) (*Storage, error) {
	client, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: useSSL,
	})
	if err != nil {
		return nil, fmt.Errorf("minio client: %w", err)
	}

	exists, err := client.BucketExists(ctx, bucket)
	if err != nil {
		return nil, fmt.Errorf("check bucket: %w", err)
	}
	if !exists {
		if err := client.MakeBucket(ctx, bucket, minio.MakeBucketOptions{}); err != nil {
			return nil, fmt.Errorf("create bucket: %w", err)
		}
	}

	return &Storage{client: client, bucket: bucket, publicEndpoint: publicEndpoint}, nil
}

func (s *Storage) Upload(ctx context.Context, objectKey string, r io.Reader, size int64, contentType string) error {
	_, err := s.client.PutObject(ctx, s.bucket, objectKey, r, size, minio.PutObjectOptions{
		ContentType: contentType,
	})
	if err != nil {
		return fmt.Errorf("upload %s: %w", objectKey, err)
	}
	return nil
}

func (s *Storage) Get(ctx context.Context, objectKey string) (io.ReadCloser, error) {
	if _, err := s.client.StatObject(ctx, s.bucket, objectKey, minio.StatObjectOptions{}); err != nil {
		return nil, fmt.Errorf("get %s: %w", objectKey, err)
	}
	obj, err := s.client.GetObject(ctx, s.bucket, objectKey, minio.GetObjectOptions{})
	if err != nil {
		return nil, fmt.Errorf("get %s: %w", objectKey, err)
	}
	return obj, nil
}

func (s *Storage) PresignedGetURL(ctx context.Context, objectKey string, expiry time.Duration) (string, error) {
	u, err := s.client.PresignedGetObject(ctx, s.bucket, objectKey, expiry, url.Values{})
	if err != nil {
		return "", fmt.Errorf("presign %s: %w", objectKey, err)
	}

	u.Host = s.publicEndpoint

	return u.String(), nil
}

func (s *Storage) Delete(ctx context.Context, objectKey string) error {
	if err := s.client.RemoveObject(ctx, s.bucket, objectKey, minio.RemoveObjectOptions{}); err != nil {
		return fmt.Errorf("delete %s: %w", objectKey, err)
	}
	return nil
}
