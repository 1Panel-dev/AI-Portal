package main

import (
	"archive/zip"
	"bytes"
	"crypto/md5"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"testing"
)

func TestSignPanelRequestUsesAPIKeySignature(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "https://panel.example.com", nil)
	signPanelRequest(req, "raw-token")

	timestamp := req.Header.Get("1Panel-Timestamp")
	if timestamp == "" {
		t.Fatal("missing timestamp header")
	}
	if _, err := strconv.ParseInt(timestamp, 10, 64); err != nil {
		t.Fatalf("unexpected timestamp header: %s", timestamp)
	}
	sum := md5.Sum([]byte("1panel" + "raw-token" + timestamp))
	expected := hex.EncodeToString(sum[:])
	if req.Header.Get("1Panel-Token") != expected {
		t.Fatalf("unexpected signed token: %s", req.Header.Get("1Panel-Token"))
	}
}

func TestRunLoginWritesCurrentEndpointAndAuth(t *testing.T) {
	withConfigPath(t, filepath.Join(t.TempDir(), "config.json"))
	var gotPath string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		if r.Header.Get("1Panel-Token") == "" || r.Header.Get("1Panel-Timestamp") == "" {
			t.Fatal("missing API key auth headers")
		}
		writeEnvelope(t, w, panelCurrentUser{Name: "admin"})
	}))
	defer server.Close()

	if err := runLogin([]string{server.URL, "--token", "secret"}); err != nil {
		t.Fatal(err)
	}
	if gotPath != panelAuthPath {
		t.Fatalf("unexpected auth path: %s", gotPath)
	}
	cfg, err := loadConfig()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.CurrentEndpoint != server.URL {
		t.Fatalf("unexpected current endpoint: %s", cfg.CurrentEndpoint)
	}
	storedToken := cfg.Auths[server.URL].Token
	if storedToken == "secret" {
		t.Fatal("token should not be stored in plaintext")
	}
	decoded, err := base64.StdEncoding.DecodeString(storedToken)
	if err != nil {
		t.Fatal(err)
	}
	if string(decoded) != "secret" {
		t.Fatalf("unexpected decoded token: %s", string(decoded))
	}
	_, token, err := resolveEndpointToken(cfg, "")
	if err != nil {
		t.Fatal(err)
	}
	if token != "secret" {
		t.Fatalf("unexpected resolved token: %s", token)
	}
}

func TestRunLoginCanStoreTokenInPass(t *testing.T) {
	withConfigPath(t, filepath.Join(t.TempDir(), "config.json"))
	store := &fakePassStore{values: map[string]string{}}
	restorePassStore(t, store)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != panelAuthPath {
			t.Fatalf("unexpected auth path: %s", r.URL.Path)
		}
		writeEnvelope(t, w, panelCurrentUser{Name: "admin"})
	}))
	defer server.Close()

	if err := runLogin([]string{server.URL, "--token", "secret", "--auth-store", "pass"}); err != nil {
		t.Fatal(err)
	}
	cfg, err := loadConfig()
	if err != nil {
		t.Fatal(err)
	}
	storedToken := cfg.Auths[server.URL].Token
	if !strings.HasPrefix(storedToken, passAuthPrefix) {
		t.Fatalf("expected pass auth reference, got: %s", storedToken)
	}
	account := strings.TrimPrefix(storedToken, passAuthPrefix)
	if got := store.values[account]; got != "secret" {
		t.Fatalf("unexpected pass value: %s", got)
	}
	_, token, err := resolveEndpointToken(cfg, "")
	if err != nil {
		t.Fatal(err)
	}
	if token != "secret" {
		t.Fatalf("unexpected resolved token: %s", token)
	}
}

func TestRunLoginAcceptsAPIv2Endpoint(t *testing.T) {
	withConfigPath(t, filepath.Join(t.TempDir(), "config.json"))
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != panelAuthPath {
			t.Fatalf("unexpected auth path: %s", r.URL.Path)
		}
		writeEnvelope(t, w, panelCurrentUser{Name: "admin"})
	}))
	defer server.Close()

	endpoint := server.URL + "/api/v2"
	if err := runLogin([]string{endpoint, "--token", "secret"}); err != nil {
		t.Fatal(err)
	}
	cfg, err := loadConfig()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.CurrentEndpoint != endpoint {
		t.Fatalf("unexpected current endpoint: %s", cfg.CurrentEndpoint)
	}
}

func TestRunLogoutDeletesPassToken(t *testing.T) {
	configPath := filepath.Join(t.TempDir(), "config.json")
	withConfigPath(t, configPath)
	endpoint := "https://panel.example.com"
	account := passAccount(endpoint)
	store := &fakePassStore{values: map[string]string{account: "secret"}}
	restorePassStore(t, store)
	if err := saveConfig(config{
		CurrentEndpoint: endpoint,
		Auths:           map[string]authConfig{endpoint: {Token: passAuthRef(endpoint)}},
		Agents:          map[string]agentConfig{},
	}); err != nil {
		t.Fatal(err)
	}

	if err := runLogout([]string{endpoint}); err != nil {
		t.Fatal(err)
	}
	if _, ok := store.values[account]; ok {
		t.Fatalf("expected pass token to be deleted: %#v", store.values)
	}
}

func TestRunLogoutUsesCurrentEndpointWhenEndpointOmitted(t *testing.T) {
	configPath := filepath.Join(t.TempDir(), ".1panel")
	withConfigPath(t, configPath)
	endpoint := "https://panel.example.com"
	if err := saveConfig(config{
		CurrentEndpoint: endpoint,
		Auths:           map[string]authConfig{endpoint: {Token: "secret"}},
		Agents:          map[string]agentConfig{},
	}); err != nil {
		t.Fatal(err)
	}

	if err := runLogout(nil); err != nil {
		t.Fatal(err)
	}
	cfg, err := loadConfig()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.CurrentEndpoint != "" {
		t.Fatalf("expected current endpoint to be cleared: %s", cfg.CurrentEndpoint)
	}
	if _, ok := cfg.Auths[endpoint]; ok {
		t.Fatalf("expected auth to be deleted: %#v", cfg.Auths)
	}
}

func TestAgentCreateSetsCurrentWhenEmpty(t *testing.T) {
	configPath := filepath.Join(t.TempDir(), "config.json")
	withConfigPath(t, configPath)
	skillsPath := filepath.Join(t.TempDir(), "skills")

	if err := runAgentCreate([]string{"codex", "--skills-path", skillsPath}); err != nil {
		t.Fatal(err)
	}
	cfg, err := loadConfig()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.CurrentAgent != "codex" {
		t.Fatalf("unexpected current agent: %s", cfg.CurrentAgent)
	}
	if cfg.Agents["codex"].SkillsPath != skillsPath {
		t.Fatalf("unexpected skills path: %s", cfg.Agents["codex"].SkillsPath)
	}
}

func TestAgentCreateDoesNotOverrideExistingCurrent(t *testing.T) {
	configPath := filepath.Join(t.TempDir(), "config.json")
	withConfigPath(t, configPath)
	firstPath := filepath.Join(t.TempDir(), "first")
	secondPath := filepath.Join(t.TempDir(), "second")

	if err := runAgentCreate([]string{"codex", "--skills-path", firstPath}); err != nil {
		t.Fatal(err)
	}
	if err := runAgentCreate([]string{"claude", "--skills-path", secondPath}); err != nil {
		t.Fatal(err)
	}
	cfg, err := loadConfig()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.CurrentAgent != "codex" {
		t.Fatalf("unexpected current agent: %s", cfg.CurrentAgent)
	}
}

func TestInstallUsesCurrentEndpointAndAgent(t *testing.T) {
	configPath := filepath.Join(t.TempDir(), "config.json")
	withConfigPath(t, configPath)
	skillsPath := filepath.Join(t.TempDir(), "skills")
	packageBody := zipPayload(t, map[string]string{"SKILL.md": "hello"})

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case panelSkillctlPath + "/skills/demo":
			writeEnvelope(t, w, registryItem{Name: "demo"})
		case panelSkillctlPath + "/skills/demo/download":
			if r.Header.Get("1Panel-Token") == "" || r.Header.Get("1Panel-Timestamp") == "" {
				t.Fatal("missing API key auth headers")
			}
			_, _ = w.Write(packageBody)
		default:
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
	}))
	defer server.Close()

	if err := saveConfig(config{
		CurrentEndpoint: server.URL,
		Auths:           map[string]authConfig{server.URL: {Token: "secret"}},
		CurrentAgent:    "codex",
		Agents:          map[string]agentConfig{"codex": {SkillsPath: skillsPath}},
	}); err != nil {
		t.Fatal(err)
	}
	if err := runInstall([]string{"demo"}); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(skillsPath, "demo", "SKILL.md")); err != nil {
		t.Fatal(err)
	}
}

func TestInstallRejectsPathAndAgentConflict(t *testing.T) {
	_, err := parseInstallArgs([]string{"demo", "--path", "/tmp/a", "--agent", "codex"})
	if err == nil || !strings.Contains(err.Error(), "--path and --agent") {
		t.Fatalf("expected conflict error, got %v", err)
	}
}

func TestRunSearchFiltersAndFormatsSkillctlItems(t *testing.T) {
	configPath := filepath.Join(t.TempDir(), "config.json")
	withConfigPath(t, configPath)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != panelSkillctlPath+"/skills" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if got := r.URL.Query().Get("keyword"); got != "demo" {
			t.Fatalf("unexpected keyword: %s", got)
		}
		if got := r.URL.Query().Get("agentType"); got != "linux" {
			t.Fatalf("unexpected agent type: %s", got)
		}
		if r.Header.Get("1Panel-Token") == "" || r.Header.Get("1Panel-Timestamp") == "" {
			t.Fatal("missing API key auth headers")
		}
		writeEnvelope(t, w, []registryItem{
			{
				Name:            "demo",
				Version:         "1.0.0",
				Description:     "Install demo skill",
				ApplicableAgent: "linux",
				RiskLevel:       "low",
				UpdatedAt:       "2026-06-25T10:00:00Z",
			},
			{
				Name:            "demo-risky",
				Version:         "2.0.0",
				Description:     "Risky demo skill",
				ApplicableAgent: "linux",
				RiskLevel:       "high",
				UpdatedAt:       "2026-06-25T11:00:00Z",
			},
		})
	}))
	defer server.Close()

	if err := saveConfig(config{
		CurrentEndpoint: server.URL,
		Auths:           map[string]authConfig{server.URL: {Token: "secret"}},
		Agents:          map[string]agentConfig{},
	}); err != nil {
		t.Fatal(err)
	}

	output := captureStdout(t, func() {
		if err := runSearch([]string{"demo", "--filter", "agent=linux", "--filter", "risk=low", "--limit", "10"}); err != nil {
			t.Fatal(err)
		}
	})

	if !strings.Contains(output, "NAME") || !strings.Contains(output, "VERSION") || !strings.Contains(output, "RISK") {
		t.Fatalf("missing table header: %s", output)
	}
	if !strings.Contains(output, "demo") || !strings.Contains(output, "1.0.0") || !strings.Contains(output, "Install demo skill") {
		t.Fatalf("missing filtered skill: %s", output)
	}
	if strings.Contains(output, "demo-risky") {
		t.Fatalf("unexpected unfiltered skill: %s", output)
	}
}

func TestRunSearchPrintsNoResults(t *testing.T) {
	configPath := filepath.Join(t.TempDir(), "config.json")
	withConfigPath(t, configPath)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writeEnvelope(t, w, []registryItem{})
	}))
	defer server.Close()

	if err := saveConfig(config{
		CurrentEndpoint: server.URL,
		Auths:           map[string]authConfig{server.URL: {Token: "secret"}},
		Agents:          map[string]agentConfig{},
	}); err != nil {
		t.Fatal(err)
	}

	output := captureStdout(t, func() {
		if err := runSearch([]string{"missing"}); err != nil {
			t.Fatal(err)
		}
	})
	if !strings.Contains(output, "No matching skills found.") {
		t.Fatalf("unexpected no-result output: %s", output)
	}
}

func TestNoEndpointErrorShowsConfigPathAndGenericLoginExample(t *testing.T) {
	configPath := filepath.Join(t.TempDir(), ".1panel")
	withConfigPath(t, configPath)

	err := noEndpointError()
	if err == nil {
		t.Fatal("expected error")
	}
	message := err.Error()
	for _, want := range []string{
		"No 1Panel endpoint configured.",
		"skillctl login https://panel.example.com --token <token>",
		configPath,
	} {
		if !strings.Contains(message, want) {
			t.Fatalf("expected %q in error:\n%s", want, message)
		}
	}
}

func TestNormalizeEndpointSuggestsScheme(t *testing.T) {
	_, err := normalizeEndpoint("panel.example.com")
	if err == nil {
		t.Fatal("expected error")
	}
	message := err.Error()
	for _, want := range []string{
		"Endpoint must start with http:// or https://",
		"skillctl login https://panel.example.com --token <token>",
	} {
		if !strings.Contains(message, want) {
			t.Fatalf("expected %q in error:\n%s", want, message)
		}
	}
}

func TestAuthenticationErrorShowsCommonCauses(t *testing.T) {
	message := authenticationError().Error()
	for _, want := range []string{
		"Token is invalid or expired",
		"Current client IP is not allowed",
		"Server time differs too much",
		"skillctl login https://panel.example.com --token <token>",
	} {
		if !strings.Contains(message, want) {
			t.Fatalf("expected %q in error:\n%s", want, message)
		}
	}
}

func TestApplySearchFilterShowsSupportedFilters(t *testing.T) {
	var filters searchFilters
	err := applySearchFilter(&filters, "status=published")
	if err == nil {
		t.Fatal("expected error")
	}
	message := err.Error()
	for _, want := range []string{
		"Unsupported filter: status",
		"agent=<agent-type>",
		"risk=<low|medium|high>",
		"version=<version>",
	} {
		if !strings.Contains(message, want) {
			t.Fatalf("expected %q in error:\n%s", want, message)
		}
	}
}

func TestRunAgentListEmptyShowsCreateHint(t *testing.T) {
	withConfigPath(t, filepath.Join(t.TempDir(), ".1panel"))
	output := captureStdout(t, func() {
		if err := runAgentList(); err != nil {
			t.Fatal(err)
		}
	})
	for _, want := range []string{
		"No agents configured.",
		"skillctl agent create default --skills-path /path/to/skills",
	} {
		if !strings.Contains(output, want) {
			t.Fatalf("expected %q in output:\n%s", want, output)
		}
	}
}

func TestResolveEndpointTokenShowsPassLoginHintWhenSecretMissing(t *testing.T) {
	endpoint := "https://panel.example.com"
	withConfigPath(t, filepath.Join(t.TempDir(), ".1panel"))
	restorePassStore(t, &fakePassStore{values: map[string]string{}})

	_, _, err := resolveEndpointToken(config{
		CurrentEndpoint: endpoint,
		Auths:           map[string]authConfig{endpoint: {Token: passAuthRef(endpoint)}},
		Agents:          map[string]agentConfig{},
	}, "")
	if err == nil {
		t.Fatal("expected error")
	}
	message := err.Error()
	for _, want := range []string{
		"Credential not found in pass",
		endpoint,
		"skillctl login https://panel.example.com --token <token> --auth-store pass",
	} {
		if !strings.Contains(message, want) {
			t.Fatalf("expected %q in error:\n%s", want, message)
		}
	}
}

func TestRunSearchShowsLatestPublishedVersionByDefault(t *testing.T) {
	configPath := filepath.Join(t.TempDir(), "config.json")
	withConfigPath(t, configPath)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writeEnvelope(t, w, []registryItem{
			{Name: "demo", Version: "1.0.0", UpdatedAt: "2026-06-25T12:00:00Z"},
			{Name: "demo", Version: "1.1.0", UpdatedAt: "2026-06-24T12:00:00Z"},
			{Name: "other", Version: "0.1.0"},
		})
	}))
	defer server.Close()

	if err := saveConfig(config{
		CurrentEndpoint: server.URL,
		Auths:           map[string]authConfig{server.URL: {Token: "secret"}},
		Agents:          map[string]agentConfig{},
	}); err != nil {
		t.Fatal(err)
	}

	output := captureStdout(t, func() {
		if err := runSearch([]string{"demo"}); err != nil {
			t.Fatal(err)
		}
	})

	if strings.Contains(output, "1.0.0") {
		t.Fatalf("expected older demo version to be hidden by default: %s", output)
	}
	if !strings.Contains(output, "1.1.0") {
		t.Fatalf("expected latest demo version: %s", output)
	}
}

func TestRunSearchAllVersionsShowsEveryPublishedVersion(t *testing.T) {
	configPath := filepath.Join(t.TempDir(), "config.json")
	withConfigPath(t, configPath)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writeEnvelope(t, w, []registryItem{
			{Name: "demo", Version: "1.0.0"},
			{Name: "demo", Version: "1.1.0"},
		})
	}))
	defer server.Close()

	if err := saveConfig(config{
		CurrentEndpoint: server.URL,
		Auths:           map[string]authConfig{server.URL: {Token: "secret"}},
		Agents:          map[string]agentConfig{},
	}); err != nil {
		t.Fatal(err)
	}

	output := captureStdout(t, func() {
		if err := runSearch([]string{"demo", "--all-versions"}); err != nil {
			t.Fatal(err)
		}
	})

	if !strings.Contains(output, "1.0.0") || !strings.Contains(output, "1.1.0") {
		t.Fatalf("expected all versions in output: %s", output)
	}
}

func TestFetchRegistryItemNotFoundSuggestsAllVersionsForVersion(t *testing.T) {
	server := httptest.NewServer(http.NotFoundHandler())
	defer server.Close()

	_, err := fetchRegistryItem(server.Client(), server.URL, "secret", "demo", "1.2.0")
	if err == nil {
		t.Fatal("expected error")
	}
	message := err.Error()
	for _, want := range []string{
		"Skill version not found: demo@1.2.0",
		"skillctl search demo --all-versions",
	} {
		if !strings.Contains(message, want) {
			t.Fatalf("expected %q in error:\n%s", want, message)
		}
	}
}

func TestFetchRegistryItemBusinessNotFoundMessageUsesInstallHint(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(responseEnvelope{
			Code:    http.StatusBadRequest,
			Message: "请求参数错误: skill not found: demo",
		})
	}))
	defer server.Close()

	_, err := fetchRegistryItem(server.Client(), server.URL, "secret", "demo", "1.2.0")
	if err == nil {
		t.Fatal("expected error")
	}
	message := err.Error()
	for _, want := range []string{
		"Skill version not found: demo@1.2.0",
		"skillctl search demo --all-versions",
	} {
		if !strings.Contains(message, want) {
			t.Fatalf("expected %q in error:\n%s", want, message)
		}
	}
}

func TestExtractZipRefusesExistingSymlinkFile(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlink behavior requires elevated privileges on Windows")
	}
	root := t.TempDir()
	outside := filepath.Join(t.TempDir(), "outside.txt")
	if err := os.WriteFile(outside, []byte("keep"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(root, "skill")); err != nil {
		t.Fatal(err)
	}

	err := extractZip(zipPayload(t, map[string]string{"skill": "overwrite"}), root)
	if err == nil || !strings.Contains(err.Error(), "Unsupported target file") {
		t.Fatalf("expected symlink target error, got %v", err)
	}
	body, err := os.ReadFile(outside)
	if err != nil {
		t.Fatal(err)
	}
	if string(body) != "keep" {
		t.Fatalf("outside file was modified: %s", string(body))
	}
}

func withConfigPath(t *testing.T, path string) {
	t.Helper()
	t.Setenv("SKILLCTL_CONFIG", path)
}

func writeEnvelope(t *testing.T, w http.ResponseWriter, data interface{}) {
	t.Helper()
	body, err := json.Marshal(data)
	if err != nil {
		t.Fatal(err)
	}
	_ = json.NewEncoder(w).Encode(responseEnvelope{Code: http.StatusOK, Data: body})
}

func zipPayload(t *testing.T, files map[string]string) []byte {
	t.Helper()
	var buf bytes.Buffer
	writer := zip.NewWriter(&buf)
	for name, body := range files {
		entry, err := writer.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := entry.Write([]byte(body)); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

type fakePassStore struct {
	values map[string]string
}

func (s *fakePassStore) Set(account, secret string) error {
	s.values[account] = secret
	return nil
}

func (s *fakePassStore) Get(account string) (string, error) {
	value, ok := s.values[account]
	if !ok {
		return "", errPassSecretNotFound
	}
	return value, nil
}

func (s *fakePassStore) Delete(account string) error {
	if _, ok := s.values[account]; !ok {
		return errPassSecretNotFound
	}
	delete(s.values, account)
	return nil
}

func restorePassStore(t *testing.T, store passStore) {
	t.Helper()
	old := passSecrets
	passSecrets = store
	t.Cleanup(func() {
		passSecrets = old
	})
}

func captureStdout(t *testing.T, fn func()) string {
	t.Helper()
	old := os.Stdout
	reader, writer, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	os.Stdout = writer
	defer func() {
		os.Stdout = old
	}()

	fn()

	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	var buf bytes.Buffer
	if _, err := buf.ReadFrom(reader); err != nil {
		t.Fatal(err)
	}
	return buf.String()
}
