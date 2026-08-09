package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"time"

	"github.com/joho/godotenv"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// 1. UPDATED: Added Notes for Feature 6
type TierList struct {
	ID         uint   `gorm:"primaryKey" json:"id"`
	Name       string `json:"name"`
	Notes      string `json:"notes"` // <--- NEW FIELD
	OrderIndex int    `json:"order_index"`
}

type Item struct {
	ID         string `gorm:"primaryKey" json:"id"`
	Label      string `json:"label"`
	Image      string `json:"image"`
	Tier       string `json:"tier"`
	TierListID uint   `json:"tier_list_id"`
}

type TierRow struct {
	ID         string `gorm:"primaryKey" json:"id"`
	Label      string `json:"label"`
	Color      string `json:"color"`
	OrderIndex int    `json:"order_index"`
	TierListID uint   `json:"tier_list_id"`
}

func enableCORS(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, DELETE")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		next(w, r)
	}
}

func generateDefaultTiers(db *gorm.DB, listID uint) {
	baseID := fmt.Sprintf("tier-%d-%d", listID, time.Now().Unix())
	defaults := []TierRow{
		{ID: baseID + "-s", Label: "S", Color: "bg-red-500", OrderIndex: 0, TierListID: listID},
		{ID: baseID + "-a", Label: "A", Color: "bg-orange-500", OrderIndex: 1, TierListID: listID},
		{ID: baseID + "-b", Label: "B", Color: "bg-yellow-500", OrderIndex: 2, TierListID: listID},
		{ID: baseID + "-c", Label: "C", Color: "bg-green-500", OrderIndex: 3, TierListID: listID},
		{ID: baseID + "-d", Label: "D", Color: "bg-blue-500", OrderIndex: 4, TierListID: listID},
	}
	for _, tier := range defaults {
		db.Create(&tier)
	}
}

func main() {
	err := godotenv.Load()
	if err != nil {
		fmt.Println("Warning: No .env file found.")
	}

	dbPassword := os.Getenv("DB_PASSWORD")
	if dbPassword == "" {
		panic("CRITICAL ERROR: DB_PASSWORD is empty! Check your .env file.")
	}

	dsn := fmt.Sprintf("host=127.0.0.1 user=tieradmin password=%s dbname=tierlistdb port=5433 sslmode=disable", dbPassword)
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		panic("Failed to connect to database: " + err.Error())
	}
	fmt.Println("Successfully connected to PostgreSQL securely!")

	db.AutoMigrate(&TierList{}, &Item{}, &TierRow{})
	fmt.Println("Database tables synced!")

	// ENDPOINT: Lists (GET all, and DELETE)
	http.HandleFunc("/api/lists", enableCORS(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "GET" {
			var lists []TierList
			db.Order("order_index asc").Find(&lists)
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(lists)
		} else if r.Method == "DELETE" {
			listID := r.URL.Query().Get("id")
			db.Where("tier_list_id = ?", listID).Delete(&Item{})
			db.Where("tier_list_id = ?", listID).Delete(&TierRow{})
			db.Delete(&TierList{}, "id = ?", listID)
			w.WriteHeader(http.StatusOK)
		}
	}))

	// --- NEW ENDPOINT: Fetch a Single List (For Editor Title/Notes) ---
	http.HandleFunc("/api/lists/single", enableCORS(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "GET" {
			listID := r.URL.Query().Get("id")
			var list TierList
			db.First(&list, listID)
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(list)
		}
	}))

	// --- NEW ENDPOINT: Update a List (Rename Title or Save Notes) ---
	http.HandleFunc("/api/lists/update", enableCORS(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "POST" {
			var updatedList TierList
			json.NewDecoder(r.Body).Decode(&updatedList)
			db.Save(&updatedList)
			w.WriteHeader(http.StatusOK)
		}
	}))

	// ENDPOINT: Create New List (Spawns at TOP)
	http.HandleFunc("/api/lists/new", enableCORS(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "POST" {
			var newList TierList
			json.NewDecoder(r.Body).Decode(&newList)

			// Push all existing lists down by 1
			db.Exec("UPDATE tier_lists SET order_index = order_index + 1")

			newList.OrderIndex = 0 // Spawn at the top
			db.Create(&newList)
			generateDefaultTiers(db, newList.ID)
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(newList)
		}
	}))

	// ENDPOINT: Save Drag-and-Drop Reordered Lists
	http.HandleFunc("/api/lists/bulk", enableCORS(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "POST" {
			var lists []TierList
			json.NewDecoder(r.Body).Decode(&lists)
			for _, list := range lists {
				db.Save(&list)
			}
			w.WriteHeader(http.StatusOK)
		}
	}))

	// ENDPOINT: Fetch/Delete Tiers
	http.HandleFunc("/api/tiers", enableCORS(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "GET" {
			listID := r.URL.Query().Get("list_id")
			if listID == "" {
				w.Header().Set("Content-Type", "application/json")
				json.NewEncoder(w).Encode([]TierRow{})
				return
			}
			var tiers []TierRow
			db.Where("tier_list_id = ?", listID).Order("order_index asc").Find(&tiers)
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(tiers)
		} else if r.Method == "DELETE" {
			tierID := r.URL.Query().Get("id")
			db.Model(&Item{}).Where("tier = ?", tierID).Update("tier", "pool")
			db.Delete(&TierRow{}, "id = ?", tierID)
			w.WriteHeader(http.StatusOK)
		}
	}))

	// ENDPOINT: Create Tier (Spawns at BOTTOM)
	http.HandleFunc("/api/tiers/new", enableCORS(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "POST" {
			var newTier TierRow
			json.NewDecoder(r.Body).Decode(&newTier)

			var count int64
			db.Model(&TierRow{}).Where("tier_list_id = ?", newTier.TierListID).Count(&count)
			newTier.OrderIndex = int(count) // Sets index to bottom

			db.Create(&newTier)
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(newTier)
		}
	}))

	http.HandleFunc("/api/tiers/update", enableCORS(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "POST" {
			var updatedTier TierRow
			json.NewDecoder(r.Body).Decode(&updatedTier)
			db.Save(&updatedTier)
			w.WriteHeader(http.StatusOK)
		}
	}))

	http.HandleFunc("/api/tiers/bulk", enableCORS(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "POST" {
			var tiers []TierRow
			json.NewDecoder(r.Body).Decode(&tiers)
			for _, t := range tiers {
				db.Save(&t)
			}
			w.WriteHeader(http.StatusOK)
		}
	}))

	// ENDPOINT: Items
	http.HandleFunc("/api/items", enableCORS(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "GET" {
			listID := r.URL.Query().Get("list_id")
			var items []Item
			if listID != "" {
				db.Where("tier_list_id = ?", listID).Find(&items)
			} else {
				w.Header().Set("Content-Type", "application/json")
				json.NewEncoder(w).Encode([]Item{})
				return
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(items)
		} else if r.Method == "DELETE" {
			itemID := r.URL.Query().Get("id")
			db.Delete(&Item{}, "id = ?", itemID)
			w.WriteHeader(http.StatusOK)
		}
	}))

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

	fmt.Println("Server is starting on port 8085...")
	err = http.ListenAndServe(":8085", nil)
	if err != nil {
		fmt.Println("Server failed:", err)
	}
}
