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

type TierList struct {
	ID   uint   `gorm:"primaryKey" json:"id"`
	Name string `json:"name"`
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

	// ENDPOINT: Lists (Now handles GET and DELETE)
	http.HandleFunc("/api/lists", enableCORS(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "GET" {
			var lists []TierList
			db.Order("id asc").Find(&lists)
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(lists)
		} else if r.Method == "DELETE" {
			// NEW: Handle Deleting entire lists
			listID := r.URL.Query().Get("id")

			// 1. Delete all items inside the list
			db.Where("tier_list_id = ?", listID).Delete(&Item{})
			// 2. Delete all tier rows inside the list
			db.Where("tier_list_id = ?", listID).Delete(&TierRow{})
			// 3. Finally, delete the list itself
			db.Delete(&TierList{}, "id = ?", listID)

			w.WriteHeader(http.StatusOK)
		}
	}))

	// ENDPOINT: Create List
	http.HandleFunc("/api/lists/new", enableCORS(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "POST" {
			var newList TierList
			json.NewDecoder(r.Body).Decode(&newList)
			db.Create(&newList)
			generateDefaultTiers(db, newList.ID)
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(newList)
		}
	}))

	// ENDPOINT: Fetch Tiers
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
		}
	}))

	// NEW ENDPOINT: Add a Brand New Tier Row
	http.HandleFunc("/api/tiers/new", enableCORS(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "POST" {
			var newTier TierRow
			json.NewDecoder(r.Body).Decode(&newTier)

			// Figure out what OrderIndex to give it so it goes to the bottom
			var count int64
			db.Model(&TierRow{}).Where("tier_list_id = ?", newTier.TierListID).Count(&count)
			newTier.OrderIndex = int(count)

			db.Create(&newTier)
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(newTier)
		}
	}))

	// ENDPOINT: Update a Tier
	http.HandleFunc("/api/tiers/update", enableCORS(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "POST" {
			var updatedTier TierRow
			json.NewDecoder(r.Body).Decode(&updatedTier)
			db.Save(&updatedTier)
			w.WriteHeader(http.StatusOK)
		}
	}))

	// ENDPOINT: Items
	http.HandleFunc("/api/items", enableCORS(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "GET" {
			listID := r.URL.Query().Get("list_id")
			var items []Item

			// FIX: Safety net!
			if listID != "" {
				db.Where("tier_list_id = ?", listID).Find(&items)
			} else {
				// Don't fetch everything if the ID is blank, just return empty
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
