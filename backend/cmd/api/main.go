package main

import (
	"log"
	"sharedspace/internal/server"
)

func main() {
	router := server.NewRouter()

	if err := server.New("8080", router).Run(); err != nil {
		log.Fatalf("server: %v", err)
	}
}
