package main

import (
	"encoding/json"
	"fmt"
	"net/http"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// 1. The Data Structure (Matches your React frontend!)
// The `json:"..."` tags tell Go how to translate React's lowercase variables into Go's capitalized variables
type Item struct {
	ID    string `gorm:"primaryKey" json:"id"`
	Label string `json:"label"`
	Tier  string `json:"tier"`
}

// 2. CORS Middleware (Security Bypass)
// This tells the browser: "It is okay for Port 5173 to send data to Port 8085"
func enableCORS(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		// Handle preflight requests (the browser checking if it has permission before sending the real data)
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		next(w, r)
	}
}

func main() {
	// IMPORTANT: Put your Bitwarden password back here!
	dsn := "host=127.0.0.1 user=tieradmin password=yourpassword dbname=tierlistdb port=5433 sslmode=disable"

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		panic("Failed to connect to database: " + err.Error())
	}
	fmt.Println("Successfully connected to PostgreSQL!")

	// 3. Create the Items table in Postgres
	db.AutoMigrate(&Item{})
	fmt.Println("Database tables synced!")

	// 4. API Endpoints

	// GET Route: React asks for all items on page load
	http.HandleFunc("/api/items", enableCORS(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "GET" {
			var items []Item
			db.Find(&items) // Grabs every item from the database

			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(items) // Converts Go data to JSON and sends it to React
		}
	}))

	// POST Route: React sends the entire updated array to save
	http.HandleFunc("/api/items/bulk", enableCORS(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "POST" {
			var items []Item
			json.NewDecoder(r.Body).Decode(&items)

			// db.Save() is smart: If the ID already exists, it updates it. If it's a new ID, it creates it.
			for _, item := range items {
				db.Save(&item)
			}

			w.WriteHeader(http.StatusOK)
		}
	}))

	fmt.Println("Server is starting on port 8085...")
	err = http.ListenAndServe(":8085", nil)
	if err != nil {
		fmt.Println("Server failed:", err)
	}
}
