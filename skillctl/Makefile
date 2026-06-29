GO ?= go
BINARY_NAME ?= skillctl
BUILD_DIR ?= dist
TARGET_OS ?= linux
TARGET_ARCH ?= $(shell $(GO) env GOARCH)
GO_LDFLAGS ?= -s -w
TEST_FLAGS ?= -count=1

.PHONY: all build test check release linux-amd64 linux-arm64 darwin-amd64 darwin-arm64 mac-amd64 mac-arm64 clean

all: build

build:
	@mkdir -p $(BUILD_DIR)
	CGO_ENABLED=0 GOOS=$(TARGET_OS) GOARCH=$(TARGET_ARCH) $(GO) build -trimpath -ldflags '$(GO_LDFLAGS)' -o $(BUILD_DIR)/$(BINARY_NAME) .

test:
	$(GO) test $(TEST_FLAGS) ./...

check: test

release: check linux-amd64 linux-arm64 darwin-amd64 darwin-arm64

linux-amd64:
	@mkdir -p $(BUILD_DIR)
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 $(GO) build -trimpath -ldflags '$(GO_LDFLAGS)' -o $(BUILD_DIR)/$(BINARY_NAME)-linux-amd64 .

linux-arm64:
	@mkdir -p $(BUILD_DIR)
	CGO_ENABLED=0 GOOS=linux GOARCH=arm64 $(GO) build -trimpath -ldflags '$(GO_LDFLAGS)' -o $(BUILD_DIR)/$(BINARY_NAME)-linux-arm64 .

darwin-amd64:
	@mkdir -p $(BUILD_DIR)
	CGO_ENABLED=0 GOOS=darwin GOARCH=amd64 $(GO) build -trimpath -ldflags '$(GO_LDFLAGS)' -o $(BUILD_DIR)/$(BINARY_NAME)-darwin-amd64 .

darwin-arm64:
	@mkdir -p $(BUILD_DIR)
	CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 $(GO) build -trimpath -ldflags '$(GO_LDFLAGS)' -o $(BUILD_DIR)/$(BINARY_NAME)-darwin-arm64 .

mac-amd64: darwin-amd64

mac-arm64: darwin-arm64

clean:
	rm -rf $(BUILD_DIR)
