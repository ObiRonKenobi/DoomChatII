package main

import (
	"fmt"
	"sort"
	"sync"
	"time"

	"golang.org/x/crypto/bcrypt"
)

type Room struct {
	Name         string
	Encrypted    bool
	UserCreated  bool
	CreatorIP    string
	CreatorSID   string
	PasswordHash []byte
	CreatedAt    time.Time
	LastActivity time.Time
	members      map[*Client]struct{}
	mu           sync.RWMutex
}

type RoomManager struct {
	mu    sync.RWMutex
	rooms map[string]*Room
	cfg   LimitConfig
	track *RoomCreateTracker
}

func NewRoomManager(cfg LimitConfig, track *RoomCreateTracker) *RoomManager {
	rm := &RoomManager{
		rooms: make(map[string]*Room),
		cfg:   cfg,
		track: track,
	}
	rm.ensureLobby()
	go rm.evictLoop()
	return rm
}

func (rm *RoomManager) ensureLobby() {
	rm.mu.Lock()
	defer rm.mu.Unlock()
	if _, ok := rm.rooms[lobbyRoom]; !ok {
		rm.rooms[lobbyRoom] = &Room{
			Name:         lobbyRoom,
			UserCreated:  false,
			CreatedAt:    time.Now(),
			LastActivity: time.Now(),
			members:      make(map[*Client]struct{}),
		}
	}
}

func (rm *RoomManager) Get(name string) (*Room, bool) {
	rm.mu.RLock()
	defer rm.mu.RUnlock()
	r, ok := rm.rooms[name]
	return r, ok
}

func (rm *RoomManager) CountUserCreated() int {
	rm.mu.RLock()
	defer rm.mu.RUnlock()
	n := 0
	for _, r := range rm.rooms {
		if r.UserCreated {
			n++
		}
	}
	return n
}

func (rm *RoomManager) Create(name string, encrypted bool, creatorIP, sessionID, password string) (*Room, error) {
	name = normalizeRoom(name)
	if !validateRoomName(name) {
		return nil, fmt.Errorf("invalid room name")
	}
	if name == lobbyRoom {
		return nil, fmt.Errorf("cannot create lobby")
	}
	ok, msg := rm.track.CanCreate(creatorIP, sessionID, rm.CountUserCreated())
	if !ok {
		return nil, fmt.Errorf("%s", msg)
	}
	var hash []byte
	if encrypted {
		if password == "" {
			return nil, fmt.Errorf("private rooms require a password")
		}
		if len(password) > 128 {
			return nil, fmt.Errorf("password too long")
		}
		h, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
		if err != nil {
			return nil, fmt.Errorf("could not secure room password")
		}
		hash = h
	}
	now := time.Now()
	rm.mu.Lock()
	defer rm.mu.Unlock()
	if _, exists := rm.rooms[name]; exists {
		return nil, fmt.Errorf("room already exists")
	}
	r := &Room{
		Name:         name,
		Encrypted:    encrypted,
		UserCreated:  true,
		CreatorIP:    creatorIP,
		CreatorSID:   sessionID,
		PasswordHash: hash,
		CreatedAt:    now,
		LastActivity: now,
		members:      make(map[*Client]struct{}),
	}
	rm.rooms[name] = r
	rm.track.Register(creatorIP, sessionID)
	return r, nil
}

func (r *Room) CheckPassword(password string) bool {
	if !r.Encrypted || len(r.PasswordHash) == 0 {
		return true
	}
	return bcrypt.CompareHashAndPassword(r.PasswordHash, []byte(password)) == nil
}

func (r *Room) memberCap(cfg LimitConfig) int {
	return cfg.memberCap(r.Name, r.Encrypted)
}

func (r *Room) touchLocked() {
	r.LastActivity = time.Now()
}

func (rm *RoomManager) ListPublicWithCounts() []RoomCount {
	rm.mu.RLock()
	defer rm.mu.RUnlock()
	var list []RoomCount
	for name, r := range rm.rooms {
		if r.Encrypted {
			continue
		}
		list = append(list, RoomCount{Name: name, Count: r.MemberCount()})
	}
	return list
}

func (r *Room) Join(c *Client, cfg LimitConfig) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	cap := r.memberCap(cfg)
	if len(r.members) >= cap {
		return errRoomFull
	}
	r.members[c] = struct{}{}
	r.touchLocked()
	return nil
}

func (r *Room) Part(c *Client) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.members, c)
	r.touchLocked()
}

func (r *Room) MemberCount() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.members)
}

func (r *Room) MemberNicks() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	counts := make(map[string]int)
	for m := range r.members {
		m.mu.Lock()
		nick := m.nick
		m.mu.Unlock()
		if nick == "" {
			nick = "(guest)"
		}
		counts[nick]++
	}
	nicks := make([]string, 0, len(counts))
	for nick := range counts {
		nicks = append(nicks, nick)
	}
	sort.Strings(nicks)
	out := make([]string, 0, len(nicks))
	for _, nick := range nicks {
		if counts[nick] > 1 {
			out = append(out, fmt.Sprintf("%s (%d)", nick, counts[nick]))
		} else {
			out = append(out, nick)
		}
	}
	return out
}

func (r *Room) MemberNickList() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	var nicks []string
	for m := range r.members {
		m.mu.Lock()
		nick := m.nick
		m.mu.Unlock()
		if nick != "" {
			nicks = append(nicks, nick)
		}
	}
	sort.Strings(nicks)
	return nicks
}

func (r *Room) Broadcast(msg ServerMessage, exclude *Client) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	data := msg.JSON()
	for m := range r.members {
		if m != exclude {
			m.SendRaw(data)
		}
	}
}

func (r *Room) BroadcastAll(msg ServerMessage) {
	r.Broadcast(msg, nil)
}

func (rm *RoomManager) evictLoop() {
	ticker := time.NewTicker(rm.cfg.RoomEvictInterval)
	defer ticker.Stop()
	for range ticker.C {
		rm.evictStale()
	}
}

func (rm *RoomManager) evictStale() {
	now := time.Now()
	rm.mu.Lock()
	defer rm.mu.Unlock()
	for name, r := range rm.rooms {
		if !r.UserCreated {
			continue
		}
		idle := r.MemberCount() == 0 && now.Sub(r.LastActivity) > rm.cfg.RoomIdleTTL
		tooOld := now.Sub(r.CreatedAt) > rm.cfg.RoomMaxAge
		if idle || tooOld {
			delete(rm.rooms, name)
			rm.track.Unregister(r.CreatorIP, r.CreatorSID)
		}
	}
}
