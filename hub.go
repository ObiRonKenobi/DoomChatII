package main

import (
	"fmt"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

var upgrader websocket.Upgrader

func initUpgrader(cfg LimitConfig) {
	upgrader = websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
		CheckOrigin: func(r *http.Request) bool {
			return originAllowed(r.Header.Get("Origin"), cfg.AllowedOrigins)
		},
	}
}

type Client struct {
	hub        *Hub
	conn       *websocket.Conn
	send       chan []byte
	nick       string
	sessionID  string
	rooms      map[string]struct{}
	mu         sync.Mutex
	lastNick   time.Time
	helloDone  bool
	clientIP   string
	chatBucket *tokenBucket
	cmdBucket  *tokenBucket
}

type Hub struct {
	clients        map[*Client]struct{}
	rooms          *RoomManager
	sessions       *SessionManager
	db             *DB
	trivia         *TriviaManager
	history        *MessageLog
	releaseVersion string
	releaseNotes   string
	register       chan *Client
	unregister     chan *Client
	mu             sync.RWMutex
	rateMu         sync.Mutex
	connRate       map[string][]time.Time
	limits         LimitConfig
	connCount      int
}

func NewHub(db *DB, trivia *TriviaManager, cfg LimitConfig) *Hub {
	track := NewRoomCreateTracker(cfg)
	return &Hub{
		clients:    make(map[*Client]struct{}),
		rooms:      NewRoomManager(cfg, track),
		sessions:   NewSessionManager(),
		db:         db,
		trivia:     trivia,
		history:    NewMessageLog(db),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		connRate:   make(map[string][]time.Time),
		limits:     cfg,
	}
}

func (h *Hub) Run() {
	for {
		select {
		case c := <-h.register:
			h.mu.Lock()
			h.clients[c] = struct{}{}
			h.connCount++
			h.mu.Unlock()
		case c := <-h.unregister:
			h.removeClient(c)
		}
	}
}

func (h *Hub) removeClient(c *Client) {
	h.mu.Lock()
	if _, ok := h.clients[c]; ok {
		delete(h.clients, c)
		h.connCount--
		close(c.send)
	}
	h.mu.Unlock()

	c.mu.Lock()
	rooms := make([]string, 0, len(c.rooms))
	for r := range c.rooms {
		rooms = append(rooms, r)
	}
	sid := c.sessionID
	nick := c.nick
	c.mu.Unlock()

	for _, roomName := range rooms {
		if room, ok := h.rooms.Get(roomName); ok {
			room.Part(c)
			if nick != "" {
				h.broadcastRoomSystem(roomName, nick+" has left.")
			}
			h.broadcastRoomUsers(roomName)
		}
	}

	if sid != "" {
		h.sessions.ClearLive(sid)
		h.sessions.UpdateRooms(sid, rooms)
		if nick != "" {
			h.sessions.UpdateNick(sid, nick)
		}
	}
}

func (h *Hub) allowConnection(ip string) bool {
	h.rateMu.Lock()
	defer h.rateMu.Unlock()
	now := time.Now()
	cutoff := now.Add(-time.Minute)
	times := h.connRate[ip]
	var recent []time.Time
	for _, t := range times {
		if t.After(cutoff) {
			recent = append(recent, t)
		}
	}
	if len(recent) >= h.limits.ConnRatePerMinute {
		return false
	}
	recent = append(recent, now)
	h.connRate[ip] = recent
	return true
}

func (h *Hub) broadcastRoom(room string, msg ServerMessage) {
	if r, ok := h.rooms.Get(room); ok {
		r.BroadcastAll(msg)
	}
}

func (h *Hub) persistTrivia(room, text string) {
	h.history.Add(room, "trivia", text, false)
}

func formatTriviaScores(scores map[string]int) string {
	if len(scores) == 0 {
		return "(none)"
	}
	parts := make([]string, 0, len(scores))
	for k, v := range scores {
		parts = append(parts, fmt.Sprintf("%s: %d", k, v))
	}
	return strings.Join(parts, ", ")
}

func (h *Hub) broadcastRoomSystem(room, text string) {
	h.broadcastRoom(room, ServerMessage{Type: "system", Target: TargetSystem, Room: room, Text: text})
}

func (h *Hub) broadcastRoomUsers(roomName string) {
	room, ok := h.rooms.Get(roomName)
	if !ok {
		return
	}
	h.broadcastRoom(roomName, ServerMessage{
		Type:   "room_users",
		Target: TargetSystem,
		Room:   roomName,
		Nicks:  room.MemberNickList(),
		Number: room.MemberCount(),
	})
}

func (c *Client) Send(msg ServerMessage) {
	select {
	case c.send <- msg.JSON():
	default:
	}
}

func (c *Client) SendRaw(data []byte) {
	select {
	case c.send <- data:
	default:
	}
}

func (c *Client) sendSystem(text string) {
	c.Send(ServerMessage{Type: "system", Target: TargetSystem, Text: text})
}

func (c *Client) sendError(text string) {
	c.Send(ServerMessage{Type: "error", Target: TargetSystem, Text: text})
}

func (c *Client) joinedRooms() []string {
	c.mu.Lock()
	defer c.mu.Unlock()
	out := make([]string, 0, len(c.rooms))
	for r := range c.rooms {
		out = append(out, r)
	}
	return out
}

func (c *Client) joinRoom(h *Hub, roomName string) error {
	roomName = normalizeRoom(roomName)
	if roomName == "" {
		return errInvalidRoom
	}
	room, ok := h.rooms.Get(roomName)
	if !ok {
		return errRoomNotFound
	}
	c.mu.Lock()
	if _, exists := c.rooms[roomName]; exists {
		c.mu.Unlock()
		return nil
	}
	if len(c.rooms) >= h.limits.MaxJoinedRooms {
		c.mu.Unlock()
		return errTooManyJoined
	}
	c.rooms[roomName] = struct{}{}
	nick := c.nick
	c.mu.Unlock()

	if err := room.Join(c, h.limits); err != nil {
		c.mu.Lock()
		delete(c.rooms, roomName)
		c.mu.Unlock()
		return err
	}
	c.sendSystem("Joined " + roomName)
	if entries := h.history.GetRoomHistory(roomName); len(entries) > 0 {
		c.Send(ServerMessage{
			Type:    "history",
			Target:  TargetChat,
			Room:    roomName,
			History: entries,
		})
	}
	c.Send(ServerMessage{
		Type:   "room_users",
		Target: TargetSystem,
		Room:   roomName,
		Nicks:  room.MemberNickList(),
		Number: room.MemberCount(),
	})
	if nick != "" {
		h.broadcastRoomSystem(roomName, nick+" has joined.")
	}
	h.broadcastRoomUsers(roomName)
	if h.trivia != nil {
		h.trivia.ResyncClient(roomName, c, h)
	}
	if c.sessionID != "" {
		h.sessions.UpdateRooms(c.sessionID, c.joinedRooms())
	}
	return nil
}

func (c *Client) partRoom(h *Hub, roomName string) {
	roomName = normalizeRoom(roomName)
	c.mu.Lock()
	if _, ok := c.rooms[roomName]; !ok {
		c.mu.Unlock()
		return
	}
	delete(c.rooms, roomName)
	nick := c.nick
	c.mu.Unlock()

	if room, ok := h.rooms.Get(roomName); ok {
		room.Part(c)
		if nick != "" {
			h.broadcastRoomSystem(roomName, nick+" has left.")
		}
		h.broadcastRoomUsers(roomName)
	}
	c.sendSystem("Left " + roomName)
	if c.sessionID != "" {
		h.sessions.UpdateRooms(c.sessionID, c.joinedRooms())
	}
}

func serveWS(h *Hub, w http.ResponseWriter, r *http.Request) {
	h.mu.RLock()
	atCap := h.connCount >= h.limits.MaxConnections
	h.mu.RUnlock()
	if atCap {
		http.Error(w, "server full", http.StatusServiceUnavailable)
		return
	}
	ip := clientIPFromRequest(r, h.limits.TrustProxy)
	if !h.allowConnection(ip) {
		http.Error(w, "rate limited", http.StatusTooManyRequests)
		return
	}
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	client := &Client{
		hub:        h,
		conn:       conn,
		send:       make(chan []byte, 256),
		rooms:      make(map[string]struct{}),
		clientIP:   ip,
		chatBucket: newTokenBucket(h.limits.ChatBurst, h.limits.ChatWindow),
		cmdBucket:  newTokenBucket(h.limits.CmdBurst, h.limits.CmdWindow),
	}
	h.register <- client
	go client.writePump()
	go client.readPump(h)
}

func clientIPFromRequest(r *http.Request, trustProxy bool) string {
	if trustProxy {
		if cf := r.Header.Get("CF-Connecting-IP"); cf != "" {
			return strings.TrimSpace(cf)
		}
		if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
			return strings.TrimSpace(strings.Split(xff, ",")[0])
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

var (
	errInvalidRoom      = &clientError{"invalid room name"}
	errRoomNotFound     = &clientError{"room not found"}
	errRoomFull         = &clientError{"room full"}
	errTooManyJoined    = &clientError{"too many rooms joined"}
	errPasswordRequired = &clientError{"private room — password required"}
	errWrongPassword    = &clientError{"wrong password"}
)

type clientError struct{ msg string }

func (e *clientError) Error() string { return e.msg }
