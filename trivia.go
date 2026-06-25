package main

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"os"
	"strings"
	"sync"
	"time"
)

const triviaTimeout = 30 * time.Second

type TriviaQuestion struct {
	Question string `json:"question"`
	Answer   string `json:"answer"`
	Category string `json:"category"`
}

type roomTrivia struct {
	Room       string
	Continuous bool
	Scores     map[string]int
	CurrentQ   string
	Answer     string
	Active     bool
	stopCh     chan struct{}
	used       map[int]struct{}
	mu         sync.Mutex
}

type TriviaManager struct {
	mu        sync.Mutex
	bank      []TriviaQuestion
	byRoom    map[string]*roomTrivia
	rng       *rand.Rand
}

func NewTriviaManager(path string) (*TriviaManager, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var questions []TriviaQuestion
	if err := json.Unmarshal(data, &questions); err != nil {
		return nil, err
	}
	if len(questions) == 0 {
		return nil, fmt.Errorf("no trivia questions loaded")
	}
	return &TriviaManager{
		bank:   questions,
		byRoom: make(map[string]*roomTrivia),
		rng:    rand.New(rand.NewSource(time.Now().UnixNano())),
	}, nil
}

func (tm *TriviaManager) roomActive(room string) bool {
	tm.mu.Lock()
	defer tm.mu.Unlock()
	rt, ok := tm.byRoom[room]
	return ok && rt.Active
}

func (tm *TriviaManager) AskOnce(room string, hub *Hub) error {
	return tm.start(room, hub, false)
}

func (tm *TriviaManager) Start(room string, hub *Hub) error {
	return tm.start(room, hub, true)
}

func (tm *TriviaManager) start(room string, hub *Hub, continuous bool) error {
	tm.mu.Lock()
	if rt, ok := tm.byRoom[room]; ok && rt.Active {
		tm.mu.Unlock()
		return fmt.Errorf("trivia already active in %s", room)
	}
	rt := &roomTrivia{
		Room:       room,
		Continuous: continuous,
		Scores:     make(map[string]int),
		stopCh:     make(chan struct{}),
		used:       make(map[int]struct{}),
		Active:     true,
	}
	tm.byRoom[room] = rt
	tm.mu.Unlock()

	go rt.run(hub, tm)
	return nil
}

func (tm *TriviaManager) Stop(room string, hub *Hub) {
	tm.mu.Lock()
	rt, ok := tm.byRoom[room]
	tm.mu.Unlock()
	if !ok || !rt.Active {
		return
	}
	rt.stop(hub, tm)
}

func (tm *TriviaManager) CheckAnswer(room, nick, text string, hub *Hub) bool {
	tm.mu.Lock()
	rt, ok := tm.byRoom[room]
	tm.mu.Unlock()
	if !ok || !rt.Active {
		return false
	}
	return rt.checkAnswer(nick, text, hub, tm)
}

func (tm *TriviaManager) ResyncClient(room string, c *Client, hub *Hub) {
	tm.mu.Lock()
	rt, ok := tm.byRoom[room]
	tm.mu.Unlock()
	if !ok || !rt.Active {
		return
	}
	rt.mu.Lock()
	defer rt.mu.Unlock()
	if rt.CurrentQ != "" {
		c.Send(ServerMessage{
			Type:     "trivia_question",
			Target:   TargetChat,
			Room:     room,
			Question: rt.CurrentQ,
		})
	}
	if rt.Continuous && len(rt.Scores) > 0 {
		c.Send(ServerMessage{
			Type:   "trivia_scores",
			Target: TargetChat,
			Room:   room,
			Scores: copyScores(rt.Scores),
		})
	}
}

func (tm *TriviaManager) pickQuestion(rt *roomTrivia) TriviaQuestion {
	tm.mu.Lock()
	defer tm.mu.Unlock()
	if len(rt.used) >= len(tm.bank) {
		rt.used = make(map[int]struct{})
	}
	for {
		idx := tm.rng.Intn(len(tm.bank))
		if _, seen := rt.used[idx]; !seen {
			rt.used[idx] = struct{}{}
			return tm.bank[idx]
		}
	}
}

func (rt *roomTrivia) run(hub *Hub, tm *TriviaManager) {
	for {
		select {
		case <-rt.stopCh:
			return
		default:
		}

		q := tm.pickQuestion(rt)
		rt.mu.Lock()
		rt.CurrentQ = fmt.Sprintf("[%s] %s", q.Category, q.Question)
		rt.Answer = strings.ToLower(strings.TrimSpace(q.Answer))
		rt.mu.Unlock()

		hub.broadcastRoom(rt.Room, ServerMessage{
			Type:     "trivia_question",
			Target:   TargetChat,
			Room:     rt.Room,
			Question: rt.CurrentQ,
		})

		if !rt.waitForAnswer(hub, tm) {
			rt.finish(hub, tm)
			return
		}

		if !rt.Continuous {
			rt.finish(hub, tm)
			return
		}

		select {
		case <-rt.stopCh:
			hub.broadcastRoom(rt.Room, ServerMessage{
				Type:   "chat",
				Target: TargetChat,
				Room:   rt.Room,
				Nick:   "*trivia*",
				Text:   "Trivia stopped.",
			})
			rt.finish(hub, tm)
			return
		case <-time.After(3 * time.Second):
		}
	}
}

func (rt *roomTrivia) waitForAnswer(hub *Hub, tm *TriviaManager) bool {
	deadline := time.After(triviaTimeout)
	ticker := time.NewTicker(200 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-rt.stopCh:
			return false
		case <-deadline:
			rt.mu.Lock()
			ans := rt.Answer
			rt.CurrentQ = ""
			rt.Answer = ""
			rt.mu.Unlock()
			hub.broadcastRoom(rt.Room, ServerMessage{
				Type:   "trivia_answer",
				Target: TargetChat,
				Room:   rt.Room,
				Answer: ans,
			})
			return true
		case <-ticker.C:
			rt.mu.Lock()
			done := rt.CurrentQ == ""
			rt.mu.Unlock()
			if done {
				return true
			}
		}
	}
}

func (rt *roomTrivia) checkAnswer(nick, text string, hub *Hub, tm *TriviaManager) bool {
	rt.mu.Lock()
	defer rt.mu.Unlock()
	if !rt.Active || rt.CurrentQ == "" {
		return false
	}
	if strings.ToLower(strings.TrimSpace(text)) != rt.Answer {
		return false
	}
	winner := nick
	ans := rt.Answer
	rt.Scores[nick]++
	rt.CurrentQ = ""
	rt.Answer = ""

	hub.broadcastRoom(rt.Room, ServerMessage{
		Type:   "trivia_answer",
		Target: TargetChat,
		Room:   rt.Room,
		Winner: winner,
		Answer: ans,
	})
	if rt.Continuous {
		hub.broadcastRoom(rt.Room, ServerMessage{
			Type:   "trivia_scores",
			Target: TargetChat,
			Room:   rt.Room,
			Scores: copyScores(rt.Scores),
		})
	}
	return true
}

func (rt *roomTrivia) stop(hub *Hub, tm *TriviaManager) {
	rt.mu.Lock()
	if !rt.Active {
		rt.mu.Unlock()
		return
	}
	rt.Active = false
	close(rt.stopCh)
	rt.mu.Unlock()
}

func (rt *roomTrivia) finish(hub *Hub, tm *TriviaManager) {
	rt.mu.Lock()
	rt.Active = false
	continuous := rt.Continuous
	scores := copyScores(rt.Scores)
	rt.mu.Unlock()

	tm.mu.Lock()
	delete(tm.byRoom, rt.Room)
	tm.mu.Unlock()

	if continuous && len(scores) > 0 {
		hub.broadcastRoom(rt.Room, ServerMessage{
			Type:   "trivia_scores",
			Target: TargetChat,
			Room:   rt.Room,
			Scores: scores,
		})
		hub.broadcastRoom(rt.Room, ServerMessage{
			Type:   "chat",
			Target: TargetChat,
			Room:   rt.Room,
			Nick:   "*trivia*",
			Text:   "Trivia game over.",
		})
	}
}

func copyScores(m map[string]int) map[string]int {
	out := make(map[string]int, len(m))
	for k, v := range m {
		out[k] = v
	}
	return out
}
