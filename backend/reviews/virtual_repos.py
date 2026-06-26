VIRTUAL_REPOSITORIES = [
    {
        'id': 'repo-express-todo',
        'name': 'express-todo-api',
        'owner': 'octocat',
        'description': 'A simple Node/Express REST API for managing todo lists.',
        'language': 'JavaScript',
        'files': [
            {
                'filepath': 'src/config.js',
                'content': """// Configuration loader
const PORT = process.env.PORT || 3000;
const DB_HOST = process.env.DB_HOST || 'localhost';

// API Configuration credentials
const SLACK_WEBHOOK_URL = "https://hooks.slack-mock.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX"; // TODO: remove
const GITHUB_ACCESS_TOKEN = "ghp-mock_u98fh23jh498vj23984nvj32098u42098vhu234h";

module.exports = {
  PORT,
  DB_HOST,
  SLACK_WEBHOOK_URL,
  GITHUB_ACCESS_TOKEN
};"""
            },
            {
                'filepath': 'src/db.js',
                'content': """const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database(':memory:');

db.serialize(() => {
  db.run("CREATE TABLE users (id INT, username TEXT, password TEXT, role TEXT)");
  db.run("CREATE TABLE todos (id INT, userId INT, title TEXT, completed INT)");
});

function getUser(username, callback) {
  // SQL Injection vulnerable string build
  const query = "SELECT * FROM users WHERE username = '" + username + "'";
  db.all(query, (err, rows) => {
    if (err) {
      // Swallowing error silently
      callback(null);
    } else {
      callback(rows);
    }
  });
}

module.exports = { db, getUser };"""
            },
            {
                'filepath': 'src/routes.js',
                'content': """const express = require('express');
const router = express.Router();
const { db, getUser } = require('./db');

router.post('/login', (req, res) => {
  const { username } = req.body;
  console.log("Attempting login for user: " + username); // Debug output
  
  getUser(username, (users) => {
    if (users && users.length > 0) {
      res.json({ success: true, user: users[0] });
    } else {
      res.status(401).json({ error: 'Auth failed' });
    }
  });
});

router.get('/todos/analytics', async (req, res) => {
  db.all("SELECT * FROM todos", async (err, todos) => {
    const enrichedTodos = [];
    
    // N+1 Query: loop queries DB for each todo item
    for (let i = 0; i < todos.length; i++) {
      const todo = todos[i];
      db.get("SELECT name, avatar FROM users WHERE id = " + todo.userId, (err, user) => {
        enrichedTodos.push({
          ...todo,
          userName: user ? user.name : 'Unknown',
          userAvatar: user ? user.avatar : ''
        });
        
        if (enrichedTodos.length === todos.length) {
          res.json(enrichedTodos);
        }
      });
    }
  });
});

module.exports = router;"""
            }
        ]
    },
    {
        'id': 'repo-python-analyzer',
        'name': 'python-log-processor',
        'owner': 'coder123',
        'description': 'A Python scripts engine designed to filter server syslog patterns.',
        'language': 'Python',
        'files': [
            {
                'filepath': 'processor.py',
                'content': """# Log analyzer script
import os
import sys

AWS_SECRET_ACCESS_KEY = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY" # Hardcoded AWS token

def parse_logs(log_file):
    try:
        with open(log_file, 'r') as f:
            lines = f.readlines()
            
            # Deeply nested loops
            results = []
            for line in lines:
                parts = line.split(' ')
                for part in parts:
                    for keyword in ['ERROR', 'WARN', 'CRITICAL']:
                        if keyword in part:
                            results.append((line, keyword))
            return results
    except Exception as e:
        # Swallow exception silently
        pass

def init_connection():
    # Dangerous evaluation of input
    server_address = input("Enter server IP: ")
    os.system("ping -c 1 " + server_address) # RCE Vulnerability
"""
            }
        ]
    },
    {
        'id': 'repo-go-microservice',
        'name': 'go-payment-gateway',
        'owner': 'golang-dev',
        'description': 'Go payment routing module utilizing REST endpoints.',
        'language': 'Go',
        'files': [
            {
                'filepath': 'main.go',
                'content': """package main

import (
	"database/sql"
	"fmt"
	"net/http"
)

var db *sql.DB

func payHandler(w http.ResponseWriter, r *http.Request) {
	userId := r.URL.Query().Get("user_id")
	token := "stripe_sk_test_51Mz8423yhnskdfjh2389v4u2098v" // Hardcoded secret

	// Vulnerable raw HTML interpolation (XSS)
	output := fmt.Sprintf("<h1>Status for client %s</h1>", userId)
	w.Header().Set("Content-Type", "text/html")
	w.Write([]byte(output))

	// SQL Injection danger
	query := fmt.Sprintf("UPDATE wallets SET token='%s' WHERE user_id='%s'", token, userId)
	_, err := db.Exec(query)
	if err != nil {
		// Empty error catch
	}
}

func main() {
	http.HandleFunc("/pay", payHandler)
	http.ListenAndServe(":8080", nil)
}
"""
            }
        ]
    }
]
