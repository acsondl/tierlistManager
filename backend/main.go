package main

import (
	"fmt"
	"net/http"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// 1. Define your data structure
// GORM will automatically translate this into a SQL table named "tier_lists"
type TierList struct {
	ID   uint `gorm:"primaryKey"`
	Name string
}

func helloHandler(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, "Hello from your Go Backend connected to Postgres!")
}

func main() {
	// 2. The Connection String (Data Source Name)
	// IMPORTANT: Replace 'your_secure_password_here' with your actual Bitwarden password!
	dsn := "host=127.0.0.1 user=tieradmin password=YOURPASSWORD dbname=tierlistdb port=5433 sslmode=disable"

	// 3. Open the connection to Postgres
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		// panic() immediately crashes the program and prints the error
		panic("Failed to connect to database: " + err.Error())
	}
	fmt.Println("Successfully connected to PostgreSQL!")

	// 4. AutoMigrate creates the tables in the database if they don't exist
	db.AutoMigrate(&TierList{})
	fmt.Println("Database tables synced!")

	// 5. Start the web server
	http.HandleFunc("/", helloHandler)
	fmt.Println("Server is starting on port 8085...")

	err = http.ListenAndServe(":8085", nil)
	if err != nil {
		fmt.Println("Server failed:", err)
	}
}
