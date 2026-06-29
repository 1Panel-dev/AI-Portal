package main

import (
	"archive/zip"
	"bytes"
	"crypto/md5"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"text/tabwriter"
	"time"
)

const (
	userAgent         = "skillctl/0.2"
	maxDownloadBytes  = 100 << 20
	panelAuthPath     = "/api/v2/core/enterprise/skills-hub/skillctl/whoami"
	panelSkillctlPath = "/api/v2/core/enterprise/skills-hub/skillctl"
	defaultAuthStore  = "file"
	passAuthStore     = "pass"
	passAuthPrefix    = "pass://"
	passServicePrefix = "skillctl/"
	exampleEndpoint   = "https://panel.example.com"
)

var (
	errRegistryEndpointNotFound           = errors.New("registry endpoint not found")
	errInvalidRegistryEndpoint            = errors.New("invalid registry endpoint")
	errAuthenticationFailed               = errors.New("authentication failed")
	errPassSecretNotFound                 = errors.New("pass secret not found")
	passSecrets                 passStore = commandPassStore{}
)

type config struct {
	CurrentEndpoint string                 `json:"currentEndpoint"`
	Auths           map[string]authConfig  `json:"auths"`
	CurrentAgent    string                 `json:"currentAgent"`
	Agents          map[string]agentConfig `json:"agents"`

	Server string `json:"server,omitempty"`
	Token  string `json:"token,omitempty"`
}

type authConfig struct {
	Token string `json:"token"`
}

type passStore interface {
	Set(account, secret string) error
	Get(account string) (string, error)
	Delete(account string) error
}

type commandPassStore struct{}

func (commandPassStore) Set(account, secret string) error {
	cmd := exec.Command("pass", "insert", "-m", account)
	cmd.Stdin = strings.NewReader(secret + "\n")
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("pass insert failed: %s: %w", strings.TrimSpace(string(output)), err)
	}
	return nil
}

func (commandPassStore) Get(account string) (string, error) {
	cmd := exec.Command("pass", "show", account)
	output, err := cmd.Output()
	if err != nil {
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			message := string(exitErr.Stderr)
			if strings.Contains(strings.ToLower(message), "not in the password store") {
				return "", errPassSecretNotFound
			}
		}
		return "", err
	}
	return strings.TrimRight(string(output), "\r\n"), nil
}

func (commandPassStore) Delete(account string) error {
	cmd := exec.Command("pass", "rm", "-f", account)
	if output, err := cmd.CombinedOutput(); err != nil {
		message := strings.ToLower(string(output))
		if strings.Contains(message, "is not in the password store") || strings.Contains(message, "not in the password store") {
			return errPassSecretNotFound
		}
		return fmt.Errorf("pass rm failed: %s: %w", strings.TrimSpace(string(output)), err)
	}
	return nil
}

type agentConfig struct {
	SkillsPath string `json:"skillsPath"`
}

type configOutput struct {
	CurrentEndpoint string                 `json:"currentEndpoint"`
	Auths           map[string]authConfig  `json:"auths"`
	CurrentAgent    string                 `json:"currentAgent"`
	Agents          map[string]agentConfig `json:"agents"`
}

type responseEnvelope struct {
	Code    int             `json:"code"`
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data"`
}

type registryItem struct {
	Name            string `json:"name"`
	Description     string `json:"description"`
	ApplicableAgent string `json:"applicableAgent"`
	Version         string `json:"version"`
	RiskLevel       string `json:"riskLevel"`
	PackageExt      string `json:"packageExt"`
	PackageSize     int64  `json:"packageSize"`
	SHA256          string `json:"sha256"`
	UpdatedAt       string `json:"updatedAt"`
}

type registryIdentity struct {
	User   string `json:"user"`
	Status string `json:"status"`
}

type searchOptions struct {
	Keyword     string
	Endpoint    string
	Limit       int
	NoTrunc     bool
	AllVersions bool
	Filters     searchFilters
}

type searchFilters struct {
	Agent   string
	Risk    string
	Version string
}

type panelCurrentUser struct {
	Name string `json:"name"`
}

type codedError struct {
	kind    error
	message string
}

func (e codedError) Error() string {
	return e.message
}

func (e codedError) Unwrap() error {
	return e.kind
}

func main() {
	if len(os.Args) < 2 {
		printUsage()
		os.Exit(2)
	}

	var err error
	switch os.Args[1] {
	case "login":
		err = runLogin(os.Args[2:])
	case "logout":
		err = runLogout(os.Args[2:])
	case "whoami":
		err = runWhoami(os.Args[2:])
	case "config":
		err = runConfig(os.Args[2:])
	case "agent":
		err = runAgent(os.Args[2:])
	case "search":
		err = runSearch(os.Args[2:])
	case "install":
		err = runInstall(os.Args[2:])
	case "help", "-h", "--help":
		printUsage()
	default:
		err = unknownCommandError(os.Args[1])
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func runLogin(args []string) error {
	endpoint, token, authStore, err := parseLoginArgs(args)
	if err != nil {
		return err
	}
	endpoint, err = normalizeEndpoint(endpoint)
	if err != nil {
		return err
	}
	token = strings.TrimSpace(token)
	if token == "" {
		return errors.New("--token is required")
	}

	canonicalEndpoint, err := validateLogin(endpoint, token)
	if err != nil {
		return err
	}

	cfg, err := loadConfig()
	if err != nil {
		return err
	}
	storedToken, err := storeAuthToken(canonicalEndpoint, token, authStore)
	if err != nil {
		return err
	}
	cfg.CurrentEndpoint = canonicalEndpoint
	cfg.Auths[canonicalEndpoint] = authConfig{Token: storedToken}
	if err := saveConfig(cfg); err != nil {
		return err
	}
	fmt.Printf("Login succeeded. Current endpoint: %s\n", canonicalEndpoint)
	return nil
}

func runLogout(args []string) error {
	cfg, err := loadConfig()
	if err != nil {
		return err
	}
	var endpoint string
	switch len(args) {
	case 0:
		endpoint = strings.TrimSpace(cfg.CurrentEndpoint)
		if endpoint == "" {
			return errors.New("No current endpoint configured.\n\nUsage:\n  skillctl logout <endpoint>\n\nView current endpoint:\n  skillctl config current")
		}
	case 1:
		endpoint = args[0]
	default:
		return errors.New("Usage:\n  skillctl logout [endpoint]")
	}
	endpoint, err = normalizeEndpoint(endpoint)
	if err != nil {
		return err
	}
	if auth, ok := cfg.Auths[endpoint]; ok {
		if err := deleteStoredAuthToken(auth.Token); err != nil {
			return err
		}
	}
	delete(cfg.Auths, endpoint)
	if cfg.CurrentEndpoint == endpoint {
		cfg.CurrentEndpoint = ""
	}
	if err := saveConfig(cfg); err != nil {
		return err
	}
	fmt.Printf("Logout succeeded. Endpoint: %s\n", endpoint)
	return nil
}

func runWhoami(args []string) error {
	endpointOverride, err := parseEndpointOnlyArgs(args)
	if err != nil {
		return err
	}
	cfg, err := loadConfig()
	if err != nil {
		return err
	}
	endpoint, token, err := resolveEndpointToken(cfg, endpointOverride)
	if err != nil {
		return err
	}
	identity, err := fetchWhoami(&http.Client{Timeout: 15 * time.Second}, endpoint, token)
	if err != nil {
		return err
	}
	user := strings.TrimSpace(identity.User)
	if user == "" {
		user = "-"
	}
	status := strings.TrimSpace(identity.Status)
	if status == "" {
		status = "authenticated"
	}
	fmt.Printf("Endpoint: %s\nUser: %s\nStatus: %s\n", endpoint, user, status)
	return nil
}

func runConfig(args []string) error {
	if len(args) == 0 {
		return errors.New("usage: skillctl config <view|current|use>")
	}
	switch args[0] {
	case "view":
		if len(args) != 1 {
			return errors.New("usage: skillctl config view")
		}
		return runConfigView()
	case "current":
		if len(args) != 1 {
			return errors.New("usage: skillctl config current")
		}
		return runConfigCurrent()
	case "use":
		if len(args) != 2 {
			return errors.New("usage: skillctl config use <endpoint>")
		}
		return runConfigUse(args[1])
	default:
		return fmt.Errorf("unknown config command %q", args[0])
	}
}

func runConfigView() error {
	cfg, err := loadConfig()
	if err != nil {
		return err
	}
	output := configOutput{
		CurrentEndpoint: cfg.CurrentEndpoint,
		Auths:           make(map[string]authConfig, len(cfg.Auths)),
		CurrentAgent:    cfg.CurrentAgent,
		Agents:          cfg.Agents,
	}
	for endpoint, auth := range cfg.Auths {
		if strings.TrimSpace(auth.Token) == "" {
			output.Auths[endpoint] = authConfig{}
			continue
		}
		output.Auths[endpoint] = authConfig{Token: "******"}
	}
	body, err := json.MarshalIndent(output, "", "  ")
	if err != nil {
		return err
	}
	fmt.Println(string(body))
	return nil
}

func runConfigCurrent() error {
	cfg, err := loadConfig()
	if err != nil {
		return err
	}
	endpoint := cfg.CurrentEndpoint
	if endpoint == "" {
		endpoint = "-"
	}
	agent := cfg.CurrentAgent
	skillsPath := "-"
	if agent == "" {
		agent = "-"
	} else if item, ok := cfg.Agents[cfg.CurrentAgent]; ok && strings.TrimSpace(item.SkillsPath) != "" {
		skillsPath = item.SkillsPath
	}
	fmt.Printf("Current endpoint: %s\nCurrent agent: %s\nSkills path: %s\n", endpoint, agent, skillsPath)
	if cfg.CurrentEndpoint == "" || cfg.CurrentAgent == "" {
		fmt.Printf("\nNext steps:\n  skillctl login %s --token <token>\n  skillctl agent create default --skills-path /path/to/skills\n", exampleEndpoint)
	}
	return nil
}

func runConfigUse(endpoint string) error {
	endpoint, err := normalizeEndpoint(endpoint)
	if err != nil {
		return err
	}
	cfg, err := loadConfig()
	if err != nil {
		return err
	}
	if strings.TrimSpace(cfg.Auths[endpoint].Token) == "" {
		return noTokenError(endpoint)
	}
	cfg.CurrentEndpoint = endpoint
	if err := saveConfig(cfg); err != nil {
		return err
	}
	fmt.Printf("Current endpoint: %s\n", endpoint)
	return nil
}

func runAgent(args []string) error {
	if len(args) == 0 {
		return errors.New("usage: skillctl agent <create|list|use|current>")
	}
	switch args[0] {
	case "create":
		return runAgentCreate(args[1:])
	case "list":
		if len(args) != 1 {
			return errors.New("usage: skillctl agent list")
		}
		return runAgentList()
	case "use":
		if len(args) != 2 {
			return errors.New("usage: skillctl agent use <agent-name>")
		}
		return runAgentUse(args[1])
	case "current":
		if len(args) != 1 {
			return errors.New("usage: skillctl agent current")
		}
		return runAgentCurrent()
	default:
		return fmt.Errorf("unknown agent command %q", args[0])
	}
}

func runAgentCreate(args []string) error {
	name, skillsPath, err := parseAgentCreateArgs(args)
	if err != nil {
		return err
	}
	if err := validateAgentName(name); err != nil {
		return err
	}
	skillsPath, err = normalizeSkillsPath(skillsPath)
	if err != nil {
		return err
	}
	cfg, err := loadConfig()
	if err != nil {
		return err
	}
	cfg.Agents[name] = agentConfig{SkillsPath: skillsPath}
	setCurrent := strings.TrimSpace(cfg.CurrentAgent) == ""
	if setCurrent {
		cfg.CurrentAgent = name
	}
	if err := saveConfig(cfg); err != nil {
		return err
	}
	fmt.Printf("Agent created.\nName: %s\nSkills path: %s\n", name, skillsPath)
	if setCurrent {
		fmt.Printf("Current agent: %s\n", name)
	}
	return nil
}

func runAgentList() error {
	cfg, err := loadConfig()
	if err != nil {
		return err
	}
	if len(cfg.Agents) == 0 {
		fmt.Println("No agents configured.\n\nCreate one:\n  skillctl agent create default --skills-path /path/to/skills")
		return nil
	}
	writer := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	_, _ = fmt.Fprintln(writer, "NAME\tSKILLS PATH")
	names := make([]string, 0, len(cfg.Agents))
	for name := range cfg.Agents {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		display := name
		if name == cfg.CurrentAgent {
			display = "* " + name
		}
		_, _ = fmt.Fprintf(writer, "%s\t%s\n", display, cfg.Agents[name].SkillsPath)
	}
	return writer.Flush()
}

func runAgentUse(name string) error {
	name = strings.TrimSpace(name)
	if err := validateAgentName(name); err != nil {
		return err
	}
	cfg, err := loadConfig()
	if err != nil {
		return err
	}
	if _, ok := cfg.Agents[name]; !ok {
		return agentNotFoundError(name)
	}
	cfg.CurrentAgent = name
	if err := saveConfig(cfg); err != nil {
		return err
	}
	fmt.Printf("Current agent: %s\n", name)
	return nil
}

func runAgentCurrent() error {
	cfg, err := loadConfig()
	if err != nil {
		return err
	}
	name := strings.TrimSpace(cfg.CurrentAgent)
	if name == "" {
		return noTargetAgentError()
	}
	item, ok := cfg.Agents[name]
	if !ok {
		return agentNotFoundError(name)
	}
	fmt.Printf("Current agent: %s\nSkills path: %s\n", name, item.SkillsPath)
	return nil
}

func runSearch(args []string) error {
	opts, err := parseSearchArgs(args)
	if err != nil {
		return err
	}
	cfg, err := loadConfig()
	if err != nil {
		return err
	}
	endpoint, token, err := resolveEndpointToken(cfg, opts.Endpoint)
	if err != nil {
		return err
	}
	items, err := fetchRegistryItems(&http.Client{Timeout: 30 * time.Second}, endpoint, token, opts.Keyword, opts.Filters.Agent, opts.AllVersions)
	if err != nil {
		return err
	}
	items = filterRegistryItems(items, opts.Filters)
	if !opts.AllVersions {
		items = latestRegistryItemsByName(items)
	}
	if opts.Limit > 0 && len(items) > opts.Limit {
		items = items[:opts.Limit]
	}
	printSearchResults(items, opts.Keyword, opts.NoTrunc)
	return nil
}

func runInstall(args []string) error {
	opts, err := parseInstallArgs(args)
	if err != nil {
		return err
	}
	name, version, err := parseSkillSpec(opts.Spec)
	if err != nil {
		return err
	}
	cfg, err := loadConfig()
	if err != nil {
		return err
	}
	endpoint, token, err := resolveEndpointToken(cfg, opts.Endpoint)
	if err != nil {
		return err
	}
	skillsPath, agentName, err := resolveInstallTarget(cfg, opts)
	if err != nil {
		return err
	}

	client := &http.Client{Timeout: 60 * time.Second}
	item, err := fetchRegistryItem(client, endpoint, token, name, version)
	if err != nil {
		return err
	}
	skillName := strings.TrimSpace(item.Name)
	if skillName == "" {
		skillName = name
	}
	if err := validateSkillDirName(skillName); err != nil {
		return err
	}
	targetPath := filepath.Join(skillsPath, skillName)
	if exists(targetPath) && !opts.Force {
		return skillAlreadyExistsError(targetPath, opts.Spec, opts.Agent, opts.Path)
	}

	data, err := downloadSkillPackage(client, endpoint, token, name, version)
	if err != nil {
		return err
	}
	if item.SHA256 != "" {
		if err := verifySHA256(data, item.SHA256); err != nil {
			return err
		}
	}
	if err := installSkillPackage(data, skillsPath, skillName, opts.Force); err != nil {
		if isPermissionError(err) {
			return fmt.Errorf("Permission denied: %s\nPlease check directory permissions or run with proper privileges.", skillsPath)
		}
		return err
	}

	if agentName == "" {
		agentName = "-"
	}
	fmt.Printf("Skill installed successfully.\nSkill: %s\nVersion: %s\nAgent: %s\nPath: %s\nEndpoint: %s\n", skillName, valueOrDash(item.Version), agentName, targetPath, endpoint)
	return nil
}

type installOptions struct {
	Spec     string
	Endpoint string
	Agent    string
	Path     string
	Force    bool
}

func parseLoginArgs(args []string) (string, string, string, error) {
	var endpoint, token string
	authStore := defaultAuthStore
	for i := 0; i < len(args); i++ {
		arg := args[i]
		switch {
		case arg == "--token" || arg == "-t":
			i++
			if i >= len(args) {
				return "", "", "", errors.New("--token requires a value")
			}
			token = args[i]
		case strings.HasPrefix(arg, "--token="):
			token = strings.TrimPrefix(arg, "--token=")
		case arg == "--auth-store":
			i++
			if i >= len(args) {
				return "", "", "", errors.New("--auth-store requires a value")
			}
			authStore = args[i]
		case strings.HasPrefix(arg, "--auth-store="):
			authStore = strings.TrimPrefix(arg, "--auth-store=")
		case strings.HasPrefix(arg, "-"):
			return "", "", "", fmt.Errorf("unknown option %s", arg)
		default:
			if endpoint != "" {
				return "", "", "", fmt.Errorf("unexpected argument %s", arg)
			}
			endpoint = arg
		}
	}
	if strings.TrimSpace(endpoint) == "" {
		return "", "", "", missingArgumentError("endpoint", fmt.Sprintf("skillctl login %s --token <token>", exampleEndpoint))
	}
	authStore = strings.ToLower(strings.TrimSpace(authStore))
	if authStore != defaultAuthStore && authStore != passAuthStore {
		return "", "", "", fmt.Errorf("Unsupported auth store: %s\n\nSupported auth stores:\n  file\n  pass", authStore)
	}
	return endpoint, token, authStore, nil
}

func parseEndpointOnlyArgs(args []string) (string, error) {
	var endpoint string
	for i := 0; i < len(args); i++ {
		arg := args[i]
		switch {
		case arg == "--endpoint":
			i++
			if i >= len(args) {
				return "", errors.New("--endpoint requires a value")
			}
			endpoint = args[i]
		case strings.HasPrefix(arg, "--endpoint="):
			endpoint = strings.TrimPrefix(arg, "--endpoint=")
		default:
			return "", fmt.Errorf("unknown option %s", arg)
		}
	}
	return endpoint, nil
}

func parseAgentCreateArgs(args []string) (string, string, error) {
	var name, skillsPath string
	for i := 0; i < len(args); i++ {
		arg := args[i]
		switch {
		case arg == "--skills-path":
			i++
			if i >= len(args) {
				return "", "", errors.New("--skills-path requires a value")
			}
			skillsPath = args[i]
		case strings.HasPrefix(arg, "--skills-path="):
			skillsPath = strings.TrimPrefix(arg, "--skills-path=")
		case strings.HasPrefix(arg, "-"):
			return "", "", fmt.Errorf("unknown option %s", arg)
		default:
			if name != "" {
				return "", "", fmt.Errorf("unexpected argument %s", arg)
			}
			name = arg
		}
	}
	if strings.TrimSpace(name) == "" {
		return "", "", missingArgumentError("agent name", "skillctl agent create default --skills-path /path/to/skills")
	}
	if strings.TrimSpace(skillsPath) == "" {
		return "", "", missingArgumentError("--skills-path", "skillctl agent create default --skills-path /path/to/skills")
	}
	return name, skillsPath, nil
}

func parseInstallArgs(args []string) (installOptions, error) {
	var opts installOptions
	for i := 0; i < len(args); i++ {
		arg := args[i]
		switch {
		case arg == "--endpoint":
			i++
			if i >= len(args) {
				return opts, errors.New("--endpoint requires a value")
			}
			opts.Endpoint = args[i]
		case strings.HasPrefix(arg, "--endpoint="):
			opts.Endpoint = strings.TrimPrefix(arg, "--endpoint=")
		case arg == "--agent":
			i++
			if i >= len(args) {
				return opts, errors.New("--agent requires a value")
			}
			opts.Agent = args[i]
		case strings.HasPrefix(arg, "--agent="):
			opts.Agent = strings.TrimPrefix(arg, "--agent=")
		case arg == "--path" || arg == "--dir":
			i++
			if i >= len(args) {
				return opts, fmt.Errorf("%s requires a value", arg)
			}
			opts.Path = args[i]
		case strings.HasPrefix(arg, "--path="):
			opts.Path = strings.TrimPrefix(arg, "--path=")
		case strings.HasPrefix(arg, "--dir="):
			opts.Path = strings.TrimPrefix(arg, "--dir=")
		case arg == "--force" || arg == "-f":
			opts.Force = true
		case strings.HasPrefix(arg, "-"):
			return opts, fmt.Errorf("unknown option %s", arg)
		default:
			if opts.Spec != "" {
				return opts, fmt.Errorf("unexpected argument %s", arg)
			}
			opts.Spec = arg
		}
	}
	if strings.TrimSpace(opts.Spec) == "" {
		return opts, missingArgumentError("skill name", "skillctl install <skill-name>")
	}
	if strings.TrimSpace(opts.Path) != "" && strings.TrimSpace(opts.Agent) != "" {
		return opts, errors.New("Conflicting options: --path and --agent cannot be used together.\n\nUse one of:\n  skillctl install <skill-name> --agent <agent-name>\n  skillctl install <skill-name> --path /path/to/skills")
	}
	return opts, nil
}

func parseSearchArgs(args []string) (searchOptions, error) {
	opts := searchOptions{Limit: 25}
	for i := 0; i < len(args); i++ {
		arg := args[i]
		switch {
		case arg == "--endpoint":
			i++
			if i >= len(args) {
				return searchOptions{}, errors.New("--endpoint requires a value")
			}
			opts.Endpoint = args[i]
		case strings.HasPrefix(arg, "--endpoint="):
			opts.Endpoint = strings.TrimPrefix(arg, "--endpoint=")
		case arg == "--limit" || arg == "-n":
			i++
			if i >= len(args) {
				return searchOptions{}, fmt.Errorf("%s requires a value", arg)
			}
			limit, err := strconv.Atoi(args[i])
			if err != nil || limit < 1 {
				return searchOptions{}, invalidLimitError(args[i])
			}
			opts.Limit = limit
		case strings.HasPrefix(arg, "--limit="):
			limit, err := strconv.Atoi(strings.TrimPrefix(arg, "--limit="))
			if err != nil || limit < 1 {
				return searchOptions{}, invalidLimitError(strings.TrimPrefix(arg, "--limit="))
			}
			opts.Limit = limit
		case arg == "--filter" || arg == "-f":
			i++
			if i >= len(args) {
				return searchOptions{}, fmt.Errorf("%s requires a value", arg)
			}
			if err := applySearchFilter(&opts.Filters, args[i]); err != nil {
				return searchOptions{}, err
			}
		case strings.HasPrefix(arg, "--filter="):
			if err := applySearchFilter(&opts.Filters, strings.TrimPrefix(arg, "--filter=")); err != nil {
				return searchOptions{}, err
			}
		case arg == "--no-trunc":
			opts.NoTrunc = true
		case arg == "--all-versions":
			opts.AllVersions = true
		case strings.HasPrefix(arg, "-"):
			return searchOptions{}, fmt.Errorf("unknown option %s", arg)
		default:
			if opts.Keyword != "" {
				return searchOptions{}, fmt.Errorf("unexpected argument %s", arg)
			}
			opts.Keyword = arg
		}
	}
	return opts, nil
}

func applySearchFilter(filters *searchFilters, value string) error {
	key, filterValue, ok := strings.Cut(value, "=")
	if !ok || strings.TrimSpace(key) == "" {
		return fmt.Errorf("Invalid filter: %s\n\nExpected format:\n  key=value\n\nSupported filters:\n%s", value, supportedSearchFiltersText())
	}
	filterValue = strings.TrimSpace(filterValue)
	switch strings.ToLower(strings.TrimSpace(key)) {
	case "agent", "agenttype":
		filters.Agent = filterValue
	case "risk":
		filters.Risk = filterValue
	case "version":
		filters.Version = filterValue
	default:
		return fmt.Errorf("Unsupported filter: %s\n\nSupported filters:\n%s", key, supportedSearchFiltersText())
	}
	return nil
}

func parseSkillSpec(spec string) (string, string, error) {
	spec = strings.TrimSpace(spec)
	if spec == "" {
		return "", "", missingArgumentError("skill name", "skillctl install <skill-name>")
	}
	name := spec
	version := ""
	if index := strings.LastIndex(spec, "@"); index > 0 {
		name = spec[:index]
		version = spec[index+1:]
	}
	if strings.TrimSpace(name) == "" {
		return "", "", missingArgumentError("skill name", "skillctl install <skill-name>")
	}
	if strings.ContainsAny(name, `/\`) {
		return "", "", errors.New("Skill name cannot contain path separators.\n\nUse a skill name from:\n  skillctl search")
	}
	if strings.ContainsAny(version, `/\`) {
		return "", "", errors.New("Skill version cannot contain path separators.\n\nExample:\n  skillctl install demo@1.2.0")
	}
	return name, version, nil
}

func normalizeEndpoint(endpoint string) (string, error) {
	endpoint = strings.TrimRight(strings.TrimSpace(endpoint), "/")
	if endpoint == "" {
		return "", missingArgumentError("endpoint", fmt.Sprintf("skillctl login %s --token <token>", exampleEndpoint))
	}
	parsed, err := url.Parse(endpoint)
	if err != nil {
		return "", fmt.Errorf("Invalid endpoint: %s\n\n%s", endpoint, endpointFormatHint())
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return "", fmt.Errorf("Invalid endpoint: %s\n\n%s", endpoint, endpointFormatHint())
	}
	if parsed.Host == "" {
		return "", fmt.Errorf("Invalid endpoint: %s\n\nEndpoint host is required.\n\nExample:\n  skillctl login %s --token <token>", endpoint, exampleEndpoint)
	}
	return endpoint, nil
}

func normalizeSkillsPath(value string) (string, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return "", missingArgumentError("skills path", "skillctl agent create default --skills-path /path/to/skills")
	}
	if value == "~" || strings.HasPrefix(value, "~/") {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		if value == "~" {
			value = home
		} else {
			value = filepath.Join(home, strings.TrimPrefix(value, "~/"))
		}
	}
	abs, err := filepath.Abs(value)
	if err != nil {
		return "", err
	}
	root := filepath.VolumeName(abs) + string(os.PathSeparator)
	if filepath.Clean(abs) == root {
		return "", errors.New("Skills path cannot be the filesystem root.\n\nChoose a dedicated skills directory, for example:\n  /opt/agent/skills")
	}
	return filepath.Clean(abs), nil
}

func validateAgentName(name string) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return missingArgumentError("agent name", "skillctl agent create default --skills-path /path/to/skills")
	}
	if name == "." || name == ".." || strings.ContainsAny(name, `/\`) {
		return fmt.Errorf("Invalid agent name: %s\n\nAgent name cannot be '.', '..', or contain path separators.", name)
	}
	return nil
}

func validateSkillDirName(name string) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return missingArgumentError("skill name", "skillctl install <skill-name>")
	}
	if name == "." || name == ".." || filepath.IsAbs(name) || strings.ContainsAny(name, `/\`) {
		return fmt.Errorf("Invalid skill name: %s\n\nSkill name cannot be '.', '..', an absolute path, or contain path separators.", name)
	}
	return nil
}

func emptyConfig() config {
	return config{
		Auths:  map[string]authConfig{},
		Agents: map[string]agentConfig{},
	}
}

func loadConfig() (config, error) {
	cfg := emptyConfig()
	path, ok, err := configPathForRead()
	if err != nil {
		return cfg, err
	}
	if !ok {
		return cfg, nil
	}
	body, err := os.ReadFile(path)
	if err != nil {
		return cfg, err
	}
	if len(bytes.TrimSpace(body)) == 0 {
		return cfg, nil
	}
	if err := json.Unmarshal(body, &cfg); err != nil {
		return cfg, err
	}
	normalizeLoadedConfig(&cfg)
	return cfg, nil
}

func normalizeLoadedConfig(cfg *config) {
	if cfg.Auths == nil {
		cfg.Auths = map[string]authConfig{}
	}
	if cfg.Agents == nil {
		cfg.Agents = map[string]agentConfig{}
	}
	if cfg.CurrentEndpoint == "" && strings.TrimSpace(cfg.Server) != "" && strings.TrimSpace(cfg.Token) != "" {
		endpoint, err := normalizeEndpoint(cfg.Server)
		if err != nil {
			endpoint = strings.TrimRight(strings.TrimSpace(cfg.Server), "/")
		}
		cfg.CurrentEndpoint = endpoint
		cfg.Auths[endpoint] = authConfig{Token: strings.TrimSpace(cfg.Token)}
	}
}

func saveConfig(cfg config) error {
	normalizeLoadedConfig(&cfg)
	path, err := configPathForWrite()
	if err != nil {
		return err
	}
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}
	_ = os.Chmod(dir, 0700)
	output := configOutput{
		CurrentEndpoint: cfg.CurrentEndpoint,
		Auths:           cfg.Auths,
		CurrentAgent:    cfg.CurrentAgent,
		Agents:          cfg.Agents,
	}
	body, err := json.MarshalIndent(output, "", "  ")
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, append(body, '\n'), 0600); err != nil {
		return err
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return os.Chmod(path, 0600)
}

func configPathForRead() (string, bool, error) {
	if value := strings.TrimSpace(os.Getenv("SKILLCTL_CONFIG")); value != "" {
		_, err := os.Stat(value)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				return value, false, nil
			}
			return "", false, err
		}
		return value, true, nil
	}
	primary, err := defaultConfigPath()
	if err != nil {
		return "", false, err
	}
	if _, err := os.Stat(primary); err == nil {
		return primary, true, nil
	} else if err != nil && !errors.Is(err, os.ErrNotExist) {
		return "", false, err
	}
	legacy, err := legacyConfigPath()
	if err != nil {
		return "", false, err
	}
	if _, err := os.Stat(legacy); err == nil {
		return legacy, true, nil
	} else if err != nil && !errors.Is(err, os.ErrNotExist) {
		return "", false, err
	}
	return primary, false, nil
}

func configPathForWrite() (string, error) {
	if value := strings.TrimSpace(os.Getenv("SKILLCTL_CONFIG")); value != "" {
		return value, nil
	}
	return defaultConfigPath()
}

func defaultConfigPath() (string, error) {
	if runtime.GOOS == "windows" {
		if appData := strings.TrimSpace(os.Getenv("APPDATA")); appData != "" {
			return filepath.Join(appData, "skillctl", "config.json"), nil
		}
	}
	if xdg := strings.TrimSpace(os.Getenv("XDG_CONFIG_HOME")); xdg != "" {
		return filepath.Join(xdg, "skillctl", "config.json"), nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".config", "skillctl", "config.json"), nil
}

func legacyConfigPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".skillctl", "config.json"), nil
}

func resolveEndpointToken(cfg config, override string) (string, string, error) {
	endpoint := strings.TrimSpace(override)
	if endpoint == "" {
		endpoint = strings.TrimSpace(cfg.CurrentEndpoint)
	}
	if endpoint == "" {
		return "", "", noEndpointError()
	}
	var err error
	endpoint, err = normalizeEndpoint(endpoint)
	if err != nil {
		return "", "", err
	}
	token := strings.TrimSpace(cfg.Auths[endpoint].Token)
	if token == "" {
		return "", "", noTokenError(endpoint)
	}
	token, err = resolveStoredAuthToken(endpoint, token)
	if err != nil {
		return "", "", err
	}
	return endpoint, token, nil
}

func storeAuthToken(endpoint, token, authStore string) (string, error) {
	switch authStore {
	case defaultAuthStore:
		return encodeAuthToken(token), nil
	case passAuthStore:
		account := passAccount(endpoint)
		if err := passSecrets.Set(account, token); err != nil {
			return "", passStoreUnavailableError(err)
		}
		return passAuthRef(endpoint), nil
	default:
		return "", fmt.Errorf("unsupported auth store %q", authStore)
	}
}

func resolveStoredAuthToken(endpoint, token string) (string, error) {
	token = strings.TrimSpace(token)
	if account, ok := passAccountFromRef(token); ok {
		secret, err := passSecrets.Get(account)
		if err != nil {
			if errors.Is(err, errPassSecretNotFound) {
				return "", passCredentialNotFoundError(endpoint)
			}
			return "", passStoreUnavailableError(err)
		}
		return secret, nil
	}
	if decoded, err := decodeAuthToken(token); err == nil {
		return decoded, nil
	}
	return token, nil
}

func deleteStoredAuthToken(token string) error {
	account, ok := passAccountFromRef(token)
	if !ok {
		return nil
	}
	if err := passSecrets.Delete(account); err != nil && !errors.Is(err, errPassSecretNotFound) {
		return err
	}
	return nil
}

func encodeAuthToken(token string) string {
	return base64.StdEncoding.EncodeToString([]byte(token))
}

func decodeAuthToken(token string) (string, error) {
	body, err := base64.StdEncoding.DecodeString(strings.TrimSpace(token))
	if err != nil {
		return "", err
	}
	return string(body), nil
}

func passAuthRef(endpoint string) string {
	return passAuthPrefix + passAccount(endpoint)
}

func passAccount(endpoint string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(endpoint)))
	return passServicePrefix + hex.EncodeToString(sum[:])
}

func passAccountFromRef(value string) (string, bool) {
	value = strings.TrimSpace(value)
	if !strings.HasPrefix(value, passAuthPrefix) {
		return "", false
	}
	account := strings.TrimPrefix(value, passAuthPrefix)
	return account, account != ""
}

func resolveInstallTarget(cfg config, opts installOptions) (string, string, error) {
	if strings.TrimSpace(opts.Path) != "" {
		skillsPath, err := normalizeSkillsPath(opts.Path)
		return skillsPath, "", err
	}
	agentName := strings.TrimSpace(opts.Agent)
	if agentName == "" {
		agentName = strings.TrimSpace(cfg.CurrentAgent)
	}
	if agentName == "" {
		return "", "", noTargetAgentError()
	}
	if err := validateAgentName(agentName); err != nil {
		return "", "", err
	}
	agent, ok := cfg.Agents[agentName]
	if !ok || strings.TrimSpace(agent.SkillsPath) == "" {
		return "", "", agentNotFoundError(agentName)
	}
	skillsPath, err := normalizeSkillsPath(agent.SkillsPath)
	if err != nil {
		return "", "", err
	}
	return skillsPath, agentName, nil
}

func validateLogin(endpoint, token string) (string, error) {
	client := &http.Client{Timeout: 15 * time.Second}
	if _, err := fetchWhoami(client, endpoint, token); err != nil {
		return "", fmt.Errorf("Login validation failed.\n\n%s", err)
	}
	return endpoint, nil
}

func fetchWhoami(client *http.Client, endpoint, token string) (registryIdentity, error) {
	var user panelCurrentUser
	err := panelGetJSON(client, endpoint, token, panelAuthPath, nil, &user)
	if err != nil {
		return registryIdentity{}, err
	}
	name := strings.TrimSpace(user.Name)
	if name == "" {
		name = "-"
	}
	return registryIdentity{User: name, Status: "authenticated"}, nil
}

func fetchRegistryItem(client *http.Client, endpoint, token, name, version string) (registryItem, error) {
	var item registryItem
	query := url.Values{}
	if strings.TrimSpace(version) != "" {
		query.Set("version", version)
	}
	if err := registryGetJSON(client, endpoint, token, "/skills/"+url.PathEscape(name), query, &item); err != nil {
		if errors.Is(err, errRegistryEndpointNotFound) || isSkillNotFoundError(err) {
			return registryItem{}, skillNotFoundError(name, version)
		}
		return registryItem{}, err
	}
	return item, nil
}

func fetchRegistryItems(client *http.Client, endpoint, token, keyword, agentType string, allVersions bool) ([]registryItem, error) {
	var items []registryItem
	query := url.Values{}
	if strings.TrimSpace(keyword) != "" {
		query.Set("keyword", strings.TrimSpace(keyword))
	}
	if strings.TrimSpace(agentType) != "" {
		query.Set("agentType", strings.TrimSpace(agentType))
	}
	if allVersions {
		query.Set("allVersions", "true")
	}
	if err := registryGetJSON(client, endpoint, token, "/skills", query, &items); err != nil {
		return nil, err
	}
	return items, nil
}

func panelGetJSON(client *http.Client, endpoint, token, apiPath string, query url.Values, target interface{}) error {
	var lastErr error
	for _, requestURL := range panelAPIURLCandidates(endpoint, apiPath, query) {
		body, err := registryRawGet(client, requestURL, token)
		if err != nil {
			if errors.Is(err, errRegistryEndpointNotFound) || errors.Is(err, errInvalidRegistryEndpoint) {
				lastErr = err
				continue
			}
			return err
		}
		if err := decodeEnvelope(body, target); err != nil {
			if errors.Is(err, errInvalidRegistryEndpoint) {
				lastErr = err
				continue
			}
			return err
		}
		return nil
	}
	if lastErr != nil {
		return lastErr
	}
	return errRegistryEndpointNotFound
}

func downloadSkillPackage(client *http.Client, endpoint, token, name, version string) ([]byte, error) {
	query := url.Values{}
	if strings.TrimSpace(version) != "" {
		query.Set("version", version)
	}
	var lastErr error
	for _, base := range registryBaseCandidates(endpoint) {
		requestURL, err := registryURL(base, "/skills/"+url.PathEscape(name)+"/download", query)
		if err != nil {
			return nil, err
		}
		body, err := registryRawGet(client, requestURL, token)
		if err != nil {
			if errors.Is(err, errRegistryEndpointNotFound) || errors.Is(err, errInvalidRegistryEndpoint) {
				lastErr = err
				continue
			}
			return nil, err
		}
		if envelopeErr := decodeEnvelopeError(body); envelopeErr != nil {
			return nil, envelopeErr
		}
		return body, nil
	}
	if lastErr != nil {
		if errors.Is(lastErr, errRegistryEndpointNotFound) {
			return nil, skillNotFoundError(name, version)
		}
		return nil, lastErr
	}
	return nil, errors.New("download failed")
}

func registryGetJSON(client *http.Client, endpoint, token, apiPath string, query url.Values, target interface{}) error {
	var lastErr error
	for _, base := range registryBaseCandidates(endpoint) {
		requestURL, err := registryURL(base, apiPath, query)
		if err != nil {
			return err
		}
		body, err := registryRawGet(client, requestURL, token)
		if err != nil {
			if errors.Is(err, errRegistryEndpointNotFound) || errors.Is(err, errInvalidRegistryEndpoint) {
				lastErr = err
				continue
			}
			return err
		}
		if err := decodeEnvelope(body, target); err != nil {
			if errors.Is(err, errInvalidRegistryEndpoint) {
				lastErr = err
				continue
			}
			return err
		}
		return nil
	}
	if lastErr != nil {
		return lastErr
	}
	return errRegistryEndpointNotFound
}

func registryRawGet(client *http.Client, endpoint, token string) ([]byte, error) {
	req, err := http.NewRequest(http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	signPanelRequest(req, token)
	req.Header.Set("User-Agent", userAgent)
	resp, err := client.Do(req)
	if err != nil {
		return nil, connectionError(endpoint, err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxDownloadBytes+1))
	if err != nil {
		return nil, err
	}
	if len(body) > maxDownloadBytes {
		return nil, fmt.Errorf("Skill package is too large.\n\nLimit:\n  %d MB\n\nPlease reduce the package size or ask the administrator to increase the CLI limit.", maxDownloadBytes>>20)
	}
	if resp.StatusCode == http.StatusNotFound {
		return nil, codedError{kind: errRegistryEndpointNotFound, message: "registry endpoint not found"}
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		if envelopeErr := decodeEnvelopeError(body); envelopeErr != nil {
			return nil, envelopeErr
		}
		return nil, fmt.Errorf("request failed with status %s", resp.Status)
	}
	return body, nil
}

func signPanelRequest(req *http.Request, token string) {
	timestamp := fmt.Sprintf("%d", time.Now().Unix())
	sum := md5.Sum([]byte("1panel" + token + timestamp))
	req.Header.Set("1Panel-Token", hex.EncodeToString(sum[:]))
	req.Header.Set("1Panel-Timestamp", timestamp)
}

func registryBaseCandidates(endpoint string) []string {
	endpoint = strings.TrimRight(strings.TrimSpace(endpoint), "/")
	parsed, err := url.Parse(endpoint)
	if err != nil {
		return []string{}
	}
	cleanPath := strings.TrimRight(parsed.Path, "/")
	switch cleanPath {
	case "", "/":
		parsed.Path = panelSkillctlPath
	case "/api/v2":
		parsed.Path = panelSkillctlPath
	case "/api/v2/core/enterprise/skills-hub":
		parsed.Path = panelSkillctlPath
	case panelSkillctlPath:
	default:
		parsed.Path = strings.TrimRight(cleanPath, "/") + panelSkillctlPath
	}
	return []string{strings.TrimRight(parsed.String(), "/")}
}

func panelAPIURLCandidates(endpoint, apiPath string, query url.Values) []string {
	endpoint = strings.TrimRight(strings.TrimSpace(endpoint), "/")
	parsed, err := url.Parse(endpoint)
	if err != nil {
		return []string{}
	}
	cleanPath := strings.TrimRight(parsed.Path, "/")
	switch {
	case cleanPath == "" || cleanPath == "/" || cleanPath == "/api/v2" || strings.HasPrefix(cleanPath, "/api/v2/core/"):
		parsed.Path = apiPath
	default:
		parsed.Path = strings.TrimRight(cleanPath, "/") + "/" + strings.TrimLeft(apiPath, "/")
	}
	if query != nil {
		parsed.RawQuery = query.Encode()
	}
	return []string{parsed.String()}
}

func registryURL(base, apiPath string, query url.Values) (string, error) {
	parsed, err := url.Parse(base)
	if err != nil {
		return "", err
	}
	parsed.Path = strings.TrimRight(parsed.Path, "/") + "/" + strings.TrimLeft(apiPath, "/")
	if query != nil {
		parsed.RawQuery = query.Encode()
	}
	return parsed.String(), nil
}

func filterRegistryItems(items []registryItem, filters searchFilters) []registryItem {
	result := make([]registryItem, 0, len(items))
	for _, item := range items {
		if filters.Agent != "" && !strings.EqualFold(item.ApplicableAgent, filters.Agent) {
			continue
		}
		if filters.Risk != "" && !strings.EqualFold(item.RiskLevel, filters.Risk) {
			continue
		}
		if filters.Version != "" && !strings.EqualFold(item.Version, filters.Version) {
			continue
		}
		result = append(result, item)
	}
	return result
}

func latestRegistryItemsByName(items []registryItem) []registryItem {
	latestByName := make(map[string]registryItem, len(items))
	names := make([]string, 0, len(items))
	for _, item := range items {
		name := strings.TrimSpace(item.Name)
		if name == "" {
			name = item.Name
		}
		current, ok := latestByName[name]
		if !ok {
			latestByName[name] = item
			names = append(names, name)
			continue
		}
		if registryItemNewer(item, current) {
			latestByName[name] = item
		}
	}
	sort.Strings(names)
	result := make([]registryItem, 0, len(names))
	for _, name := range names {
		result = append(result, latestByName[name])
	}
	return result
}

func registryItemNewer(left, right registryItem) bool {
	leftVersion := parseRegistryVersion(left.Version)
	rightVersion := parseRegistryVersion(right.Version)
	if leftVersion.valid && rightVersion.valid {
		if cmp := compareRegistryParsedVersion(leftVersion, rightVersion); cmp != 0 {
			return cmp > 0
		}
	} else if leftVersion.valid != rightVersion.valid {
		return leftVersion.valid
	}
	leftTime, leftOK := parseRegistryTime(left.UpdatedAt)
	rightTime, rightOK := parseRegistryTime(right.UpdatedAt)
	if leftOK && rightOK && !leftTime.Equal(rightTime) {
		return leftTime.After(rightTime)
	}
	return left.Name > right.Name
}

type registryParsedVersion struct {
	valid      bool
	major      int
	minor      int
	patch      int
	prerelease string
}

func parseRegistryVersion(version string) registryParsedVersion {
	version = strings.TrimSpace(version)
	version = strings.TrimPrefix(strings.TrimPrefix(version, "v"), "V")
	if version == "" {
		return registryParsedVersion{}
	}
	if plusIndex := strings.Index(version, "+"); plusIndex >= 0 {
		version = version[:plusIndex]
	}
	prerelease := ""
	if hyphenIndex := strings.Index(version, "-"); hyphenIndex >= 0 {
		prerelease = version[hyphenIndex+1:]
		version = version[:hyphenIndex]
		if strings.TrimSpace(prerelease) == "" {
			return registryParsedVersion{}
		}
	}
	segments := strings.Split(version, ".")
	if len(segments) == 0 || len(segments) > 3 {
		return registryParsedVersion{}
	}
	numbers := []int{0, 0, 0}
	for index, segment := range segments {
		if segment == "" {
			return registryParsedVersion{}
		}
		value, err := strconv.Atoi(segment)
		if err != nil || value < 0 {
			return registryParsedVersion{}
		}
		numbers[index] = value
	}
	return registryParsedVersion{valid: true, major: numbers[0], minor: numbers[1], patch: numbers[2], prerelease: prerelease}
}

func compareRegistryParsedVersion(left, right registryParsedVersion) int {
	for _, pair := range [][2]int{{left.major, right.major}, {left.minor, right.minor}, {left.patch, right.patch}} {
		if pair[0] > pair[1] {
			return 1
		}
		if pair[0] < pair[1] {
			return -1
		}
	}
	if left.prerelease == right.prerelease {
		return 0
	}
	if left.prerelease == "" {
		return 1
	}
	if right.prerelease == "" {
		return -1
	}
	return strings.Compare(left.prerelease, right.prerelease)
}

func parseRegistryTime(value string) (time.Time, bool) {
	parsed, err := time.Parse(time.RFC3339, strings.TrimSpace(value))
	return parsed, err == nil
}

func printSearchResults(items []registryItem, keyword string, noTrunc bool) {
	if len(items) == 0 {
		keyword = strings.TrimSpace(keyword)
		if keyword == "" {
			fmt.Println("No matching skills found.\n\nTry:\n  skillctl search <keyword>\n  skillctl search --all-versions")
			return
		}
		fmt.Printf("No matching skills found.\n\nKeyword:\n  %s\n\nTry:\n  skillctl search %s --all-versions\n  skillctl search --filter agent=<agent-type>\n", keyword, keyword)
		return
	}
	writer := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	_, _ = fmt.Fprintln(writer, "NAME\tVERSION\tDESCRIPTION\tRISK\tAGENT\tUPDATED")
	for _, item := range items {
		_, _ = fmt.Fprintf(
			writer,
			"%s\t%s\t%s\t%s\t%s\t%s\n",
			valueOrDash(item.Name),
			valueOrDash(item.Version),
			formatDescription(item.Description, noTrunc),
			valueOrDash(item.RiskLevel),
			valueOrDash(item.ApplicableAgent),
			valueOrDash(item.UpdatedAt),
		)
	}
	_ = writer.Flush()
}

func formatDescription(value string, noTrunc bool) string {
	value = strings.ReplaceAll(strings.TrimSpace(value), "\t", " ")
	value = strings.ReplaceAll(value, "\n", " ")
	if noTrunc {
		return valueOrDash(value)
	}
	runes := []rune(value)
	if len(runes) <= 45 {
		return valueOrDash(value)
	}
	return string(runes[:42]) + "..."
}

func valueOrDash(value string) string {
	if strings.TrimSpace(value) == "" {
		return "-"
	}
	return value
}

func decodeEnvelope(body []byte, target interface{}) error {
	var env responseEnvelope
	if err := json.Unmarshal(body, &env); err != nil {
		return codedError{kind: errInvalidRegistryEndpoint, message: "invalid registry response"}
	}
	if env.Code != http.StatusOK {
		return envelopeStatusError(env)
	}
	if target == nil || len(env.Data) == 0 || bytes.Equal(bytes.TrimSpace(env.Data), []byte("{}")) {
		return nil
	}
	if err := json.Unmarshal(env.Data, target); err != nil {
		return err
	}
	return nil
}

func decodeEnvelopeError(body []byte) error {
	trimmed := bytes.TrimSpace(body)
	if len(trimmed) == 0 || trimmed[0] != '{' {
		return nil
	}
	var env responseEnvelope
	if err := json.Unmarshal(trimmed, &env); err != nil {
		return nil
	}
	if env.Code == 0 || env.Code == http.StatusOK {
		return nil
	}
	return envelopeStatusError(env)
}

func envelopeStatusError(env responseEnvelope) error {
	message := strings.TrimSpace(env.Message)
	if env.Code == http.StatusUnauthorized {
		if message != "" {
			return codedError{
				kind:    errAuthenticationFailed,
				message: message + "\n\n" + authenticationHint(),
			}
		}
		return authenticationError()
	}
	if message == "" {
		message = fmt.Sprintf("server returned code %d", env.Code)
	}
	return errors.New(message)
}

func authenticationError() error {
	return codedError{
		kind:    errAuthenticationFailed,
		message: "Authentication failed.\n\n" + authenticationHint(),
	}
}

func noEndpointError() error {
	return fmt.Errorf("No 1Panel endpoint configured.\n\nRun:\n  skillctl login %s --token <token>\n\nConfig file:\n  %s", exampleEndpoint, displayConfigPath())
}

func noTokenError(endpoint string) error {
	return fmt.Errorf("No credential found for endpoint:\n  %s\n\nLogin first:\n  skillctl login %s --token <token>\n\nView saved endpoints:\n  skillctl config view", endpoint, endpoint)
}

func noTargetAgentError() error {
	return errors.New("No target agent configured.\n\nCreate an agent:\n  skillctl agent create default --skills-path /path/to/skills\n\nOr install directly to a path:\n  skillctl install <skill-name> --path /path/to/skills")
}

func agentNotFoundError(name string) error {
	return fmt.Errorf("Agent not found: %s\n\nView configured agents:\n  skillctl agent list\n\nOr create it:\n  skillctl agent create %s --skills-path /path/to/skills", name, name)
}

func unknownCommandError(command string) error {
	return fmt.Errorf("Unknown command: %s\n\nRun:\n  skillctl help", command)
}

func missingArgumentError(name, example string) error {
	return fmt.Errorf("Missing %s.\n\nExample:\n  %s", name, example)
}

func invalidLimitError(value string) error {
	return fmt.Errorf("Invalid --limit value: %s\n\n--limit must be a positive integer.\n\nExample:\n  skillctl search demo --limit 20", value)
}

func supportedSearchFiltersText() string {
	return "  agent=<agent-type>\n  risk=<low|medium|high>\n  version=<version>"
}

func endpointFormatHint() string {
	return fmt.Sprintf("Endpoint must start with http:// or https://\n\nExample:\n  skillctl login %s --token <token>", exampleEndpoint)
}

func authenticationHint() string {
	return fmt.Sprintf("Possible causes:\n  - Token is invalid or expired\n  - Current client IP is not allowed by the API whitelist\n  - Server time differs too much from this machine\n\nRun:\n  skillctl login %s --token <token>", exampleEndpoint)
}

func displayConfigPath() string {
	path, err := configPathForWrite()
	if err != nil || strings.TrimSpace(path) == "" {
		return "-"
	}
	return path
}

func passStoreUnavailableError(err error) error {
	return fmt.Errorf("Auth store \"pass\" is not available.\n\nPlease make sure pass is installed and initialized:\n  pass init <gpg-key-id>\n\nOr use file auth store:\n  skillctl login %s --token <token> --auth-store file\n\nDetails: %v", exampleEndpoint, err)
}

func passCredentialNotFoundError(endpoint string) error {
	return fmt.Errorf("Credential not found in pass for endpoint:\n  %s\n\nLogin again:\n  skillctl login %s --token <token> --auth-store pass", endpoint, exampleEndpoint)
}

func skillNotFoundError(name, version string) error {
	spec := strings.TrimSpace(name)
	if strings.TrimSpace(version) != "" {
		spec += "@" + strings.TrimSpace(version)
		return fmt.Errorf("Skill version not found: %s\n\nView available versions:\n  skillctl search %s --all-versions", spec, name)
	}
	return fmt.Errorf("Skill not found: %s\n\nTry searching first:\n  skillctl search %s", spec, spec)
}

func isSkillNotFoundError(err error) bool {
	if err == nil {
		return false
	}
	message := strings.ToLower(err.Error())
	return strings.Contains(message, "skill not found")
}

func skillAlreadyExistsError(targetPath, spec, agent, skillsPath string) error {
	command := fmt.Sprintf("skillctl install %s --force", valueOrPlaceholder(spec, "<skill-name>"))
	if strings.TrimSpace(agent) != "" {
		command = fmt.Sprintf("skillctl install %s --agent %s --force", valueOrPlaceholder(spec, "<skill-name>"), strings.TrimSpace(agent))
	} else if strings.TrimSpace(skillsPath) != "" {
		command = fmt.Sprintf("skillctl install %s --path %s --force", valueOrPlaceholder(spec, "<skill-name>"), strings.TrimSpace(skillsPath))
	}
	return fmt.Errorf("Skill already exists:\n  %s\n\nUse --force to overwrite the existing skill directory:\n  %s", targetPath, command)
}

func valueOrPlaceholder(value, placeholder string) string {
	if strings.TrimSpace(value) == "" {
		return placeholder
	}
	return strings.TrimSpace(value)
}

func connectionError(endpoint string, cause error) error {
	parsed, err := url.Parse(endpoint)
	display := endpoint
	if err == nil && parsed.Scheme != "" && parsed.Host != "" {
		display = parsed.Scheme + "://" + parsed.Host
	}
	return fmt.Errorf("Cannot connect to 1Panel endpoint:\n  %s\n\nPlease check:\n  - 1Panel service is running\n  - Host and port are correct\n  - Firewall allows this machine to access the panel\n\nDetails: %v", display, cause)
}

func unsafePackagePathError(name string) error {
	return fmt.Errorf("Refusing to install unsafe skill package.\n\nReason:\n  package contains a path outside the skill directory: %s\n\nPlease repackage the skill and try again.", name)
}

func verifySHA256(data []byte, expected string) error {
	sum := sha256.Sum256(data)
	actual := hex.EncodeToString(sum[:])
	if !strings.EqualFold(actual, strings.TrimSpace(expected)) {
		return fmt.Errorf("Downloaded package checksum mismatch.\n\nExpected SHA256:\n  %s\nActual SHA256:\n  %s\n\nThis may mean the package was corrupted or changed on the server. Please try again, or ask the 1Panel administrator to re-publish this skill.", expected, actual)
	}
	return nil
}

func installSkillPackage(data []byte, skillsPath, skillName string, force bool) error {
	if err := validateSkillDirName(skillName); err != nil {
		return err
	}
	if err := os.MkdirAll(skillsPath, 0755); err != nil {
		return err
	}
	checkDir, err := os.MkdirTemp(skillsPath, ".skillctl-check-*")
	if err != nil {
		return err
	}
	_ = os.RemoveAll(checkDir)

	tempDir, err := os.MkdirTemp(skillsPath, ".skillctl-install-*")
	if err != nil {
		return err
	}
	defer os.RemoveAll(tempDir)

	extractRoot := filepath.Join(tempDir, "extract")
	if err := os.MkdirAll(extractRoot, 0755); err != nil {
		return err
	}
	if err := extractZip(data, extractRoot); err != nil {
		return err
	}
	sourceRoot, err := normalizeExtractedSkillRoot(extractRoot)
	if err != nil {
		return err
	}

	targetPath := filepath.Join(skillsPath, skillName)
	if exists(targetPath) && !force {
		return skillAlreadyExistsError(targetPath, skillName, "", skillsPath)
	}
	backupPath := ""
	if exists(targetPath) {
		backupPath = filepath.Join(skillsPath, "."+skillName+".backup."+strconvTime())
		if err := os.Rename(targetPath, backupPath); err != nil {
			return err
		}
	}
	if err := copyDirContents(sourceRoot, targetPath); err != nil {
		_ = os.RemoveAll(targetPath)
		if backupPath != "" {
			_ = os.Rename(backupPath, targetPath)
		}
		return err
	}
	if backupPath != "" {
		_ = os.RemoveAll(backupPath)
	}
	return nil
}

func strconvTime() string {
	return fmt.Sprintf("%d", time.Now().UnixNano())
}

func normalizeExtractedSkillRoot(extractRoot string) (string, error) {
	entries, err := os.ReadDir(extractRoot)
	if err != nil {
		return "", err
	}
	if len(entries) == 0 {
		return "", errors.New("Skill package is empty.\n\nPlease check the package content and try again.")
	}
	if len(entries) == 1 && entries[0].IsDir() {
		return filepath.Join(extractRoot, entries[0].Name()), nil
	}
	return extractRoot, nil
}

func extractZip(data []byte, dir string) error {
	reader, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return fmt.Errorf("Invalid skill package: not a valid zip archive.\n\nPlease download or package the skill again.\n\nDetails: %w", err)
	}
	root, err := filepath.Abs(dir)
	if err != nil {
		return err
	}
	for _, item := range reader.File {
		target, err := safeJoin(root, item.Name)
		if err != nil {
			return err
		}
		mode := item.FileInfo().Mode()
		if mode&os.ModeSymlink != 0 {
			return fmt.Errorf("Refusing to install skill package because it contains a symlink:\n  %s\n\nFor security, skill packages cannot contain symlinks. Please remove the symlink and repackage the skill.", item.Name)
		}
		if item.FileInfo().IsDir() {
			if err := prepareTargetDir(root, target, 0755); err != nil {
				return err
			}
			continue
		}
		if !mode.IsRegular() && mode.Type() != 0 {
			return fmt.Errorf("Unsupported zip entry:\n  %s\n\nSkill packages can only contain regular files and directories.", item.Name)
		}
		if err := prepareTargetFile(root, target); err != nil {
			return err
		}
		if err := writeZipFile(item, target); err != nil {
			return err
		}
	}
	return nil
}

func safeJoin(root, name string) (string, error) {
	cleanName := path.Clean(strings.ReplaceAll(name, "\\", "/"))
	cleanName = strings.TrimLeft(cleanName, "/")
	if cleanName == "." || cleanName == "" || cleanName == ".." || strings.HasPrefix(cleanName, "../") {
		return "", unsafePackagePathError(name)
	}
	target := filepath.Join(root, filepath.FromSlash(cleanName))
	abs, err := filepath.Abs(target)
	if err != nil {
		return "", err
	}
	if abs != root && !strings.HasPrefix(abs, root+string(os.PathSeparator)) {
		return "", unsafePackagePathError(name)
	}
	return abs, nil
}

func prepareTargetDir(root, targetDir string, mode os.FileMode) error {
	if err := mkdirAllInsideRoot(root, targetDir, mode); err != nil {
		return err
	}
	info, err := os.Lstat(targetDir)
	if err != nil {
		return err
	}
	if info.Mode()&os.ModeSymlink != 0 || !info.IsDir() {
		return fmt.Errorf("Unsupported target directory:\n  %s\n\nFor security, skillctl will not write through symlinks or non-directory targets.", targetDir)
	}
	return nil
}

func prepareTargetFile(root, target string) error {
	if err := mkdirAllInsideRoot(root, filepath.Dir(target), 0755); err != nil {
		return err
	}
	info, err := os.Lstat(target)
	if err == nil && info.Mode()&os.ModeSymlink != 0 {
		return fmt.Errorf("Unsupported target file:\n  %s\n\nFor security, skillctl will not overwrite symlink targets.", target)
	}
	if err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

func mkdirAllInsideRoot(root, targetDir string, mode os.FileMode) error {
	root = filepath.Clean(root)
	targetDir = filepath.Clean(targetDir)
	rel, err := filepath.Rel(root, targetDir)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(os.PathSeparator)) {
		return fmt.Errorf("invalid target path: %s", targetDir)
	}
	if rel == "." {
		return nil
	}
	current := root
	for _, part := range strings.Split(rel, string(os.PathSeparator)) {
		if part == "" || part == "." {
			continue
		}
		current = filepath.Join(current, part)
		info, err := os.Lstat(current)
		if os.IsNotExist(err) {
			if err := os.Mkdir(current, mode); err != nil && !os.IsExist(err) {
				return err
			}
			continue
		}
		if err != nil {
			return err
		}
		if info.Mode()&os.ModeSymlink != 0 || !info.IsDir() {
			return fmt.Errorf("Unsupported target path:\n  %s\n\nFor security, skillctl will not write through symlinks or non-directory targets.", current)
		}
	}
	return nil
}

func writeZipFile(item *zip.File, target string) error {
	src, err := item.Open()
	if err != nil {
		return err
	}
	defer src.Close()
	mode := item.FileInfo().Mode().Perm()
	if mode == 0 {
		mode = 0644
	}
	dst, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, mode)
	if err != nil {
		return err
	}
	defer dst.Close()
	if _, err := io.Copy(dst, src); err != nil {
		return err
	}
	return os.Chmod(target, mode)
}

func copyDirContents(sourceRoot, targetRoot string) error {
	info, err := os.Stat(sourceRoot)
	if err != nil {
		return err
	}
	mode := info.Mode().Perm()
	if mode == 0 {
		mode = 0755
	}
	if err := os.MkdirAll(targetRoot, mode); err != nil {
		return err
	}
	return filepath.Walk(sourceRoot, func(sourcePath string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if sourcePath == sourceRoot {
			return nil
		}
		if info.Mode()&os.ModeSymlink != 0 || (!info.IsDir() && !info.Mode().IsRegular()) {
			return fmt.Errorf("Unsupported skill package entry:\n  %s\n\nSkill packages can only contain regular files and directories.", sourcePath)
		}
		rel, err := filepath.Rel(sourceRoot, sourcePath)
		if err != nil {
			return err
		}
		targetPath := filepath.Join(targetRoot, rel)
		if info.IsDir() {
			mode := info.Mode().Perm()
			if mode == 0 {
				mode = 0755
			}
			return os.MkdirAll(targetPath, mode)
		}
		if err := os.MkdirAll(filepath.Dir(targetPath), 0755); err != nil {
			return err
		}
		src, err := os.Open(sourcePath)
		if err != nil {
			return err
		}
		defer src.Close()
		mode := info.Mode().Perm()
		if mode == 0 {
			mode = 0644
		}
		dst, err := os.OpenFile(targetPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, mode)
		if err != nil {
			return err
		}
		if _, err := io.Copy(dst, src); err != nil {
			_ = dst.Close()
			return err
		}
		if err := dst.Close(); err != nil {
			return err
		}
		return os.Chmod(targetPath, mode)
	})
}

func exists(name string) bool {
	_, err := os.Lstat(name)
	return err == nil
}

func isPermissionError(err error) bool {
	return errors.Is(err, os.ErrPermission)
}

func printUsage() {
	fmt.Println(`skillctl is the command line client for 1Panel Enterprise Skills Hub.

Usage:
  skillctl <command> [options]

Commands:
  login    Login to a 1Panel endpoint
  logout   Logout from the current or specified endpoint
  whoami   Show current login identity
  config   View or switch endpoint configuration
  agent    Manage local agent install targets
  search   Search skills in Skills Hub
  install  Install a skill to an agent or path

Command usage:
  skillctl login <endpoint> --token <token> [--auth-store file|pass]
  skillctl logout [endpoint]
  skillctl whoami [--endpoint <endpoint>]
  skillctl config view
  skillctl config current
  skillctl config use <endpoint>
  skillctl agent create <agent-name> --skills-path <skills-path>
  skillctl agent list
  skillctl agent use <agent-name>
  skillctl agent current
  skillctl search [keyword] [--endpoint <endpoint>] [--limit <n>] [--filter <key=value>] [--all-versions] [--no-trunc]
  skillctl install <skill-name> [--agent <agent-name>] [--path <skills-path>] [--endpoint <endpoint>] [--force]

Search filters:
  agent=<agent-type>  Filter by applicable agent type
  risk=<level>        Filter by risk level
  version=<version>   Filter by skill version

Search defaults to the latest published version of each skill. Use --all-versions to show every published version.

Environment:
  SKILLCTL_CONFIG  Override the config file path`)
}
