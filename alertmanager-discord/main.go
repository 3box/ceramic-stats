package main

import (
	"bytes"
	"encoding/json"
	"io"
	"io/ioutil"
	"log"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
)

// Discord color values
const (
	ColorRed   = 10038562
	ColorGreen = 3066993
	ColorGrey  = 9807270
)

type discordMessage struct {
	Username string         `json:"username"`
	Embeds   []discordEmbed `json:"embeds"`
}

type discordEmbed struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	Color       int    `json:"color"`
}

type alertManagerData struct {
	Username    string                   `json:"username"`
	Attachments []alertManagerAttachment `json:"attachments"`
}

type alertManagerAttachment struct {
	Title string `json:"title"`
	Text  string `json:"text"`
	Color string `json:"color"`
}

const defaultListenAddress = "127.0.0.1:9096"

func main() {
	env := os.Getenv("ENV")
	discordWebhookUrl := os.Getenv("DISCORD_WEBHOOK")
	listenAddress := os.Getenv("LISTEN_ADDRESS")

	if env == "" {
		env = "DEV"
	} else {
		env = strings.ToUpper(env)
	}

	if discordWebhookUrl == "" {
		log.Fatalf("Environment variable 'DISCORD_WEBHOOK' not found.")
	}
	_, err := url.Parse(discordWebhookUrl)
	if err != nil {
		log.Fatalf("Invalid url for DISCORD_WEBHOOK.")
	}
	re := regexp.MustCompile(`https://discord(?:app)?.com/api/webhooks/[0-9]{18}/[a-zA-Z0-9_-]+`)
	if ok := re.Match([]byte(discordWebhookUrl)); !ok {
		log.Printf("Invalid url for DISCORD_WEBHOOK.")
	}

	if listenAddress == "" {
		listenAddress = defaultListenAddress
	}
	log.Printf("Listening on: %s", listenAddress)
	http.ListenAndServe(listenAddress, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		log.Printf("Received request")
		requestBody, err := ioutil.ReadAll(r.Body)
		if err != nil {
			panic(err)
		} else {
			log.Printf("Request body: %s", requestBody)
		}

		data := alertManagerData{}
		err = json.Unmarshal(requestBody, &data)
		if err != nil {
			panic(err)
		}

		var embeds []discordEmbed
		for _, obj := range data.Attachments {
			var color = ColorGreen
			if obj.Color == "danger" {
				color = ColorRed
			}
			embed := discordEmbed{
				env + " " + obj.Title,
				obj.Text,
				color,
			}
			embeds = append(embeds, embed)
		}

		message := discordMessage{
			data.Username,
			embeds,
		}

		responseBody, _ := json.Marshal(message)
		log.Printf("Response body: %s", responseBody)
		payload := bytes.NewBuffer(responseBody)
		handlePost(discordWebhookUrl, payload)
	}))
}

func handlePost(postUrl string, body io.Reader) {
	resp, err := http.Post(postUrl, "application/json", body)
	if err != nil {
		log.Fatalf("Post response error %v", err)
	}
	defer resp.Body.Close()
	respBody, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		log.Fatalln("Post response error", err)
	} else {
		sb := string(respBody)
		log.Printf(sb)
	}
}
