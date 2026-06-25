package main

import (
	"sync"
	"time"
)

const (
	sessionRestoreGrace = 30 * time.Second
	sessionPurgeIdle    = 5 * time.Minute
	sessionCleanupEvery = 1 * time.Minute
)

type SessionData struct {
	Nick         string
	Rooms        []string
	LastActivity time.Time
	LiveClient   *Client
}

type SessionManager struct {
	mu       sync.RWMutex
	sessions map[string]*SessionData
}

func NewSessionManager() *SessionManager {
	sm := &SessionManager{sessions: make(map[string]*SessionData)}
	go sm.cleanupLoop()
	return sm
}

func (sm *SessionManager) Get(id string) (*SessionData, bool) {
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	s, ok := sm.sessions[id]
	return s, ok
}

func (sm *SessionManager) Upsert(id, nick string, rooms []string, client *Client) {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	cp := append([]string(nil), rooms...)
	sm.sessions[id] = &SessionData{
		Nick:         nick,
		Rooms:        cp,
		LastActivity: time.Now(),
		LiveClient:   client,
	}
}

func (sm *SessionManager) Touch(id string) {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	if s, ok := sm.sessions[id]; ok {
		s.LastActivity = time.Now()
	}
}

func (sm *SessionManager) UpdateNick(id, nick string) {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	if s, ok := sm.sessions[id]; ok {
		s.Nick = nick
		s.LastActivity = time.Now()
	}
}

func (sm *SessionManager) UpdateRooms(id string, rooms []string) {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	if s, ok := sm.sessions[id]; ok {
		s.Rooms = append([]string(nil), rooms...)
		s.LastActivity = time.Now()
	}
}

func (sm *SessionManager) ClearLive(id string) {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	if s, ok := sm.sessions[id]; ok {
		s.LiveClient = nil
		s.LastActivity = time.Now()
	}
}

func (sm *SessionManager) Remove(id string) {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	delete(sm.sessions, id)
}

func (sm *SessionManager) CanRestore(id string) (*SessionData, bool) {
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	s, ok := sm.sessions[id]
	if !ok {
		return nil, false
	}
	if s.LiveClient != nil {
		return nil, false
	}
	if time.Since(s.LastActivity) > sessionRestoreGrace {
		return nil, false
	}
	return s, true
}

func (sm *SessionManager) cleanupLoop() {
	ticker := time.NewTicker(sessionCleanupEvery)
	defer ticker.Stop()
	for range ticker.C {
		sm.mu.Lock()
		now := time.Now()
		for id, s := range sm.sessions {
			if s.LiveClient == nil && now.Sub(s.LastActivity) > sessionPurgeIdle {
				delete(sm.sessions, id)
			}
		}
		sm.mu.Unlock()
	}
}
