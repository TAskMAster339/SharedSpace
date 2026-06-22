package apperror

import (
	"encoding/json"
	"log"
	"net/http"
)

type response struct {
	Error string `json:"error"`
	Code  string `json:"code"`
}

// Response is the standard JSON payload returned by API errors.
type Response struct {
	Error string `json:"error"`
	Code  string `json:"code"`
}

func Write(w http.ResponseWriter, err error) {
	if err == nil {
		return
	}

	appErr, ok := From(err)
	if !ok {
		log.Printf("unexpected error: %v", err)
		appErr = &Error{
			message: http.StatusText(http.StatusInternalServerError),
			code:    CodeInternal,
			status:  http.StatusInternalServerError,
			cause:   err,
		}
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(appErr.Status())

	if encodeErr := json.NewEncoder(w).Encode(Response{
		Error: appErr.Error(),
		Code:  appErr.Code(),
	}); encodeErr != nil {
		log.Printf("failed to encode error response: %v", encodeErr)
	}
}
