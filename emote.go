package main

import (
	"fmt"
	"sort"
	"strings"
)

var emoteTemplates = map[string]func(actor, target string) string{
	"slap": func(a, t string) string {
		return fmt.Sprintf("* %s slaps %s with a floppy disk.", a, t)
	},
	"hug": func(a, t string) string {
		return fmt.Sprintf("* %s hugs %s.", a, t)
	},
	"wave": func(a, t string) string {
		return fmt.Sprintf("* %s waves at %s.", a, t)
	},
	"punch": func(a, t string) string {
		return fmt.Sprintf("* %s punches %s in the chat log.", a, t)
	},
	"highfive": func(a, t string) string {
		return fmt.Sprintf("* %s high-fives %s.", a, t)
	},
	"dance": func(a, t string) string {
		return fmt.Sprintf("* %s does the victory dance around %s.", a, t)
	},
	"flip": func(a, t string) string {
		return fmt.Sprintf("* %s does a sick flip near %s.", a, t)
	},
	"toast": func(a, t string) string {
		return fmt.Sprintf("* %s toasts %s with a can of New Coke.", a, t)
	},
}

func emoteList() []string {
	names := make([]string, 0, len(emoteTemplates))
	for name := range emoteTemplates {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

func validateEmote(name string) bool {
	_, ok := emoteTemplates[strings.ToLower(strings.TrimSpace(name))]
	return ok
}

func formatEmote(name, actor, target string) (string, error) {
	fn, ok := emoteTemplates[strings.ToLower(strings.TrimSpace(name))]
	if !ok {
		return "", fmt.Errorf("unknown emote")
	}
	return fn(actor, target), nil
}

func nickMatchesMention(mention, memberNick string) bool {
	mention = strings.TrimSpace(mention)
	memberNick = strings.TrimSpace(memberNick)
	if mention == "" || memberNick == "" {
		return false
	}
	if strings.EqualFold(mention, memberNick) {
		return true
	}
	bang := strings.Index(memberNick, "!")
	if bang > 0 && strings.EqualFold(mention, memberNick[:bang]) {
		return true
	}
	return false
}

func resolveRoomMember(room *Room, target string) (string, bool) {
	target = strings.TrimSpace(target)
	if target == "" {
		return "", false
	}
	for _, nick := range room.MemberNickList() {
		if nickMatchesMention(target, nick) {
			return nick, true
		}
	}
	return "", false
}

func findMentions(text string, room *Room) []string {
	if room == nil || text == "" {
		return nil
	}
	members := room.MemberNickList()
	if len(members) == 0 {
		return nil
	}
	words := strings.Fields(text)
	seen := make(map[string]struct{})
	var out []string
	for _, word := range words {
		if !strings.HasPrefix(word, "@") || len(word) < 2 {
			continue
		}
		token := word[1:]
		token = strings.Trim(token, ".,!?;:")
		for _, nick := range members {
			if nickMatchesMention(token, nick) {
				if _, ok := seen[nick]; !ok {
					seen[nick] = struct{}{}
					out = append(out, nick)
				}
				break
			}
		}
	}
	return out
}
