# alertmanager-discord

1. Set LISTEN_ADDRESS environment variable (e.g. `127.0.0.1:9096`)
1. Set DISCORD_WEBHOOK environment variable
1. Configure an alertmanager receiver

```yaml
receivers:
- name: 'discord'
  slack_configs:
  - api_url: http://alertmanager-discord:9096
```