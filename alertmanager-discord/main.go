package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"io"
	"io/ioutil"
	"log"
	"net/http"
	"net/url"
	"os"
	"regexp"
)

// Discord color values
const (
	ColorRed   = 10038562
	ColorGreen = 3066993
	ColorGrey  = 9807270
)

type alertManagerData struct {
	Username    string                   `json:"username"`
	Attachments []alertManagerAttachment `json:"attachments"`
}

type alertManagerAttachment struct {
	Title string `json:"title"`
}

const defaultListenAddress = "127.0.0.1:9095"

func main() {
	envWhURL := os.Getenv("DISCORD_WEBHOOK")
	whURL := flag.String("webhook.url", envWhURL, "Discord WebHook URL.")

	envListenAddress := os.Getenv("LISTEN_ADDRESS")
	listenAddress := flag.String("listen.address", envListenAddress, "Address:Port to listen on.")

	flag.Parse()

	if *whURL == "" {
		log.Fatalf("Environment variable 'DISCORD_WEBHOOK' or CLI parameter 'webhook.url' not found.")
	}

	if *listenAddress == "" {
		*listenAddress = defaultListenAddress
	}

	_, err := url.Parse(*whURL)
	if err != nil {
		log.Fatalf("The Discord WebHook URL doesn't seem to be a valid URL.")
	}

	re := regexp.MustCompile(`https://discord(?:app)?.com/api/webhooks/[0-9]{18}/[a-zA-Z0-9_-]+`)
	if ok := re.Match([]byte(*whURL)); !ok {
		log.Printf("The Discord WebHook URL doesn't seem to be valid.")
	}

	log.Printf("Listening on: %s", *listenAddress)
	http.ListenAndServe(*listenAddress, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		log.Printf("Received request")
		requestBody, err := ioutil.ReadAll(r.Body)
		if err != nil {
			panic(err)
		} else {
			log.Printf("Payload: %s", requestBody)
		}

		data := alertManagerData{}
		err = json.Unmarshal(requestBody, &data)
		if err != nil {
			panic(err)
		}

		postBody, _ := json.Marshal(map[string][]alertManagerAttachment{
			"embeds": data.Attachments,
		})
		payload := bytes.NewBuffer(postBody)
		handlePost(*whURL, payload)

		// testBody, _ := json.Marshal(map[string]string{
		// 	"content": "Testy test test",
		// })
		// testPayload := bytes.NewBuffer(testBody)
		// handlePost(*whURL, testPayload)
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
