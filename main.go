package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"
)

func main() {
	port := envOr("PORT", "8080")
	baseURL := envOr("BASE_URL", "http://localhost:"+port)
	dataDir := envOr("DATA_DIR", "./data")

	db, err := OpenDB(dataDir)
	if err != nil {
		log.Fatal("db:", err)
	}
	defer db.Close()

	var trivia *TriviaManager
	triviaPath := filepath.Join(".", "trivia.json")
	if _, err := os.Stat(triviaPath); err == nil {
		trivia, err = NewTriviaManager(triviaPath)
		if err != nil {
			log.Println("trivia disabled:", err)
		}
	}

	hub := NewHub(db, trivia)
	go hub.Run()

	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})
	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		serveWS(hub, w, r)
	})

	webDir := filepath.Join(".", "web")
	if _, err := os.Stat(webDir); err == nil {
		fs := http.FileServer(http.Dir(webDir))
		mux.Handle("/", fs)
	}

	srv := &http.Server{
		Addr:              ":" + port,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		log.Printf("DoomChat II listening on :%s (%s)", port, baseURL)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal(err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
	log.Println("shutdown complete")
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
