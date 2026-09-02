package main

import (
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

type LimitConfig struct {
	MaxLobbyMembers       int
	MaxPublicRoomMembers  int
	MaxPrivateRoomMembers int
	MaxJoinedRooms        int
	MaxConnections        int
	MaxRoomsPerIP         int
	MaxRoomsPerSession    int
	MaxTotalRooms         int
	RoomCreateRateIP      int
	RoomCreateIPWindow    time.Duration
	RoomCreateRateSession int
	RoomCreateSessWindow  time.Duration
	RoomIdleTTL           time.Duration
	RoomMaxAge            time.Duration
	RoomEvictInterval     time.Duration
	ChatBurst             int
	ChatWindow            time.Duration
	CmdBurst              int
	CmdWindow             time.Duration
	ConnRatePerMinute     int
	TrustProxy            bool
	AllowedOrigins        []string
}

func LoadLimitConfig() LimitConfig {
	return LimitConfig{
		MaxLobbyMembers:       envInt("MAX_LOBBY_MEMBERS", 2048),
		MaxPublicRoomMembers:  envInt("MAX_PUBLIC_ROOM_MEMBERS", 24),
		MaxPrivateRoomMembers: envInt("MAX_PRIVATE_ROOM_MEMBERS", 12),
		MaxJoinedRooms:        envInt("MAX_JOINED_ROOMS", 8),
		MaxConnections:        envInt("MAX_CONNECTIONS", 200),
		MaxRoomsPerIP:         envInt("MAX_ROOMS_PER_IP", 5),
		MaxRoomsPerSession:    envInt("MAX_ROOMS_PER_SESSION", 3),
		MaxTotalRooms:         envInt("MAX_TOTAL_ROOMS", 500),
		RoomCreateRateIP:      envInt("ROOM_CREATE_RATE_IP", 3),
		RoomCreateIPWindow:    envDuration("ROOM_CREATE_IP_WINDOW", time.Hour),
		RoomCreateRateSession: envInt("ROOM_CREATE_RATE_SESSION", 1),
		RoomCreateSessWindow:  envDuration("ROOM_CREATE_SESSION_WINDOW", 10*time.Minute),
		RoomIdleTTL:           envDuration("ROOM_IDLE_TTL", 24*time.Hour),
		RoomMaxAge:            envDuration("ROOM_MAX_AGE", 7*24*time.Hour),
		RoomEvictInterval:     envDuration("ROOM_EVICT_INTERVAL", 15*time.Minute),
		ChatBurst:             envInt("CHAT_BURST", 6),
		ChatWindow:            envDuration("CHAT_WINDOW", 10*time.Second),
		CmdBurst:              envInt("CMD_BURST", 3),
		CmdWindow:             envDuration("CMD_WINDOW", 10*time.Second),
		ConnRatePerMinute:     envInt("CONN_RATE_PER_MINUTE", 10),
		TrustProxy:            envBool("TRUST_PROXY", false),
		AllowedOrigins:        envCSV("ALLOWED_ORIGINS", "https://chat.rbyt3r.com,http://localhost:8080,http://127.0.0.1:8080"),
	}
}

func (lc LimitConfig) memberCap(roomName string, encrypted bool) int {
	if roomName == lobbyRoom {
		return lc.MaxLobbyMembers
	}
	if encrypted {
		return lc.MaxPrivateRoomMembers
	}
	return lc.MaxPublicRoomMembers
}

func envInt(key string, def int) int {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil || n < 0 {
		return def
	}
	return n
}

func envBool(key string, def bool) bool {
	v := strings.TrimSpace(strings.ToLower(os.Getenv(key)))
	if v == "" {
		return def
	}
	return v == "1" || v == "true" || v == "yes"
}

func envCSV(key, def string) []string {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		raw = def
	}
	parts := strings.Split(raw, ",")
	var out []string
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

func envDuration(key string, def time.Duration) time.Duration {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return def
	}
	d, err := time.ParseDuration(v)
	if err != nil {
		return def
	}
	return d
}

type tokenBucket struct {
	mu     sync.Mutex
	limit  int
	window time.Duration
	times  []time.Time
}

func newTokenBucket(limit int, window time.Duration) *tokenBucket {
	return &tokenBucket{limit: limit, window: window}
}

func (b *tokenBucket) allow() bool {
	if b.limit <= 0 {
		return true
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	now := time.Now()
	cutoff := now.Add(-b.window)
	var recent []time.Time
	for _, t := range b.times {
		if t.After(cutoff) {
			recent = append(recent, t)
		}
	}
	if len(recent) >= b.limit {
		return false
	}
	recent = append(recent, now)
	b.times = recent
	return true
}

type slidingCounter struct {
	mu     sync.Mutex
	limit  int
	window time.Duration
	times  []time.Time
}

func newSlidingCounter(limit int, window time.Duration) *slidingCounter {
	return &slidingCounter{limit: limit, window: window}
}

func (s *slidingCounter) allow() bool {
	if s.limit <= 0 {
		return true
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now()
	cutoff := now.Add(-s.window)
	var recent []time.Time
	for _, t := range s.times {
		if t.After(cutoff) {
			recent = append(recent, t)
		}
	}
	if len(recent) >= s.limit {
		return false
	}
	recent = append(recent, now)
	s.times = recent
	return true
}

type RoomCreateTracker struct {
	mu          sync.Mutex
	cfg         LimitConfig
	ipCreates   map[string]*slidingCounter
	sessCreates map[string]*slidingCounter
	ipActive    map[string]int
	sessActive  map[string]int
}

func NewRoomCreateTracker(cfg LimitConfig) *RoomCreateTracker {
	return &RoomCreateTracker{
		cfg:         cfg,
		ipCreates:   make(map[string]*slidingCounter),
		sessCreates: make(map[string]*slidingCounter),
		ipActive:    make(map[string]int),
		sessActive:  make(map[string]int),
	}
}

func (t *RoomCreateTracker) ipCounter(ip string) *slidingCounter {
	c, ok := t.ipCreates[ip]
	if !ok {
		c = newSlidingCounter(t.cfg.RoomCreateRateIP, t.cfg.RoomCreateIPWindow)
		t.ipCreates[ip] = c
	}
	return c
}

func (t *RoomCreateTracker) sessCounter(sid string) *slidingCounter {
	c, ok := t.sessCreates[sid]
	if !ok {
		c = newSlidingCounter(t.cfg.RoomCreateRateSession, t.cfg.RoomCreateSessWindow)
		t.sessCreates[sid] = c
	}
	return c
}

func (t *RoomCreateTracker) CanCreate(ip, sessionID string, totalUserRooms int) (bool, string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	if totalUserRooms >= t.cfg.MaxTotalRooms {
		return false, "server room limit reached — try again later"
	}
	if t.ipActive[ip] >= t.cfg.MaxRoomsPerIP {
		return false, "too many rooms from your network"
	}
	if sessionID != "" && t.sessActive[sessionID] >= t.cfg.MaxRoomsPerSession {
		return false, "too many rooms for this session"
	}
	if !t.ipCounter(ip).allow() {
		return false, "room create rate limited — wait before creating another room"
	}
	if sessionID != "" && !t.sessCounter(sessionID).allow() {
		return false, "room create rate limited — wait before creating another room"
	}
	return true, ""
}

func (t *RoomCreateTracker) Register(ip, sessionID string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.ipActive[ip]++
	if sessionID != "" {
		t.sessActive[sessionID]++
	}
}

func (t *RoomCreateTracker) Unregister(ip, sessionID string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.ipActive[ip] > 0 {
		t.ipActive[ip]--
	}
	if sessionID != "" && t.sessActive[sessionID] > 0 {
		t.sessActive[sessionID]--
	}
}

func originAllowed(origin string, allowed []string) bool {
	if origin == "" {
		return true
	}
	for _, a := range allowed {
		if strings.EqualFold(origin, a) {
			return true
		}
	}
	return false
}
