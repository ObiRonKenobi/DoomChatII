package main

import (
	"fmt"
	"sort"
	"sync"
)

type Room struct {
	Name      string
	Encrypted bool
	members   map[*Client]struct{}
	mu        sync.RWMutex
}

type RoomManager struct {
	mu    sync.RWMutex
	rooms map[string]*Room
}

func NewRoomManager() *RoomManager {
	rm := &RoomManager{rooms: make(map[string]*Room)}
	rm.ensureLobby()
	return rm
}

func (rm *RoomManager) ensureLobby() {
	rm.mu.Lock()
	defer rm.mu.Unlock()
	if _, ok := rm.rooms[lobbyRoom]; !ok {
		rm.rooms[lobbyRoom] = &Room{Name: lobbyRoom, members: make(map[*Client]struct{})}
	}
}

func (rm *RoomManager) Get(name string) (*Room, bool) {
	rm.mu.RLock()
	defer rm.mu.RUnlock()
	r, ok := rm.rooms[name]
	return r, ok
}

func (rm *RoomManager) Create(name string, encrypted bool) (*Room, error) {
	name = normalizeRoom(name)
	if name == "" {
		return nil, fmt.Errorf("invalid room name")
	}
	rm.mu.Lock()
	defer rm.mu.Unlock()
	if _, ok := rm.rooms[name]; ok {
		return nil, fmt.Errorf("room already exists")
	}
	r := &Room{Name: name, Encrypted: encrypted, members: make(map[*Client]struct{})}
	rm.rooms[name] = r
	return r, nil
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

func (r *Room) Join(c *Client) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.members[c] = struct{}{}
}

func (r *Room) Part(c *Client) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.members, c)
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
