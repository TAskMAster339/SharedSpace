SWAG_PATH := $(shell command -v swag 2>/dev/null)
SWAG ?= $(if $(SWAG_PATH),$(SWAG_PATH),$(HOME)/go/bin/swag)
DOCS_OUTPUT := docs

.PHONY: swagger
swagger:
	@[ -x "$(SWAG)" ] || { echo "swag is not installed. Run: go install github.com/swaggo/swag/cmd/swag@v1.16.6"; exit 1; }
	@"$(SWAG)" init -g cmd/api/main.go --dir . --parseInternal --parseDependency --output $(DOCS_OUTPUT) --outputTypes go,json 2>&1 | grep -v "mProfCycleWrap\|warning.*no Go files"