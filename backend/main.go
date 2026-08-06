package main

import (
	"encoding/json"
	"fmt"
	"net/http"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

type TierList struct {
	ID   uint   `gorm:"primaryKey" json:"id"`
	Name string `json:"name"`
}

type Item struct {
	ID         string `gorm:"primaryKey" json:"id"`
	Label      string `json:"label"`
	Tier       string `json:"tier"`
	TierListID uint   `json:"tier_list_id"`
}

func enableCORS(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
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

	db.AutoMigrate(&TierList{}, &Item{})
	fmt.Println("Database tables synced!")

	var count int64
	db.Model(&TierList{}).Count(&count)
	if count == 0 {
		db.Create(&TierList{Name: "Global Tier List"})
		fmt.Println("Created default Global Tier List!")
	}

	// ENDPOINT 1: Fetch all Tier Lists
	http.HandleFunc("/api/lists", enableCORS(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "GET" {
			var lists []TierList
			db.Order("id asc").Find(&lists)
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(lists)
		}
	}))

	// ENDPOINT 2: Fetch items for a specific list
	http.HandleFunc("/api/items", enableCORS(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "GET" {
			listID := r.URL.Query().Get("list_id")
			var items []Item
			if listID != "" {
				db.Where("tier_list_id = ?", listID).Find(&items)
			} else {
				db.Find(&items)
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(items)
		}
	}))

	// ENDPOINT 3: Save items
	http.HandleFunc("/api/items/bulk", enableCORS(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "POST" {
			var items []Item
			json.NewDecoder(r.Body).Decode(&items)
			for _, item := range items {
				db.Save(&item)
			}
			w.WriteHeader(http.StatusOK)
		}
	}))

	// ENDPOINT 4: Create a NEW Tier List (NEW!)
	http.HandleFunc("/api/lists/new", enableCORS(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "POST" {
			var newList TierList
			json.NewDecoder(r.Body).Decode(&newList)

			// db.Create automatically generates a new unique ID in Postgres
			db.Create(&newList)

			// Send the newly created list (with its new ID) back to React
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(newList)
		}
	}))

	fmt.Println("Server is starting on port 8085...")
	err = http.ListenAndServe(":8085", nil)
	if err != nil {
		fmt.Println("Server failed:", err)
	}
}
