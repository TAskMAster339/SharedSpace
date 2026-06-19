package apperror

import (
	"errors"
	"net/http"
)

const (
	CodeNotFound     = "not_found"
	CodeForbidden    = "forbidden"
	CodeUnauthorized = "unauthorized"
	CodeConflict     = "conflict"
	CodeValidation   = "validation"
	CodeInternal     = "internal"
)

type Error struct {
	message string
	code    string
	status  int
	cause   error
}

func (e *Error) Error() string {
	return e.message
}

func (e *Error) Unwrap() error {
	return e.cause
}

func (e *Error) Code() string {
	return e.code
}

func (e *Error) Status() int {
	return e.status
}

func newError(message, code string, status int, cause error) error {
	return &Error{message: message, code: code, status: status, cause: cause}
}

func NotFound(message string) error {
	return newError(message, CodeNotFound, http.StatusNotFound, nil)
}

func Forbidden(message string) error {
	return newError(message, CodeForbidden, http.StatusForbidden, nil)
}

func Unauthorized(message string) error {
	return newError(message, CodeUnauthorized, http.StatusUnauthorized, nil)
}

func Conflict(message string) error {
	return newError(message, CodeConflict, http.StatusConflict, nil)
}

func Validation(message string) error {
	return newError(message, CodeValidation, http.StatusBadRequest, nil)
}

func Internal(message string) error {
	return newError(message, CodeInternal, http.StatusInternalServerError, nil)
}

func WrapInternal(message string, cause error) error {
	return newError(message, CodeInternal, http.StatusInternalServerError, cause)
}

func From(err error) (*Error, bool) {
	var appErr *Error
	if errors.As(err, &appErr) {
		return appErr, true
	}
	return nil, false
}
